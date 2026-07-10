import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';
import path from 'path';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

const ALLOWED_EXTS = new Set(['.csv', '.xlsx', '.xls']);
const MAX_BYTES = 50 * 1024 * 1024;

type ColumnType = 'number' | 'date' | 'boolean' | 'string';
interface ColumnSchema { name: string; type: ColumnType }
interface ParsedDataset { columns: ColumnSchema[]; rowCount: number }

function serializeCookie(name: string, value: string, opts: CookieOptions = {}): string {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  parts.push(`Path=${opts.path ?? '/'}`);
  if (opts.expires instanceof Date) parts.push(`Expires=${opts.expires.toUTCString()}`);
  if (opts.httpOnly) parts.push('HttpOnly');
  if (opts.secure) parts.push('Secure');
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  return parts.join('; ');
}

async function getSessionUser(req: NextApiRequest, res: NextApiResponse) {
  const cookies: string[] = [];
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return Object.entries(req.cookies).map(([name, value]) => ({ name, value: value ?? '' }));
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookies.push(serializeCookie(name, value, options));
          });
        },
      },
    }
  );
  if (cookies.length > 0) res.setHeader('Set-Cookie', cookies);
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

function detectColumnType(values: unknown[]): ColumnType {
  const nonEmpty = values
    .filter((v) => v !== '' && v !== null && v !== undefined)
    .map((v) => String(v).trim());

  if (nonEmpty.length === 0) return 'string';
  if (nonEmpty.every((v) => !isNaN(Number(v)))) return 'number';
  if (nonEmpty.every((v) => /^(true|false|yes|no|1|0)$/i.test(v))) return 'boolean';

  const dateHits = nonEmpty.filter((v) => {
    if (!isNaN(Number(v))) return false;
    return !isNaN(new Date(v).getTime());
  });
  if (nonEmpty.length > 0 && dateHits.length / nonEmpty.length >= 0.8) return 'date';

  return 'string';
}

function parseCSV(buffer: Buffer): ParsedDataset {
  const result = Papa.parse<Record<string, string>>(buffer.toString('utf-8'), {
    header: true,
    skipEmptyLines: true,
  });
  if (result.data.length === 0) throw new Error('File is empty or contains only a header row.');
  const columnNames = result.meta.fields ?? [];
  if (columnNames.length === 0) throw new Error('No columns detected in CSV.');
  const columns = columnNames.map((name) => ({
    name,
    type: detectColumnType(result.data.map((row) => row[name])),
  }));
  return { columns, rowCount: result.data.length };
}

function parseXLSX(buffer: Buffer): ParsedDataset {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('No sheets found in the workbook.');
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  if (rows.length === 0) throw new Error('File is empty or contains only a header row.');
  const columnNames = Object.keys(rows[0]);
  if (columnNames.length === 0) throw new Error('No columns detected in spreadsheet.');
  const columns = columnNames.map((name) => ({
    name,
    type: detectColumnType(rows.map((row) => row[name])),
  }));
  return { columns, rowCount: rows.length };
}

async function downloadGoogleDriveFile(fileId: string, accessToken: string): Promise<Buffer> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (res.status === 401) {
    const err = new Error('Google Drive token expired or revoked') as Error & { code: string };
    err.code = 'TOKEN_EXPIRED';
    throw err;
  }

  if (!res.ok) {
    throw new Error(`Google Drive download failed: ${res.status}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

async function downloadDropboxFile(downloadUrl: string): Promise<Buffer> {
  const res = await fetch(downloadUrl);

  if (!res.ok) {
    throw new Error(`Dropbox download failed: ${res.status}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getSessionUser(req, res);
  if (!user) return res.status(401).json({ error: 'Unauthorised' });

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });

  const { provider, fileId, fileName, downloadUrl } = req.body as {
    provider?: string;
    fileId?: string;
    fileName?: string;
    downloadUrl?: string;
  };

  if (!provider || !['google_drive', 'dropbox'].includes(provider)) {
    return res.status(400).json({ error: 'provider must be google_drive or dropbox' });
  }
  if (!fileName) return res.status(400).json({ error: 'fileName is required' });

  const ext = path.extname(fileName).toLowerCase();
  if (!ALLOWED_EXTS.has(ext)) {
    return res.status(400).json({ error: 'Only .csv and .xlsx files are supported.' });
  }

  // Fetch the token row for this teacher+provider
  const { data: conn } = await admin
    .from('drive_connections')
    .select('id, provider, access_token, refresh_token, expires_at')
    .eq('teacher_id', user.id)
    .eq('provider', provider)
    .maybeSingle();

  if (!conn) return res.status(404).json({ needs_reconnect: true, error: 'Not connected — please connect first' });

  let buffer: Buffer;

  try {
    if (conn.provider === 'google_drive') {
      if (!fileId) return res.status(400).json({ error: 'fileId is required for Google Drive imports' });
      if (!conn.access_token) return res.status(401).json({ needs_reconnect: true, error: 'No token' });

      const isExpired = conn.expires_at ? new Date(conn.expires_at) < new Date() : false;
      if (isExpired) {
        return res.status(401).json({ needs_reconnect: true, error: 'Token expired — please reconnect' });
      }

      buffer = await downloadGoogleDriveFile(fileId, conn.access_token);
    } else if (conn.provider === 'dropbox') {
      if (!downloadUrl) return res.status(400).json({ error: 'downloadUrl is required for Dropbox imports' });
      buffer = await downloadDropboxFile(downloadUrl);
    } else {
      return res.status(400).json({ error: 'Unknown provider' });
    }
  } catch (err) {
    if ((err as { code?: string }).code === 'TOKEN_EXPIRED') {
      return res.status(401).json({ needs_reconnect: true, error: 'Token expired — please reconnect' });
    }
    const msg = err instanceof Error ? err.message : 'Failed to download file';
    return res.status(502).json({ error: msg });
  }

  if (buffer.length === 0) return res.status(400).json({ error: 'Downloaded file is empty.' });
  if (buffer.length > MAX_BYTES) return res.status(413).json({ error: 'File exceeds the 50 MB limit.' });

  let parsed: ParsedDataset;
  try {
    parsed = ext === '.csv' ? parseCSV(buffer) : parseXLSX(buffer);
  } catch (parseErr) {
    const msg = parseErr instanceof Error ? parseErr.message : 'Failed to parse file.';
    return res.status(422).json({ error: msg });
  }

  const datasetId = randomUUID();
  const storagePath = `${user.id}/${datasetId}/${fileName}`;

  const { error: storageError } = await admin.storage
    .from('datasets')
    .upload(storagePath, buffer, {
      contentType: ext === '.csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: false,
    });

  if (storageError) {
    return res.status(500).json({ error: `Storage upload failed: ${storageError.message}` });
  }

  const datasetName = path.basename(fileName, ext);

  const { data: dataset, error: dbError } = await admin
    .from('datasets')
    .insert({
      id: datasetId,
      teacher_id: user.id,
      name: datasetName,
      storage_path: storagePath,
      schema: { columns: parsed.columns },
      row_count: parsed.rowCount,
      provider: conn.provider,
      external_file_id: fileId ?? null,
    })
    .select('id, name, row_count, schema')
    .single();

  if (dbError) {
    await admin.storage.from('datasets').remove([storagePath]);
    return res.status(500).json({ error: dbError.message });
  }

  return res.status(201).json({ dataset });
}
