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

type ProfileJoin = { full_name: string; email: string } | { full_name: string; email: string }[] | null

export type RosterStudent = {
  id: string
  email: string
  status: 'invited' | 'active'
  invited_at: string
  joined_at: string | null
  student_id: string | null
  full_name: string | null
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!['GET', 'PATCH'].includes(req.method ?? '')) {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const user = await getSessionUser(req, res)
  if (!user) return res.status(401).json({ error: 'Unauthorised' })

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' })

  const classroomId = req.query.id as string

  const { data: classroom } = await admin
    .from('classrooms')
    .select('id, teacher_id, name, description, archived, created_at')
    .eq('id', classroomId)
    .single()

  if (!classroom) return res.status(404).json({ error: 'Classroom not found' })
  if (classroom.teacher_id !== user.id) return res.status(403).json({ error: 'Forbidden' })

  // ── GET ──────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { data: rows, error } = await admin
      .from('classroom_students')
      .select('id, email, status, invited_at, joined_at, student_id, profiles(full_name, email)')
      .eq('classroom_id', classroomId)
      .neq('status', 'removed')
      .order('invited_at', { ascending: false })

    if (error) return res.status(500).json({ error: error.message })

    const students: RosterStudent[] = (rows ?? []).map((row: {
      id: string
      email: string
      status: string
      invited_at: string
      joined_at: string | null
      student_id: string | null
      profiles: ProfileJoin
    }) => {
      const prof = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
      return {
        id: row.id,
        email: row.email,
        status: row.status as 'invited' | 'active',
        invited_at: row.invited_at,
        joined_at: row.joined_at,
        student_id: row.student_id,
        full_name: prof?.full_name ?? null,
      }
    })

    return res.status(200).json({ classroom, students })
  }

  // ── PATCH: archive/unarchive (or rename) ────────────────────────────────────
  const body = req.body as { archived?: boolean; name?: string; description?: string }
  const updates: Record<string, unknown> = {}
  if (typeof body.archived === 'boolean') updates.archived = body.archived
  if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim()
  if (typeof body.description === 'string') updates.description = body.description.trim() || null

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No updates provided' })
  }

  const { data: updated, error } = await admin
    .from('classrooms')
    .update(updates)
    .eq('id', classroomId)
    .select('id, name, description, archived, created_at')
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ classroom: updated })
}
