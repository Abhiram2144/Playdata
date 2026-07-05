import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';

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

  if (cookies.length > 0) {
    res.setHeader('Set-Cookie', cookies);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!['GET', 'PUT', 'DELETE'].includes(req.method ?? '')) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getSessionUser(req, res);
  if (!user) return res.status(401).json({ error: 'Unauthorised' });

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Dataset ID is required' });
  }

  try {
    const admin = createAdminClient();

    // Verify teacher role
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });

    // Verify ownership
    const { data: dataset } = await admin
      .from('datasets')
      .select('id, teacher_id')
      .eq('id', id)
      .single();

    if (!dataset || dataset.teacher_id !== user.id) {
      return res.status(404).json({ error: 'Dataset not found' });
    }

    if (req.method === 'GET') {
      const { data: fullDataset, error } = await admin
        .from('datasets')
        .select('id, name, description, source_url, drive_file_id, schema, row_count, created_at, updated_at')
        .eq('id', id)
        .single();

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({ dataset: fullDataset });
    }

    if (req.method === 'PUT') {
      const { name, description, source_url, schema, row_count } = req.body;

      const { data: updated, error } = await admin
        .from('datasets')
        .update({
          ...(name && { name }),
          ...(description !== undefined && { description }),
          ...(source_url !== undefined && { source_url }),
          ...(schema && { schema }),
          ...(row_count !== undefined && { row_count }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('id, name, description, source_url, drive_file_id, schema, row_count, created_at, updated_at')
        .single();

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({ dataset: updated });
    }

    if (req.method === 'DELETE') {
      // Delete associated visible columns
      await admin.from('dataset_visible_columns').delete().eq('dataset_id', id);

      // Delete dataset
      const { error } = await admin.from('datasets').delete().eq('id', id);

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(204).end();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
}
