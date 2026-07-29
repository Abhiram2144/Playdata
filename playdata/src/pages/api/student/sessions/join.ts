import type { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase/admin'

function serializeCookie(name: string, value: string, opts: CookieOptions = {}): string {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`]
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`)
  if (opts.domain) parts.push(`Domain=${opts.domain}`)
  parts.push(`Path=${opts.path ?? '/'}`)
  if (opts.expires instanceof Date) parts.push(`Expires=${opts.expires.toUTCString()}`)
  if (opts.httpOnly) parts.push('HttpOnly')
  if (opts.secure) parts.push('Secure')
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`)
  return parts.join('; ')
}

async function getSessionUser(req: NextApiRequest, res: NextApiResponse) {
  const cookies: string[] = []
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return Object.entries(req.cookies).map(([name, value]) => ({ name, value: value ?? '' })) },
        setAll(cs) { cs.forEach(({ name, value, options }) => cookies.push(serializeCookie(name, value, options))) },
      },
    }
  )
  if (cookies.length > 0) res.setHeader('Set-Cookie', cookies)
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const user = await getSessionUser(req, res)
  if (!user) return res.status(401).json({ error: 'Unauthorised' })

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role === 'admin') return res.status(403).json({ error: 'Forbidden' })

  const { join_code } = req.body as { join_code?: string }
  if (!join_code?.trim()) return res.status(400).json({ error: 'join_code is required' })

  const { data: session } = await admin
    .from('sessions')
    .select('id, title, status, current_item, join_code')
    .eq('join_code', join_code.trim().toUpperCase())
    .single()

  if (!session) return res.status(404).json({ error: 'Session not found. Check your code.' })
  if (session.status === 'ended') return res.status(400).json({ error: 'This session has already ended.' })

  // Check for existing participant row (re-join support)
  const { data: existing } = await admin
    .from('session_participants')
    .select('id, score')
    .eq('session_id', session.id)
    .eq('student_id', user.id)
    .maybeSingle()

  if (existing) {
    // Clear left_at so they're marked as active again
    await admin
      .from('session_participants')
      .update({ left_at: null })
      .eq('id', existing.id)

    return res.status(200).json({ session_id: session.id, participant_id: existing.id })
  }

  const { data: participant, error } = await admin
    .from('session_participants')
    .insert({ session_id: session.id, student_id: user.id, score: 0 })
    .select('id')
    .single()

  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({ session_id: session.id, participant_id: participant.id })
}
