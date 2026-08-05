import type { NextApiRequest, NextApiResponse } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const admin = createAdminClient()
  const sessionId = req.query.id as string

  const { guest_token, question_id, answer } = req.body as {
    guest_token?: string
    question_id?: string
    answer?: string
  }

  if (!guest_token) return res.status(400).json({ error: 'guest_token is required' })
  if (!question_id) return res.status(400).json({ error: 'question_id is required' })
  if (answer === undefined || answer === null) return res.status(400).json({ error: 'answer is required' })

  const { data: session } = await admin.from('sessions').select('id, status').eq('id', sessionId).single()
  if (!session) return res.status(404).json({ error: 'Session not found' })
  if (session.status !== 'active') return res.status(400).json({ error: 'Session is not active' })

  const { data: participant } = await admin
    .from('session_participants')
    .select('id, score')
    .eq('session_id', sessionId)
    .eq('guest_token', guest_token)
    .maybeSingle()

  if (!participant) return res.status(403).json({ error: 'Not a participant' })

  const { data: existing } = await admin
    .from('student_responses')
    .select('id, is_correct')
    .eq('session_id', sessionId)
    .eq('guest_token', guest_token)
    .eq('question_id', question_id)
    .maybeSingle()

  if (existing) return res.status(409).json({ error: 'Already answered', is_correct: existing.is_correct })

  const { data: question } = await admin
    .from('questions')
    .select('correct_answer, type, answer_tolerance')
    .eq('id', question_id)
    .single()

  if (!question) return res.status(404).json({ error: 'Question not found' })

  const is_correct = checkAnswer(String(answer), question.correct_answer, question.type, question.answer_tolerance)

  const { error: insertError } = await admin.from('student_responses').insert({
    session_id: sessionId,
    question_id,
    student_id: null,
    guest_token,
    answer: String(answer),
    is_correct,
  })

  if (insertError) return res.status(500).json({ error: insertError.message })

  let newScore = participant.score
  if (is_correct) {
    newScore = participant.score + 1
    await admin.from('session_participants').update({ score: newScore }).eq('id', participant.id)
  }

  return res.status(200).json({ is_correct, score: newScore })
}
