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

function parseEmails(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[\s,\n\r]+/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    ),
  ]
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
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
    .select('id, teacher_id')
    .eq('id', classroomId)
    .single()

  if (!classroom) return res.status(404).json({ error: 'Classroom not found' })
  if (classroom.teacher_id !== user.id) return res.status(403).json({ error: 'Forbidden' })

  const { emails: rawEmails } = req.body as { emails?: string }
  if (!rawEmails?.trim()) return res.status(400).json({ error: 'emails is required' })

  const emails = parseEmails(rawEmails)
  if (emails.length === 0) return res.status(400).json({ error: 'No valid email addresses found' })

  // Fetch existing rows for this classroom (all statuses, to detect re-adds of removed students)
  const { data: existingRows } = await admin
    .from('classroom_students')
    .select('email, status')
    .eq('classroom_id', classroomId)
    .in('email', emails)

  // email → current status
  const existingMap = new Map<string, string>(
    (existingRows ?? []).map((r: { email: string; status: string }) => [r.email, r.status])
  )

  // Find which of these emails belong to an existing student profile
  const { data: matchingProfiles } = await admin
    .from('profiles')
    .select('id, email')
    .eq('role', 'student')
    .in('email', emails)

  // lowercased email → profile id
  const profileMap = new Map<string, string>(
    (matchingProfiles ?? []).map((p: { id: string; email: string }) => [
      p.email.toLowerCase(),
      p.id,
    ])
  )

  let added_active = 0
  let added_invited = 0
  let skipped = 0

  const toInsert: {
    classroom_id: string
    email: string
    student_id: string | null
    status: string
    joined_at: string | null
  }[] = []

  for (const email of emails) {
    const existing = existingMap.get(email)

    // Skip if already on the roster with any non-removed status
    if (existing && existing !== 'removed') {
      skipped++
      continue
    }

    // Re-adding a previously removed student: update rather than insert
    if (existing === 'removed') {
      const profileId = profileMap.get(email) ?? null
      const status = profileId ? 'active' : 'invited'
      await admin
        .from('classroom_students')
        .update({
          status,
          student_id: profileId,
          joined_at: profileId ? new Date().toISOString() : null,
        })
        .eq('classroom_id', classroomId)
        .eq('email', email)
      if (status === 'active') added_active++
      else added_invited++
      continue
    }

    const profileId = profileMap.get(email) ?? null
    const status = profileId ? 'active' : 'invited'
    toInsert.push({
      classroom_id: classroomId,
      email,
      student_id: profileId,
      status,
      joined_at: profileId ? new Date().toISOString() : null,
    })
    if (status === 'active') added_active++
    else added_invited++
  }

  if (toInsert.length > 0) {
    const { error } = await admin.from('classroom_students').insert(toInsert)
    if (error) return res.status(500).json({ error: error.message })
  }

  return res.status(200).json({ added_active, added_invited, skipped })
}
