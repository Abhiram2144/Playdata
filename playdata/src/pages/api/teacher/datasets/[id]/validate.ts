import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import path from 'path';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

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

function parseToRows(buffer: Buffer, ext: string): Record<string, unknown>[] {
  if (ext === '.csv') {
    const result = Papa.parse<Record<string, unknown>>(buffer.toString('utf-8'), {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
    });
    return result.data;
  }
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '' });
}

function isMissing(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  const s = String(v).trim();
  return s === '' || /^(null|na|n\/a|nan|none|undefined)$/i.test(s);
}

type ColumnType = 'number' | 'date' | 'boolean' | 'string';

function matchesType(v: unknown, type: ColumnType): boolean {
  if (isMissing(v)) return true; // missing values don't count as type errors
  const s = String(v).trim();
  switch (type) {
    case 'number':
      return !isNaN(Number(s)) && s !== '';
    case 'boolean':
      return /^(true|false|yes|no|1|0)$/i.test(s);
    case 'date':
      if (!isNaN(Number(s))) return false;
      return !isNaN(new Date(s).getTime());
    default:
      return true;
  }
}

interface ColumnSchema { name: string; type: ColumnType }

interface TypeErrorSummary {
  expected: ColumnType;
  count: number;
  examples: string[];
}

export interface ValidationReport {
  totalRows: number;
  missingPerColumn: Record<string, number>;
  typeErrorsPerColumn: Record<string, TypeErrorSummary>;
  duplicateRowCount: number;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getSessionUser(req, res);
  if (!user) return res.status(401).json({ error: 'Unauthorised' });

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Dataset ID is required' });
  }

  try {
    const admin = createAdminClient();

    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });

    const { data: dataset } = await admin
      .from('datasets')
      .select('id, teacher_id, storage_path, schema')
      .eq('id', id)
      .single();

    if (!dataset || dataset.teacher_id !== user.id) {
      return res.status(404).json({ error: 'Dataset not found' });
    }

    const storagePath = (dataset as { storage_path: string | null }).storage_path;
    const schema = (dataset as { schema: { columns?: ColumnSchema[] } }).schema;
    const columns: ColumnSchema[] = schema?.columns ?? [];

    if (!storagePath) {
      const empty: ValidationReport = {
        totalRows: 0,
        missingPerColumn: {},
        typeErrorsPerColumn: {},
        duplicateRowCount: 0,
      };
      return res.status(200).json({ report: empty });
    }

    const { data: blob, error: dlErr } = await admin.storage
      .from('datasets')
      .download(storagePath);

    if (dlErr || !blob) {
      return res.status(500).json({ error: 'Failed to download dataset file' });
    }

    const buffer = Buffer.from(await blob.arrayBuffer());
    const ext = path.extname(storagePath.split('/').pop() ?? '').toLowerCase();
    const rows = parseToRows(buffer, ext);

    const totalRows = rows.length;
    const missingPerColumn: Record<string, number> = {};
    const typeErrorsPerColumn: Record<string, TypeErrorSummary> = {};

    // Use the file's actual column names as source of truth so a stale schema
    // never causes all cells to report as missing.
    const fileColumnNames = rows.length > 0
      ? Object.keys(rows[0])
      : columns.map((c) => c.name);
    const schemaTypeMap = new Map(columns.map((c) => [c.name, c.type]));

    for (const colName of fileColumnNames) {
      const colType: ColumnType = schemaTypeMap.get(colName) ?? 'string';
      missingPerColumn[colName] = 0;
      const errExamples: string[] = [];
      let errCount = 0;

      for (const row of rows) {
        const val = row[colName];
        if (isMissing(val)) {
          missingPerColumn[colName]++;
        } else if (!matchesType(val, colType)) {
          errCount++;
          if (errExamples.length < 3) errExamples.push(String(val).slice(0, 40));
        }
      }

      if (errCount > 0) {
        typeErrorsPerColumn[colName] = {
          expected: colType,
          count: errCount,
          examples: errExamples,
        };
      }
    }

    // Duplicate detection using row fingerprint
    const seen = new Map<string, number>();
    for (const row of rows) {
      const key = JSON.stringify(row);
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    const duplicateRowCount = [...seen.values()].reduce((acc, n) => acc + (n > 1 ? n - 1 : 0), 0);

    const report: ValidationReport = {
      totalRows,
      missingPerColumn,
      typeErrorsPerColumn,
      duplicateRowCount,
    };

    return res.status(200).json({ report });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
}
