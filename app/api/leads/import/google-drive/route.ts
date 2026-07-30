import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { parseFile } from '@/lib/parse-file';

// Google Drive import: fetches a file from the user's Google Drive and runs it
// through the same parsing pipeline as CSV/Excel uploads. The file content is
// returned as base64 so the client can send it to /api/leads/import with the
// same mapping/validation/duplicate-check pipeline.
//
// Prerequisites:
// - GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured in .env
// - The user must have signed in with Google (the access token comes from the
//   NextAuth session's account access_token)
// - The Google Drive API scope (drive.file) must be requested during OAuth
//
// If the file was deleted or permission was revoked, we return a clear error
// instead of a silently empty import.

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const fileId = searchParams.get('fileId');
    const authHeader = req.headers.get('authorization');
    const accessToken = authHeader?.replace('Bearer ', '');

    if (!fileId) {
      return NextResponse.json({ error: 'File ID is required.' }, { status: 400 });
    }
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Google access token is required. Please connect your Google account.' },
        { status: 401 },
      );
    }

    // Fetch file metadata to get the name and mime type
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (metaRes.status === 404) {
      return NextResponse.json(
        { error: 'File not found. It may have been deleted or you may not have access.' },
        { status: 404 },
      );
    }
    if (metaRes.status === 401 || metaRes.status === 403) {
      return NextResponse.json(
        { error: 'Permission denied. Please reconnect your Google account with Drive access.' },
        { status: 403 },
      );
    }
    if (!metaRes.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch file from Google Drive.' },
        { status: 500 },
      );
    }

    const meta = await metaRes.json();
    const fileName: string = meta.name || 'drive-import.csv';
    const mimeType: string = meta.mimeType || '';

    // Fetch the file content
    const contentRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!contentRes.ok) {
      return NextResponse.json(
        { error: 'Failed to download file content from Google Drive.' },
        { status: 500 },
      );
    }

    const arrayBuffer = await contentRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Parse the file using the same parser as CSV/Excel uploads
    let parsed;
    try {
      parsed = parseFile(fileName, buffer);
    } catch {
      // Google Sheets exports as different mime types — try forcing CSV parse
      const content = buffer.toString('utf-8');
      parsed = parseFile('import.csv', content);
    }

    if (parsed.rows.length === 0) {
      return NextResponse.json(
        { error: 'No rows found in the Google Drive file.' },
        { status: 400 },
      );
    }

    return NextResponse.json({
      fileName,
      headers: parsed.headers,
      rowCount: parsed.rows.length,
      sampleRows: parsed.rows.slice(0, 5),
      fileContent: buffer.toString('base64'),
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to import from Google Drive. Please try again.' },
      { status: 500 },
    );
  }
}
