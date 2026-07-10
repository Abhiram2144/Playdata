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
    return res.status(400).json({ error: 'Connection ID is required' });
  }

  try {
    const admin = createAdminClient();

    // Verify admin role
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

    if (req.method === 'GET') {
      // Get drive connection details
      const { data: connection, error } = await admin
        .from('drive_connections')
        .select(
          'id, teacher_id, name, external_folder_id, is_approved, approved_by, approved_at, created_at, profiles!drive_connections_teacher_id_fkey(full_name, email)'
        )
        .eq('id', id)
        .single();

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      if (!connection) {
        return res.status(404).json({ error: 'Connection not found' });
      }

      return res.status(200).json({ connection });
    }

    if (req.method === 'PUT') {
      // Approve or update drive connection
      const { is_approved, external_folder_id } = req.body;

      const updateData: Record<string, unknown> = {};
      if (is_approved !== undefined) {
        updateData.is_approved = is_approved;
        if (is_approved) {
          updateData.approved_by = user.id;
          updateData.approved_at = new Date().toISOString();
        }
      }
      if (external_folder_id !== undefined) {
        updateData.external_folder_id = external_folder_id;
      }

      const { data: updated, error } = await admin
        .from('drive_connections')
        .update(updateData)
        .eq('id', id)
        .select(
          'id, teacher_id, name, external_folder_id, is_approved, approved_by, approved_at, created_at'
        )
        .single();

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({ connection: updated });
    }

    if (req.method === 'DELETE') {
      // Delete drive connection
      const { error } = await admin.from('drive_connections').delete().eq('id', id);

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
