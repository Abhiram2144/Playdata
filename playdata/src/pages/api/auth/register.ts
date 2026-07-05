import type { NextApiRequest, NextApiResponse } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';

type Body = {
  email: string;
  password: string;
  fullName: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { email, password, fullName } = req.body as Body;

  if (!email || !password || !fullName) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  // Self-service sign-up always creates a student account. Teacher accounts
  // can only be created by an admin (see /api/admin/teachers).
  const role = 'student' as const;

  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return res.status(400).json({ error: 'Invalid email address.' });

  const supabase = createAdminClient();

  // Check domain against registered organisations when the domain table is available.
  let domainRow: { id: string } | null = null;
  const { data, error: domainError } = await supabase
    .from('organization_email_domains')
    .select('id')
    .eq('domain', domain)
    .eq('applies_to', 'student')
    .maybeSingle();

  if (domainError) {
    const message = domainError.message.toLowerCase();
    if (!message.includes('does not exist') && !message.includes('relation') && !message.includes('column')) {
      return res.status(500).json({ error: 'Failed to verify email domain.' });
    }
  } else {
    domainRow = data as { id: string } | null;
  }

  if (!domainRow) {
    return res.status(403).json({
      error: `The email domain "@${domain}" is not registered with any organisation on PlayData. Contact your administrator.`,
    });
  }

  // Domain is valid — create user via admin client so they are auto-confirmed
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName.trim(), role },
  });

  if (createError) {
    const msg = createError.message.toLowerCase();
    if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('duplicate')) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    return res.status(500).json({ error: createError.message });
  }

  return res.status(201).json({ success: true, userId: created.user.id });
}
