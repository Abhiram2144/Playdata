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

type ClassroomRow = {
  id: string
  name: string
  description: string | null
  archived: boolean
  created_at: string
  classroom_students: { status: string }[] | null
  sessions: { id: string }[] | null
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

  // ── GET ──────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { data: classrooms, error } = await admin
      .from('classrooms')
      .select('id, name, description, archived, created_at, classroom_students(status), sessions(id)')
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false })

    if (error) return res.status(500).json({ error: error.message })

    const formatted = (classrooms as ClassroomRow[] ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      archived: c.archived,
      created_at: c.created_at,
      student_count: Array.isArray(c.classroom_students)
        ? c.classroom_students.filter((s) => s.status !== 'removed').length
        : 0,
      session_count: Array.isArray(c.sessions) ? c.sessions.length : 0,
    }))

    return res.status(200).json({ classrooms: formatted })
  }

  // ── POST: create ─────────────────────────────────────────────────────────────
  const { name, description } = req.body as { name?: string; description?: string }
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })

  const { data: classroom, error } = await admin
    .from('classrooms')
    .insert({
      teacher_id: user.id,
      name: name.trim(),
      description: description?.trim() || null,
    })
    .select('id, name, description, archived, created_at')
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.status(201).json({ classroom: { ...classroom, student_count: 0, session_count: 0 } })
}
