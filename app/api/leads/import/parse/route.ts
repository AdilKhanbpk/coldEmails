import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { parseFile } from '@/lib/parse-file';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'File too large (max 10MB).' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseFile(file.name, buffer);

    if (parsed.rows.length === 0) {
      return NextResponse.json({ error: 'No rows found in file.' }, { status: 400 });
    }

    return NextResponse.json({
      fileName: file.name,
      headers: parsed.headers,
      rowCount: parsed.rows.length,
      sampleRows: parsed.rows.slice(0, 5),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to parse file.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
