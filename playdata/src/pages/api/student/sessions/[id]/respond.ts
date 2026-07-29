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

function checkAnswer(answer: string, correctAnswer: string, type: string): boolean {
  const a = answer.trim()
  const c = correctAnswer.trim()
  if (type === 'mcq') return a === c
  if (type === 'numerical') {
    const af = parseFloat(a)
    const cf = parseFloat(c)
    if (isNaN(af) || isNaN(cf)) return false
    return Math.abs(af - cf) < 0.001
  }
  return a.toLowerCase() === c.toLowerCase()
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
    .select('id, score')
    .eq('session_id', sessionId)
    .eq('student_id', user.id)
    .maybeSingle()

  if (!participant) return res.status(403).json({ error: 'Not a participant' })

  const { question_id, answer } = req.body as { question_id?: string; answer?: string }
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
    .select('correct_answer, type')
    .eq('id', question_id)
    .single()

  if (!question) return res.status(404).json({ error: 'Question not found' })

  const is_correct = checkAnswer(String(answer), question.correct_answer, question.type)

  const { error: insertError } = await admin.from('student_responses').insert({
    session_id: sessionId,
    question_id,
    student_id: user.id,
    answer: String(answer),
    is_correct,
  })

  if (insertError) return res.status(500).json({ error: insertError.message })

  // Increment score on correct answer
  let newScore = participant.score
  if (is_correct) {
    newScore = participant.score + 1
    await admin
      .from('session_participants')
      .update({ score: newScore })
      .eq('id', participant.id)
  }

  return res.status(200).json({ is_correct, score: newScore })
}
