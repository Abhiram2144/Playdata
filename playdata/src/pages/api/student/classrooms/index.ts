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

type ClassroomJoin = {
  id: string
  name: string
  description: string | null
  teacher_id: string
} | {
  id: string
  name: string
  description: string | null
  teacher_id: string
}[] | null

type MembershipRow = {
  classroom_id: string
  joined_at: string
  classrooms: ClassroomJoin
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const user = await getSessionUser(req, res)
  if (!user) return res.status(401).json({ error: 'Unauthorised' })

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'student') return res.status(403).json({ error: 'Forbidden' })

  const { data: memberships } = await admin
    .from('classroom_students')
    .select('classroom_id, joined_at, classrooms(id, name, description, teacher_id)')
    .eq('student_id', user.id)
    .eq('status', 'active')
    .order('joined_at', { ascending: false })

  if (!memberships?.length) return res.status(200).json({ classrooms: [] })

  const rows = memberships as unknown as MembershipRow[]

  const teacherIds = [...new Set(
    rows
      .map(r => {
        const c = Array.isArray(r.classrooms) ? r.classrooms[0] : r.classrooms
        return c?.teacher_id
      })
      .filter(Boolean)
  )] as string[]

  const { data: teachers } = teacherIds.length > 0
    ? await admin.from('profiles').select('id, full_name').in('id', teacherIds)
    : { data: [] }

  const teacherMap = new Map(
    (teachers ?? []).map((t: { id: string; full_name: string }) => [t.id, t.full_name])
  )

  const classrooms = rows.flatMap(r => {
    const c = Array.isArray(r.classrooms) ? r.classrooms[0] : r.classrooms
    if (!c) return []
    return [{
      id: c.id,
      name: c.name,
      description: c.description,
      teacher_name: teacherMap.get(c.teacher_id) ?? 'Teacher',
      joined_at: r.joined_at,
    }]
  })

  return res.status(200).json({ classrooms })
}
