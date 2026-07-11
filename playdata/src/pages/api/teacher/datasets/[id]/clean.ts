import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import path from 'path';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

type ColumnType = 'number' | 'date' | 'boolean' | 'string';
interface ColumnSchema { name: string; type: ColumnType }

function makeUniqueHeaders(headers: string[]): string[] {
  const counts = new Map<string, number>();
  return headers.map((header, index) => {
    const base = (header ?? '').trim() || `Column_${index + 1}`;
    const seen = counts.get(base) ?? 0;
    counts.set(base, seen + 1);
    return seen === 0 ? base : `${base}_${seen + 1}`;
  });
}

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
        getAll() { return Object.entries(req.cookies).map(([name, value]) => ({ name, value: value ?? '' })); },
        setAll(cookiesToSet) { cookiesToSet.forEach(({ name, value, options }) => { cookies.push(serializeCookie(name, value, options)); }); },
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
  if (nonEmpty.every((v) => v !== '' && !isNaN(Number(v)))) return 'number';
  if (nonEmpty.every((v) => /^(true|false|yes|no|1|0)$/i.test(v))) return 'boolean';

  const dateHits = nonEmpty.filter((v) => {
    if (!isNaN(Number(v))) return false;
    return !isNaN(new Date(v).getTime());
  });
  if (nonEmpty.length > 0 && dateHits.length / nonEmpty.length >= 0.8) return 'date';

  return 'string';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getSessionUser(req, res);
  if (!user) return res.status(401).json({ error: 'Unauthorised' });

  const { id } = req.query;
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Dataset ID required' });

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
      .select('id, teacher_id, storage_path')
      .eq('id', id)
      .single();

    if (!dataset || dataset.teacher_id !== user.id) {
      return res.status(404).json({ error: 'Dataset not found' });
    }

    const storagePath: string | null = dataset.storage_path;
    if (!storagePath) return res.status(400).json({ error: 'No storage file attached to this dataset' });

    const { data: blob, error: dlError } = await admin.storage.from('datasets').download(storagePath);
    if (dlError || !blob) return res.status(500).json({ error: dlError?.message ?? 'Download failed' });

    const buffer = Buffer.from(await blob.arrayBuffer());
    const ext = path.extname(storagePath.split('/').pop() ?? storagePath).toLowerCase();

    const {
      promoteFirstRow = false,
      coerceToNumber = [],
      columnRenames = {},
      dropDuplicates = false,
      dropMissingRows = false,
    } = req.body as {
      promoteFirstRow?: boolean;
      coerceToNumber?: Array<string | number>;
      columnRenames?: Record<string, string>;
      dropDuplicates?: boolean;
      dropMissingRows?: boolean;
    };

    // Parse file into objects — same strategy as rows.ts so column keys always align
    let currentHeaders: string[];
    let dataObjects: Record<string, unknown>[];

    if (ext === '.csv') {
      const result = Papa.parse<Record<string, unknown>>(buffer.toString('utf-8'), {
        header: true,
        skipEmptyLines: true,
      });
      if (result.data.length === 0 && (result.meta.fields ?? []).length === 0) {
        return res.status(422).json({ error: 'File is empty' });
      }
      currentHeaders = result.meta.fields ?? [];
      dataObjects = result.data;
    } else {
      const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) return res.status(422).json({ error: 'No sheets found' });
      const sheet = workbook.Sheets[sheetName];
      dataObjects = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      if (dataObjects.length === 0) return res.status(422).json({ error: 'File is empty' });
      currentHeaders = Object.keys(dataObjects[0]);
    }

    // Step 1: Promote first data row to column headers
    if (promoteFirstRow && dataObjects.length > 0) {
      const firstRow = dataObjects[0];
      const newHeaders = currentHeaders.map((key, idx) =>
        String(firstRow[key] ?? '').trim() || `Column_${idx + 1}`
      );
      // Remap remaining rows from old keys to new header names
      dataObjects = dataObjects.slice(1).map((row) => {
        const newRow: Record<string, unknown> = {};
        currentHeaders.forEach((oldKey, idx) => { newRow[newHeaders[idx]] = row[oldKey]; });
        return newRow;
      });
      currentHeaders = newHeaders;
    }

    // Step 2: Apply column renames (keyed by original index or original name) + uniquify
    const renamedHeaders = currentHeaders.map((name, idx) => {
      const override = columnRenames[String(idx)] ?? columnRenames[name];
      const resolved = (override ?? name).trim();
      return resolved || `Column_${idx + 1}`;
    });
    const finalHeaders = makeUniqueHeaders(renamedHeaders);

    // Step 3: Remap objects from currentHeaders to finalHeaders
    dataObjects = dataObjects.map((row) => {
      const newRow: Record<string, unknown> = {};
      currentHeaders.forEach((oldKey, idx) => { newRow[finalHeaders[idx]] = row[oldKey]; });
      return newRow;
    });

    // Step 4: Coerce specified columns to numbers
    const coerceSet = new Set(coerceToNumber.map(String));
    if (coerceSet.size > 0) {
      dataObjects = dataObjects.map((row) => {
        const newRow = { ...row };
        finalHeaders.forEach((header, idx) => {
          if (coerceSet.has(String(idx)) || coerceSet.has(header)) {
            const s = String(newRow[header] ?? '').replace(/[$£€%,\s]/g, '');
            const n = parseFloat(s);
            newRow[header] = isNaN(n) ? null : n;
          }
        });
        return newRow;
      });
    }

    let filteredRows = dataObjects;

    // Step 5: Drop exact duplicate rows
    if (dropDuplicates) {
      const seen = new Set<string>();
      filteredRows = filteredRows.filter((row) => {
        const key = JSON.stringify(row);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    // Step 6: Drop rows that have any missing/null/empty value
    if (dropMissingRows) {
      filteredRows = filteredRows.filter((row) =>
        finalHeaders.every((h) => {
          const v = row[h];
          if (v === null || v === undefined) return false;
          const s = String(v).trim();
          return s !== '' && !/^(null|na|n\/a|nan|none|undefined)$/i.test(s);
        })
      );
    }

    const newColumns: ColumnSchema[] = finalHeaders.map((name) => ({
      name,
      type: detectColumnType(filteredRows.map((r) => r[name])),
    }));

    // Write cleaned data back to the same storage path
    let uploadBuffer: Buffer;
    if (ext === '.csv') {
      const csv = Papa.unparse(filteredRows, { columns: finalHeaders });
      uploadBuffer = Buffer.from(csv, 'utf-8');
    } else {
      const ws = XLSX.utils.json_to_sheet(filteredRows, { header: finalHeaders });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      uploadBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    }

    const { error: upError } = await admin.storage
      .from('datasets')
      .upload(storagePath, uploadBuffer, {
        contentType: ext === '.csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: true,
      });

    if (upError) return res.status(500).json({ error: `Re-upload failed: ${upError.message}` });

    const { error: dbError } = await admin
      .from('datasets')
      .update({
        schema: { columns: newColumns },
        row_count: filteredRows.length,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (dbError) return res.status(500).json({ error: dbError.message });

    return res.status(200).json({ columns: newColumns, rowCount: filteredRows.length });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
}
