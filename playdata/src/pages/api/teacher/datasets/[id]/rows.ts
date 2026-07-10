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

function parseCSV(buffer: Buffer): Record<string, unknown>[] {
  const result = Papa.parse<Record<string, unknown>>(buffer.toString('utf-8'), {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false, // keep as strings so we can display raw values
  });
  return result.data;
}

function parseXLSX(buffer: Buffer): Record<string, unknown>[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getSessionUser(req, res);
  if (!user) return res.status(401).json({ error: 'Unauthorised' });

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Dataset ID is required' });
  }

  const page = Math.max(0, parseInt((req.query.page as string) ?? '0', 10) || 0);
  const pageSize = Math.min(200, Math.max(1, parseInt((req.query.pageSize as string) ?? '50', 10) || 50));

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

    const storagePath = (dataset as { storage_path: string | null }).storage_path;
    if (!storagePath) {
      return res.status(200).json({ rows: [], total: 0, page, pageSize });
    }

    const { data: blob, error: dlErr } = await admin.storage
      .from('datasets')
      .download(storagePath);

    if (dlErr || !blob) {
      return res.status(500).json({ error: 'Failed to download dataset file' });
    }

    const buffer = Buffer.from(await blob.arrayBuffer());
    const ext = path.extname(storagePath.split('/').pop() ?? '').toLowerCase();
    const allRows = ext === '.csv' ? parseCSV(buffer) : parseXLSX(buffer);

    const total = allRows.length;
    const rows = allRows.slice(page * pageSize, (page + 1) * pageSize);

    return res.status(200).json({ rows, total, page, pageSize });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
}
