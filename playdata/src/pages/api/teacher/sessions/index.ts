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

function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!['GET', 'POST'].includes(req.method ?? '')) {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const user = await getSessionUser(req, res)
  if (!user) return res.status(401).json({ error: 'Unauthorised' })

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' })

  if (req.method === 'GET') {
    const { data: sessions } = await admin
      .from('sessions')
      .select('id, title, join_code, status, current_item, started_at, ended_at, created_at, updated_at, session_items(id), session_participants(id)')
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false })

    const formatted = (sessions ?? []).map((s: Record<string, unknown>) => ({
      id: s.id,
      title: s.title,
      join_code: s.join_code,
      status: s.status,
      current_item: s.current_item,
      started_at: s.started_at,
      ended_at: s.ended_at,
      created_at: s.created_at,
      updated_at: s.updated_at,
      item_count: Array.isArray(s.session_items) ? (s.session_items as unknown[]).length : 0,
      participant_count: Array.isArray(s.session_participants) ? (s.session_participants as unknown[]).length : 0,
    }))

    return res.status(200).json({ sessions: formatted })
  }

  // POST: create
  const { title } = req.body as { title?: string }
  if (!title?.trim()) return res.status(400).json({ error: 'Title is required' })

  let created = null
  let lastErr: { message: string; code?: string } | null = null
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateJoinCode()
    const { data, error } = await admin
      .from('sessions')
      .insert({ teacher_id: user.id, title: title.trim(), join_code: code, status: 'waiting' })
      .select('id, join_code')
      .single()
    if (!error) { created = data; break }
    if (!error.message?.includes('unique') && error.code !== '23505') {
      return res.status(500).json({ error: error.message })
    }
    lastErr = error
  }

  if (!created) return res.status(500).json({ error: lastErr?.message ?? 'Failed to create session' })
  return res.status(201).json({ sessionId: created.id, joinCode: created.join_code })
}
