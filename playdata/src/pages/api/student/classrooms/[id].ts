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

export interface ClassroomDetail {
  id: string
  name: string
  description: string | null
  teacher_id: string
  teacher_name: string
  created_at: string
}

export interface ActiveSession {
  id: string
  title: string
  join_code: string
  status: string
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const user = await getSessionUser(req, res)
  if (!user) return res.status(401).json({ error: 'Unauthorised' })

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'student') return res.status(403).json({ error: 'Forbidden' })

  const classroomId = req.query.id as string

  // Verify the student has active membership
  const { data: membership } = await admin
    .from('classroom_students')
    .select('id, status')
    .eq('classroom_id', classroomId)
    .eq('student_id', user.id)
    .maybeSingle()

  if (!membership || membership.status !== 'active') {
    return res.status(403).json({ error: 'Not a member of this classroom' })
  }

  const [classroomRes, sessionRes] = await Promise.all([
    admin
      .from('classrooms')
      .select('id, name, description, teacher_id, created_at')
      .eq('id', classroomId)
      .single(),
    admin
      .from('sessions')
      .select('id, title, join_code, status')
      .eq('classroom_id', classroomId)
      .eq('status', 'active')
      .maybeSingle(),
  ])

  if (!classroomRes.data) return res.status(404).json({ error: 'Classroom not found' })

  const { data: teacher } = await admin
    .from('profiles')
    .select('full_name')
    .eq('id', classroomRes.data.teacher_id)
    .single()

  return res.status(200).json({
    classroom: {
      ...classroomRes.data,
      teacher_name: teacher?.full_name ?? 'Teacher',
    } as ClassroomDetail,
    activeSession: (sessionRes.data ?? null) as ActiveSession | null,
  })
}
