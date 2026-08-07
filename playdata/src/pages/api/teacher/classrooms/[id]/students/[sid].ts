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
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const user = await getSessionUser(req, res)
  if (!user) return res.status(401).json({ error: 'Unauthorised' })

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' })

  const classroomId = req.query.id as string
  const sid = req.query.sid as string

  // Verify classroom ownership in one query
  const { data: classroom } = await admin
    .from('classrooms')
    .select('id, teacher_id')
    .eq('id', classroomId)
    .single()

  if (!classroom) return res.status(404).json({ error: 'Classroom not found' })
  if (classroom.teacher_id !== user.id) return res.status(403).json({ error: 'Forbidden' })

  // Verify the student row belongs to this classroom
  const { data: row } = await admin
    .from('classroom_students')
    .select('id')
    .eq('id', sid)
    .eq('classroom_id', classroomId)
    .single()

  if (!row) return res.status(404).json({ error: 'Student not found' })

  const { error } = await admin
    .from('classroom_students')
    .update({ status: 'removed' })
    .eq('id', sid)

  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ ok: true })
}
