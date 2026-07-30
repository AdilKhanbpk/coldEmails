import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { parseFile } from '@/lib/parse-file';
import { scheduleJob, convertToUTC } from '@/lib/scheduler';

const STANDARD_FIELDS = [
  'companyName',
  'email',
  'services',
  'country',
  'website',
  'outreachDescription',
  'preferredTime',
  'timezone',
] as const;

type StandardField = (typeof STANDARD_FIELDS)[number];

interface ImportBody {
  fileName: string;
  fileContent: string; // base64-encoded for CSV, or base64 for Excel
  mapping: Record<string, StandardField | 'ignore'>;
  outreachTypeId: string;
  duplicateMode: 'skip' | 'update';
}

interface ValidRow {
  companyName: string;
  email: string;
  services: string[];
  country: string;
  website: string;
  outreachDescription: string;
  preferredTime: Date;
  timezone: string;
}

interface InvalidRow {
  rowIndex: number;
  reason: string;
  data: Record<string, string>;
}

interface DuplicateRow {
  rowIndex: number;
  existingLeadId: string;
  data: Record<string, string>;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as ImportBody;
    const { fileName, mapping, outreachTypeId, duplicateMode } = body;

    if (!fileName || !body.fileContent) {
      return NextResponse.json({ error: 'File is required.' }, { status: 400 });
    }
    if (!outreachTypeId) {
      return NextResponse.json({ error: 'An outreach type is required for import.' }, { status: 400 });
    }

    // Verify outreach type belongs to user
    const outreachType = await prisma.outreachType.findFirst({
      where: { id: outreachTypeId, userId: session.user.id },
    });
    if (!outreachType) {
      return NextResponse.json({ error: 'Invalid outreach type.' }, { status: 400 });
    }

    // Decode file content from base64
    const fileBuffer = Buffer.from(body.fileContent, 'base64');
    const parsed = parseFile(fileName, fileBuffer);

    if (parsed.rows.length === 0) {
      return NextResponse.json({ error: 'No rows found in file.' }, { status: 400 });
    }

    // Build a reverse mapping: standardField -> fileColumn
    const fieldToColumn: Partial<Record<StandardField, string>> = {};
    for (const [column, field] of Object.entries(mapping)) {
      if (field !== 'ignore') {
        fieldToColumn[field as StandardField] = column;
      }
    }

    // Validate that required fields are mapped
    if (!fieldToColumn.companyName) {
      return NextResponse.json({ error: 'Company name column must be mapped.' }, { status: 400 });
    }
    if (!fieldToColumn.email) {
      return NextResponse.json({ error: 'Email column must be mapped.' }, { status: 400 });
    }

    const validRows: ValidRow[] = [];
    const invalidRows: InvalidRow[] = [];
    const duplicateRows: DuplicateRow[] = [];

    // Collect all emails for batch duplicate check
    const allEmails = parsed.rows.map((row) => {
      const col = fieldToColumn.email!;
      return row[col]?.trim().toLowerCase() || '';
    }).filter(Boolean);

    const existingLeads = await prisma.userLead.findMany({
      where: {
        userId: session.user.id,
        email: { in: allEmails },
      },
      select: { id: true, email: true },
    });
    const existingEmailMap = new Map(existingLeads.map((l) => [l.email, l.id]));

    for (let i = 0; i < parsed.rows.length; i++) {
      const row = parsed.rows[i];
      const get = (field: StandardField): string => {
        const col = fieldToColumn[field];
        return col ? (row[col] || '').trim() : '';
      };

      const companyName = get('companyName');
      const email = get('email').toLowerCase();
      const servicesStr = get('services');
      const country = get('country');
      const website = get('website');
      const outreachDescription = get('outreachDescription');
      const preferredTimeStr = get('preferredTime');
      const timezone = get('timezone') || 'UTC';

      // Validate
      if (!companyName) {
        invalidRows.push({ rowIndex: i + 1, reason: 'Missing company name', data: row });
        continue;
      }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        invalidRows.push({ rowIndex: i + 1, reason: 'Invalid or missing email', data: row });
        continue;
      }

      // Parse preferredTime
      let preferredTime: Date;
      if (preferredTimeStr) {
        const parsed = new Date(preferredTimeStr);
        if (isNaN(parsed.getTime())) {
          preferredTime = new Date(); // fallback
        } else {
          preferredTime = parsed;
        }
      } else {
        preferredTime = new Date();
      }

      const validRow: ValidRow = {
        companyName,
        email,
        services: servicesStr ? servicesStr.split(/[,;]/).map((s) => s.trim()).filter(Boolean) : [],
        country,
        website,
        outreachDescription,
        preferredTime,
        timezone,
      };

      // Duplicate check
      const existingId = existingEmailMap.get(email);
      if (existingId) {
        duplicateRows.push({ rowIndex: i + 1, existingLeadId: existingId, data: row });
        if (duplicateMode === 'skip') {
          continue;
        }
        // For update mode, we'll handle it in the import batch
      }

      validRows.push(validRow);
    }

    // Perform the import — process in chunks to avoid blocking on large files.
    // This runs as an async server action; true job-queue workers arrive in stage 3.
    const CHUNK_SIZE = 50;
    let imported = 0;
    let updated = 0;

    for (let i = 0; i < validRows.length; i += CHUNK_SIZE) {
      const chunk = validRows.slice(i, i + CHUNK_SIZE);

      if (duplicateMode === 'update') {
        for (const row of chunk) {
          const existing = existingEmailMap.get(row.email);
          if (existing) {
            await prisma.userLead.update({
              where: { id: existing },
              data: {
                companyName: row.companyName,
                services: row.services,
                country: row.country,
                website: row.website || null,
                outreachDescription: row.outreachDescription,
                preferredTime: row.preferredTime,
                timezone: row.timezone,
                outreachTypeId,
                source: fileName.toLowerCase().endsWith('.xlsx') || fileName.toLowerCase().endsWith('.xls') ? 'CSV' : 'CSV',
              },
            });
            updated++;
          } else {
            const newLead = await prisma.userLead.create({
              data: {
                userId: session.user.id,
                companyName: row.companyName,
                email: row.email,
                services: row.services,
                country: row.country,
                website: row.website || null,
                outreachDescription: row.outreachDescription,
                preferredTime: row.preferredTime,
                timezone: row.timezone,
                outreachTypeId,
                source: 'CSV',
              },
            });
            const utcRunAt = convertToUTC(row.preferredTime, row.timezone);
            await scheduleJob(newLead.id, session.user.id, 'send_first_email', utcRunAt);
            imported++;
          }
        }
      } else {
        // Skip duplicates — only create new
        const newRows = chunk.filter((r) => !existingEmailMap.has(r.email));
        if (newRows.length > 0) {
          for (const r of newRows) {
            const newLead = await prisma.userLead.create({
              data: {
                userId: session.user.id,
                companyName: r.companyName,
                email: r.email,
                services: r.services,
                country: r.country,
                website: r.website || null,
                outreachDescription: r.outreachDescription,
                preferredTime: r.preferredTime,
                timezone: r.timezone,
                outreachTypeId,
                source: 'CSV' as const,
              },
            });
            const utcRunAt = convertToUTC(r.preferredTime, r.timezone);
            await scheduleJob(newLead.id, session.user.id, 'send_first_email', utcRunAt);
          }
          imported += newRows.length;
        }
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        totalRows: parsed.rows.length,
        valid: validRows.length,
        invalid: invalidRows.length,
        duplicates: duplicateRows.length,
        imported,
        updated,
      },
      invalidRows: invalidRows.slice(0, 100),
      duplicateRows: duplicateRows.slice(0, 100),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to import.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
