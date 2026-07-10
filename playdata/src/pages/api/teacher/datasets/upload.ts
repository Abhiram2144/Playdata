import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import formidable from 'formidable';
import { readFileSync, unlinkSync } from 'fs';
import { randomUUID } from 'crypto';
import path from 'path';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export const config = { api: { bodyParser: false } };

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const ALLOWED_EXTS = new Set(['.csv', '.xlsx', '.xls']);

type ColumnType = 'number' | 'date' | 'boolean' | 'string';

interface ColumnSchema {
  name: string;
  type: ColumnType;
}

function serializeCookie(name: string, value: string, opts: CookieOptions = {}): string {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  parts.push(`Path=${opts.path ?? '/'}`);
  if (opts.httpOnly) parts.push('HttpOnly');
  if (opts.secure) parts.push('Secure');
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  return parts.join('; ');
}

async function getSessionUser(req: NextApiRequest, res: NextApiResponse) {
  const cookiesToWrite: string[] = [];
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
            cookiesToWrite.push(serializeCookie(name, value, options));
          });
        },
      },
    }
  );
  if (cookiesToWrite.length > 0) res.setHeader('Set-Cookie', cookiesToWrite);
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

function detectColumnType(values: unknown[]): ColumnType {
  const nonEmpty = values
    .filter((v) => v !== '' && v !== null && v !== undefined)
    .map((v) => String(v).trim());

  if (nonEmpty.length === 0) return 'string';

  if (nonEmpty.every((v) => v !== '' && !isNaN(Number(v)))) return 'number';

  if (nonEmpty.every((v) => /^(true|false|yes|no|1|0)$/i.test(v))) return 'boolean';

  const dateHits = nonEmpty.filter((v) => {
    if (!isNaN(Number(v))) return false;
    return !isNaN(new Date(v).getTime());
  });
  if (nonEmpty.length > 0 && dateHits.length / nonEmpty.length >= 0.8) return 'date';

  return 'string';
}

interface ParsedDataset {
  columns: ColumnSchema[];
  rowCount: number;
}

function parseCSV(buffer: Buffer): ParsedDataset {
  const text = buffer.toString('utf-8');
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });

  if (result.data.length === 0) throw new Error('File is empty or contains only a header row.');

  const columnNames = result.meta.fields ?? [];
  if (columnNames.length === 0) throw new Error('No columns detected in CSV.');

  const columns: ColumnSchema[] = columnNames.map((name) => ({
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

  const columns: ColumnSchema[] = columnNames.map((name) => ({
    name,
    type: detectColumnType(rows.map((row) => row[name])),
  }));

  return { columns, rowCount: rows.length };
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
    .maybeSingle();

  if (profile?.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });

  // ── Parse multipart form ───────────────────────────────────
  const form = formidable({ maxFileSize: MAX_FILE_SIZE, keepExtensions: true });
  let tempPath: string | null = null;

  try {
    const [, files] = await form.parse(req);
    const uploaded = Array.isArray(files.file) ? files.file[0] : files.file;

    if (!uploaded) return res.status(400).json({ error: 'No file received.' });

    tempPath = uploaded.filepath;
    const originalName = uploaded.originalFilename ?? 'dataset';
    const ext = path.extname(originalName).toLowerCase();

    if (!ALLOWED_EXTS.has(ext)) {
      return res.status(400).json({ error: 'Only .csv and .xlsx files are supported.' });
    }

    const buffer = readFileSync(tempPath);
    if (buffer.length === 0) return res.status(400).json({ error: 'File is empty.' });

    // ── Parse + detect schema ────────────────────────────────
    let parsed: ParsedDataset;
    try {
      parsed = ext === '.csv' ? parseCSV(buffer) : parseXLSX(buffer);
    } catch (parseErr) {
      const msg = parseErr instanceof Error ? parseErr.message : 'Failed to parse file.';
      return res.status(422).json({ error: msg });
    }

    // ── Upload to Supabase Storage ───────────────────────────
    const datasetId = randomUUID();
    const storagePath = `${user.id}/${datasetId}/${originalName}`;

    const { error: storageError } = await admin.storage
      .from('datasets')
      .upload(storagePath, buffer, {
        contentType:
          ext === '.csv'
            ? 'text/csv'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: false,
      });

    if (storageError) {
      return res.status(500).json({ error: `Storage upload failed: ${storageError.message}` });
    }

    // ── Insert dataset row ───────────────────────────────────
    const schema = { columns: parsed.columns };
    const datasetName = path.basename(originalName, ext);

    const { data: dataset, error: dbError } = await admin
      .from('datasets')
      .insert({
        id: datasetId,
        teacher_id: user.id,
        name: datasetName,
        storage_path: storagePath,
        schema,
        row_count: parsed.rowCount,
        // provider is null = direct upload
      })
      .select('id, name, row_count, schema')
      .single();

    if (dbError) {
      // Roll back the storage upload so we don't leave orphan files
      await admin.storage.from('datasets').remove([storagePath]);
      return res.status(500).json({ error: dbError.message });
    }

    return res.status(201).json({ dataset });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Upload failed.';
    // formidable throws a specific error for file-too-large
    if (msg.includes('maxFileSize')) {
      return res.status(413).json({ error: 'File exceeds the 50 MB limit.' });
    }
    return res.status(500).json({ error: msg });
  } finally {
    if (tempPath) {
      try { unlinkSync(tempPath); } catch { /* temp file already gone */ }
    }
  }
}
