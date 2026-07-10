import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';

const VALID_CHART_TYPES = ['bar', 'line', 'pie', 'scatter', 'histogram'];

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!['GET', 'PUT', 'DELETE'].includes(req.method ?? '')) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getSessionUser(req, res);
  if (!user) return res.status(401).json({ error: 'Unauthorised' });

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Visualisation ID is required' });
  }

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });

  // Ownership check
  const { data: vis } = await admin
    .from('visualisations')
    .select('id, teacher_id')
    .eq('id', id)
    .single();

  if (!vis || vis.teacher_id !== user.id) {
    return res.status(404).json({ error: 'Visualisation not found' });
  }

  if (req.method === 'GET') {
    const { data, error } = await admin
      .from('visualisations')
      .select('id, name, chart_type, config, is_template, dataset_id, created_at, updated_at, datasets(id, name, schema)')
      .eq('id', id)
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ visualisation: data });
  }

  if (req.method === 'PUT') {
    const { name, chart_type, config, is_template } = req.body as {
      name?: string;
      chart_type?: string;
      config?: Record<string, unknown>;
      is_template?: boolean;
    };

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name !== undefined) patch.name = name.trim();
    if (chart_type !== undefined) {
      if (!VALID_CHART_TYPES.includes(chart_type)) {
        return res.status(400).json({ error: 'Invalid chart_type' });
      }
      patch.chart_type = chart_type;
    }
    if (config !== undefined) patch.config = config;
    if (is_template !== undefined) patch.is_template = is_template;

    const { data, error } = await admin
      .from('visualisations')
      .update(patch)
      .eq('id', id)
      .select('id, name, chart_type, config, is_template, dataset_id, updated_at')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ visualisation: data });
  }

  if (req.method === 'DELETE') {
    const { error } = await admin.from('visualisations').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).end();
  }
}
