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

type SessionRef = {
  id: string
  title: string
  status: string
  ended_at: string | null
  started_at: string | null
} | null

type ParticipationRow = {
  score: number
  joined_at: string
  session_id: string
  sessions: SessionRef | SessionRef[]
}

type ResponseRow = {
  id: string
  is_correct: boolean | null
  session_id: string
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const user = await getSessionUser(req, res)
  if (!user) return res.status(401).json({ error: 'Unauthorised' })

  const admin = createAdminClient()

  const [participationsRes, responsesRes] = await Promise.all([
    admin
      .from('session_participants')
      .select('score, joined_at, session_id, sessions(id, title, status, ended_at, started_at)')
      .eq('student_id', user.id)
      .order('joined_at', { ascending: false }),
    admin
      .from('student_responses')
      .select('id, is_correct, session_id')
      .eq('student_id', user.id),
  ])

  const parts = (participationsRes.data ?? []) as ParticipationRow[]
  const resps = (responsesRes.data ?? []) as ResponseRow[]

  const sessionsJoined = parts.length
  const quizzesAnswered = resps.length
  const correctAnswers = resps.filter((r) => r.is_correct === true).length
  const bestScore = parts.length > 0 ? Math.max(...parts.map((p) => p.score ?? 0)) : 0

  const sessionHistory = parts.slice(0, 30).map((p) => {
    const sess = Array.isArray(p.sessions) ? p.sessions[0] : p.sessions
    const sessionResps = resps.filter((r) => r.session_id === p.session_id)
    const correct = sessionResps.filter((r) => r.is_correct === true).length
    const incorrect = sessionResps.filter((r) => r.is_correct === false).length
    return {
      session_id: p.session_id,
      title: sess?.title ?? 'Session',
      status: sess?.status ?? 'ended',
      score: p.score ?? 0,
      correct,
      incorrect,
      answered: sessionResps.length,
      date: sess?.ended_at ?? sess?.started_at ?? p.joined_at,
    }
  })

  return res.status(200).json({
    sessionsJoined,
    quizzesAnswered,
    correctAnswers,
    bestScore,
    sessionHistory,
  })
}
