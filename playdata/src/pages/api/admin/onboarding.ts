import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';

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
  const supabaseSession = createServerClient(
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
  const { data: { user } } = await supabaseSession.auth.getUser();
  return user;
}

type OnboardingBody = {
  organization_name?: string;
  organization_type?: string;
  allowed_student_domains?: string[];
  allowed_teacher_domains?: string[];
  default_teacher_role_name?: string;
  default_student_role_name?: string;
  guest_access_enabled?: boolean;
  ai_features_enabled?: boolean;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getSessionUser(req, res);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorised' });

  const supabase = createAdminClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'admin') return res.status(403).json({ success: false, error: 'Forbidden' });

  // ── POST: complete onboarding ────────────────────────────────────────────────
  if (req.method === 'POST') {
    const {
      organization_name,
      organization_type,
      allowed_student_domains = [],
      allowed_teacher_domains = [],
      default_teacher_role_name = 'Teacher',
      default_student_role_name = 'Student',
      guest_access_enabled = false,
      ai_features_enabled = true,
    } = req.body as OnboardingBody;

    const orgName = (organization_name ?? '').trim();
    if (!orgName) return res.status(400).json({ success: false, error: 'Organization name is required' });

    const orgType = organization_type ?? 'university';

    // Find or create the organization (linked via admin_id)
    const { data: existingOrg } = await supabase
      .from('organizations')
      .select('id')
      .eq('admin_id', user.id)
      .maybeSingle();

    let orgId: string;

    if (existingOrg) {
      const { error } = await supabase
        .from('organizations')
        .update({ name: orgName, type: orgType })
        .eq('id', existingOrg.id);
      if (error) return res.status(500).json({ success: false, error: error.message });
      orgId = existingOrg.id;
    } else {
      const { data: newOrg, error } = await supabase
        .from('organizations')
        .insert({ admin_id: user.id, name: orgName, type: orgType })
        .select('id')
        .single();
      if (error) return res.status(500).json({ success: false, error: error.message });
      orgId = newOrg.id;
    }

    // Upsert organization settings
    const { error: settingsError } = await supabase
      .from('organization_settings')
      .upsert({
        organization_id: orgId,
        default_teacher_role_name,
        default_student_role_name,
        guest_access_enabled,
        ai_features_enabled,
      }, { onConflict: 'organization_id' });
    if (settingsError) return res.status(500).json({ success: false, error: settingsError.message });

    // Replace email domains
    await supabase.from('organization_email_domains').delete().eq('organization_id', orgId);
    const domainRows = [
      ...(allowed_student_domains as string[]).map((domain) => ({ organization_id: orgId, domain, applies_to: 'student' })),
      ...(allowed_teacher_domains as string[]).map((domain) => ({ organization_id: orgId, domain, applies_to: 'teacher' })),
    ];
    if (domainRows.length > 0) {
      const { error: domainsError } = await supabase.from('organization_email_domains').insert(domainRows);
      if (domainsError) return res.status(500).json({ success: false, error: domainsError.message });
    }

    // Mark onboarding complete
    const { error: adminError } = await supabase
      .from('admin_profiles')
      .upsert({ id: user.id, onboarding_completed: true }, { onConflict: 'id' });
    if (adminError) return res.status(500).json({ success: false, error: adminError.message });

    return res.json({ success: true, organization_id: orgId });
  }

  // ── PATCH: update organization settings ─────────────────────────────────────
  if (req.method === 'PATCH') {
    const {
      organization_name,
      organization_type,
      allowed_student_domains,
      allowed_teacher_domains,
      default_teacher_role_name,
      default_student_role_name,
      guest_access_enabled,
      ai_features_enabled,
    } = req.body as OnboardingBody;

    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('admin_id', user.id)
      .maybeSingle();

    if (!org) return res.status(404).json({ success: false, error: 'Organization not found' });

    // Update org name / type
    const orgUpdate: Record<string, unknown> = {};
    if (organization_name !== undefined) orgUpdate.name = organization_name;
    if (organization_type !== undefined) orgUpdate.type = organization_type;
    if (Object.keys(orgUpdate).length > 0) {
      const { error } = await supabase.from('organizations').update(orgUpdate).eq('id', org.id);
      if (error) return res.status(500).json({ success: false, error: error.message });
    }

    // Update settings
    const settingsUpdate: Record<string, unknown> = {};
    if (default_teacher_role_name !== undefined) settingsUpdate.default_teacher_role_name = default_teacher_role_name;
    if (default_student_role_name !== undefined) settingsUpdate.default_student_role_name = default_student_role_name;
    if (guest_access_enabled !== undefined) settingsUpdate.guest_access_enabled = guest_access_enabled;
    if (ai_features_enabled !== undefined) settingsUpdate.ai_features_enabled = ai_features_enabled;
    if (Object.keys(settingsUpdate).length > 0) {
      const { error } = await supabase.from('organization_settings').update(settingsUpdate).eq('organization_id', org.id);
      if (error) return res.status(500).json({ success: false, error: error.message });
    }

    // Replace domains if either list was provided
    if (allowed_student_domains !== undefined || allowed_teacher_domains !== undefined) {
      await supabase.from('organization_email_domains').delete().eq('organization_id', org.id);
      const domainRows = [
        ...(allowed_student_domains ?? []).map((domain: string) => ({ organization_id: org.id, domain, applies_to: 'student' })),
        ...(allowed_teacher_domains ?? []).map((domain: string) => ({ organization_id: org.id, domain, applies_to: 'teacher' })),
      ];
      if (domainRows.length > 0) {
        const { error } = await supabase.from('organization_email_domains').insert(domainRows);
        if (error) return res.status(500).json({ success: false, error: error.message });
      }
    }

    return res.json({ success: true });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
