import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';

const VALID_CHART_TYPES = ['bar', 'line', 'pie', 'scatter', 'histogram'] as const;
type ChartType = (typeof VALID_CHART_TYPES)[number];

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
  if (!['GET', 'POST'].includes(req.method ?? '')) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getSessionUser(req, res);
  if (!user) return res.status(401).json({ error: 'Unauthorised' });

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });

  if (req.method === 'GET') {
    const { data, error } = await admin
      .from('visualisations')
      .select('id, name, chart_type, is_template, created_at, dataset_id, datasets(id, name)')
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ visualisations: data ?? [] });
  }

  if (req.method === 'POST') {
    const { dataset_id, name, chart_type, config, is_template } = req.body as {
      dataset_id?: string;
      name?: string;
      chart_type?: string;
      config?: Record<string, unknown>;
      is_template?: boolean;
    };

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    if (!chart_type || !(VALID_CHART_TYPES as readonly string[]).includes(chart_type)) {
      return res.status(400).json({ error: `chart_type must be one of: ${VALID_CHART_TYPES.join(', ')}` });
    }

    // If a dataset_id is given, verify the teacher owns it
    if (dataset_id) {
      const { data: ds } = await admin
        .from('datasets')
        .select('id, teacher_id')
        .eq('id', dataset_id)
        .single();

      if (!ds || ds.teacher_id !== user.id) {
        return res.status(404).json({ error: 'Dataset not found' });
      }
    }

    const { data: vis, error } = await admin
      .from('visualisations')
      .insert({
        teacher_id: user.id,
        dataset_id: dataset_id ?? null,
        name: name.trim(),
        chart_type: chart_type as ChartType,
        config: config ?? {},
        is_template: is_template ?? false,
      })
      .select('id, name, chart_type, is_template, dataset_id, created_at')
      .single();

    if (error) return res.status(500).json({ error: error.message });

    return res.status(201).json({ visualisation: vis });
  }
}
