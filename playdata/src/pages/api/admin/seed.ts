import type { NextApiRequest, NextApiResponse } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';

type Response = { success: boolean; message: string; userId?: string };

// One-shot endpoint to bootstrap the first admin account.
// Protected by ADMIN_SEED_SECRET env var — never expose this in production without rotating the secret.
export default async function handler(req: NextApiRequest, res: NextApiResponse<Response>) {
  if (req.method !== 'POST') return res.status(405).end();

  const { email, password, name, secret } = req.body as Record<string, string>;

  if (!secret || secret !== process.env.ADMIN_SEED_SECRET) {
    return res.status(403).json({ success: false, message: 'Invalid secret' });
  }

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'email and password are required' });
  }

  const supabase = createAdminClient();

  // Create the auth user with email already confirmed
  const { data: { user }, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !user) {
    return res.status(400).json({ success: false, message: createError?.message ?? 'Failed to create user' });
  }

  // The on_auth_user_created trigger creates a profile with role='student'.
  // Promote to admin and optionally set full_name.
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ role: 'admin', full_name: name || email })
    .eq('id', user.id);

  if (profileError) {
    await supabase.auth.admin.deleteUser(user.id);
    return res.status(500).json({ success: false, message: profileError.message });
  }

  // The on_new_admin_profile trigger only fires on INSERT with role='admin',
  // not on UPDATE. Create the admin_profiles row manually.
  const { error: adminProfileError } = await supabase
    .from('admin_profiles')
    .upsert({ id: user.id, onboarding_completed: false });

  if (adminProfileError) {
    return res.status(500).json({ success: false, message: adminProfileError.message });
  }

  return res.json({ success: true, message: 'Admin account created', userId: user.id });
}
