import type { NextApiRequest, NextApiResponse } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';

type Response = { valid: boolean; organizationName?: string; error?: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<Response>) {
  if (req.method !== 'POST') return res.status(405).end();

  const { email } = req.body as { email?: string };
  if (!email || !email.includes('@')) {
    return res.status(400).json({ valid: false, error: 'Invalid email' });
  }

  const domain = email.split('@')[1].toLowerCase();
  const supabase = createAdminClient();

  let data: { organization_id?: string; organizations?: { name: string } } | null = null;
  const { data: domainData, error } = await supabase
    .from('organization_email_domains')
    .select('organization_id, organizations!inner(name)')
    .eq('domain', domain)
    .eq('applies_to', 'student')
    .maybeSingle();

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes('does not exist') || message.includes('relation') || message.includes('column')) {
      return res.json({ valid: true });
    }
    return res.status(500).json({ valid: false, error: 'Failed to verify email domain.' });
  }

  data = domainData as { organization_id?: string; organizations?: { name: string } } | null;

  if (!data) {
    return res.json({ valid: false, error: 'Your email domain is not registered with any organisation on PlayData.' });
  }

  const orgRecord = data.organizations as unknown as { name: string };
  return res.json({ valid: true, organizationName: orgRecord?.name });
}
