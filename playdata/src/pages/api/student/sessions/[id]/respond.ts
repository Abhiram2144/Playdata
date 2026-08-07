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

function checkAnswer(answer: string, correctAnswer: string, type: string, tolerance?: number | null): boolean {
  const a = answer.trim()
  const c = correctAnswer.trim()
  if (type === 'mcq') return a === c
  if (type === 'numerical') {
    const af = parseFloat(a)
    const cf = parseFloat(c)
    if (isNaN(af) || isNaN(cf)) return false
    const tol = (tolerance != null && tolerance >= 0) ? tolerance : 0.001
    return Math.abs(af - cf) <= tol
  }
  return a.toLowerCase() === c.toLowerCase()
}

const MAX_POINTS = 1000

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getIO(res: NextApiResponse): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (res as any).socket?.server?.io ?? null
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const user = await getSessionUser(req, res)
  if (!user) return res.status(401).json({ error: 'Unauthorised' })

  const admin = createAdminClient()
  const sessionId = req.query.id as string

  const { data: session } = await admin
    .from('sessions')
    .select('id, status')
    .eq('id', sessionId)
    .single()

  if (!session) return res.status(404).json({ error: 'Session not found' })
  if (session.status !== 'active') return res.status(400).json({ error: 'Session is not active' })

  const { data: participant } = await admin
    .from('session_participants')
    .select('id, score, current_streak, best_streak')
    .eq('session_id', sessionId)
    .eq('student_id', user.id)
    .maybeSingle()

  if (!participant) return res.status(403).json({ error: 'Not a participant' })

  const { question_id, answer, response_time_ms: rawResponseTimeMs } = req.body as {
    question_id?: string
    answer?: string
    response_time_ms?: number
  }
  if (!question_id) return res.status(400).json({ error: 'question_id is required' })
  if (answer === undefined || answer === null) return res.status(400).json({ error: 'answer is required' })

  // No re-submissions
  const { data: existing } = await admin
    .from('student_responses')
    .select('id, is_correct')
    .eq('session_id', sessionId)
    .eq('student_id', user.id)
    .eq('question_id', question_id)
    .maybeSingle()

  if (existing) return res.status(409).json({ error: 'Already answered', is_correct: existing.is_correct })

  // Fetch the question to check correct answer
  const { data: question } = await admin
    .from('questions')
    .select('correct_answer, type, answer_tolerance, time_limit_secs')
    .eq('id', question_id)
    .single()

  if (!question) return res.status(404).json({ error: 'Question not found' })

  const is_correct = checkAnswer(String(answer), question.correct_answer, question.type, question.answer_tolerance)

  // Core insert never includes response_time_ms so it succeeds even before
  // migration 020 is applied to the remote database.
  const { data: inserted, error: insertError } = await admin
    .from('student_responses')
    .insert({
      session_id: sessionId,
      question_id,
      student_id: user.id,
      answer: String(answer),
      is_correct,
    })
    .select('id')
    .single()

  if (insertError) return res.status(500).json({ error: insertError.message })

  // Persist response_time_ms for badge computation (requires migration 020).
  // Fire-and-forget: silently skipped if the column does not yet exist in the schema cache.
  if (rawResponseTimeMs != null && inserted?.id) {
    void admin
      .from('student_responses')
      .update({ response_time_ms: rawResponseTimeMs })
      .eq('id', inserted.id)
  }

  // ── Kahoot-style scoring ──────────────────────────────────────────────────
  // Speed bonus: 1000 pts at instant answer, 500 pts at the time limit.
  // Untimed questions (time_limit_secs = 0 or null ≤ 0) award full MAX_POINTS.
  const timeLimitMs = (question.time_limit_secs ?? 0) * 1000
  const clampedMs = timeLimitMs > 0 ? Math.min(Math.max(rawResponseTimeMs ?? 0, 0), timeLimitMs) : 0
  const basePoints = is_correct
    ? timeLimitMs <= 0
      ? MAX_POINTS
      : Math.round(MAX_POINTS * (1 - clampedMs / timeLimitMs / 2))
    : 0

  // Streak bonus: flat +100 from the 2nd consecutive correct answer onwards.
  const newStreak = is_correct ? (participant.current_streak ?? 0) + 1 : 0
  const streakBonus = is_correct && newStreak >= 2 ? 100 : 0
  const pointsEarned = basePoints + streakBonus
  const newBest = Math.max(participant.best_streak ?? 0, newStreak)
  const newScore = (participant.score ?? 0) + pointsEarned

  await admin
    .from('session_participants')
    .update({ score: newScore, current_streak: newStreak, best_streak: newBest })
    .eq('id', participant.id)

  // Notify the session room so the frontend can show a streak indicator.
  const io = getIO(res)
  if (io && newStreak >= 2) {
    io.to(`session:${sessionId}`).emit('session:streak', { studentId: user.id, streak: newStreak })
  }

  return res.status(200).json({ is_correct, score: newScore, points_earned: pointsEarned, current_streak: newStreak })
}
