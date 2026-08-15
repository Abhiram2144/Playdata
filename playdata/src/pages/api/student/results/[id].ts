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

export interface QuestionResult {
  id: string
  text: string
  type: string
  options: string[] | null
  correct_answer: string
  explanation: string | null
  student_answer: string | null
  is_correct: boolean | null
  group_title: string
  group_order: number
  question_order: number
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const user = await getSessionUser(req, res)
  if (!user) return res.status(401).json({ error: 'Unauthorised' })

  const sessionId = req.query.id as string
  const admin = createAdminClient()

  // Verify student is a participant
  const { data: participant } = await admin
    .from('session_participants')
    .select('id, score')
    .eq('session_id', sessionId)
    .eq('student_id', user.id)
    .maybeSingle()

  if (!participant) return res.status(403).json({ error: 'Not a participant in this session' })

  // Get session info
  const { data: session } = await admin
    .from('sessions')
    .select('id, title, status, started_at, ended_at')
    .eq('id', sessionId)
    .single()

  if (!session) return res.status(404).json({ error: 'Session not found' })

  // Get all session items ordered
  const { data: rawItems } = await admin
    .from('session_items')
    .select('id, type, reference_id, order_index')
    .eq('session_id', sessionId)
    .order('order_index')

  const items = rawItems ?? []
  const quizIds = items.filter((i) => i.type === 'quiz').map((i) => i.reference_id as string)
  const questionIds = items.filter((i) => i.type === 'question').map((i) => i.reference_id as string)

  type QuizRow = {
    id: string
    title: string
    questions: {
      id: string
      text: string
      type: string
      options: unknown
      correct_answer: string
      explanation: string | null
      order_index: number
    }[]
  }
  type StandaloneQuestionRow = {
    id: string
    text: string
    type: string
    options: unknown
    correct_answer: string
    explanation: string | null
  }

  const [quizzesRes, standaloneRes] = await Promise.all([
    quizIds.length > 0
      ? admin
          .from('quizzes')
          .select('id, title, questions(id, text, type, options, correct_answer, explanation, order_index)')
          .in('id', quizIds)
      : { data: [] as QuizRow[] },
    questionIds.length > 0
      ? admin
          .from('questions')
          .select('id, text, type, options, correct_answer, explanation')
          .in('id', questionIds)
      : { data: [] as StandaloneQuestionRow[] },
  ])

  const quizMap = new Map(
    ((quizzesRes.data ?? []) as QuizRow[]).map((q) => [q.id, q])
  )
  const standaloneMap = new Map(
    ((standaloneRes.data ?? []) as StandaloneQuestionRow[]).map((q) => [q.id, q])
  )

  // Get student responses for this session
  const { data: responses } = await admin
    .from('student_responses')
    .select('question_id, answer, is_correct')
    .eq('session_id', sessionId)
    .eq('student_id', user.id)

  const responseMap = new Map(
    (responses ?? []).map((r) => [r.question_id, r])
  )

  // Build flat ordered list of question results
  const questionResults: QuestionResult[] = []

  for (const item of items) {
    const ref = item.reference_id as string
    const itemOrder = item.order_index as number

    if (item.type === 'quiz') {
      const quiz = quizMap.get(ref) as QuizRow | undefined
      if (!quiz) continue
      const sortedQs = [...(Array.isArray(quiz.questions) ? quiz.questions : [])]
        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))

      for (let qi = 0; qi < sortedQs.length; qi++) {
        const q = sortedQs[qi]
        const resp = responseMap.get(q.id)
        questionResults.push({
          id: q.id,
          text: q.text,
          type: q.type,
          options: Array.isArray(q.options) ? (q.options as string[]) : null,
          correct_answer: q.correct_answer,
          explanation: q.explanation ?? null,
          student_answer: resp?.answer ?? null,
          is_correct: resp?.is_correct ?? null,
          group_title: quiz.title,
          group_order: itemOrder,
          question_order: qi,
        })
      }
    } else if (item.type === 'question') {
      const q = standaloneMap.get(ref) as StandaloneQuestionRow | undefined
      if (!q) continue
      const resp = responseMap.get(q.id)
      questionResults.push({
        id: q.id,
        text: q.text,
        type: q.type,
        options: Array.isArray(q.options) ? (q.options as string[]) : null,
        correct_answer: q.correct_answer,
        explanation: q.explanation ?? null,
        student_answer: resp?.answer ?? null,
        is_correct: resp?.is_correct ?? null,
        group_title: 'Session Questions',
        group_order: itemOrder,
        question_order: 0,
      })
    }
    // visualisation items are skipped — no questions to review
  }

  const correctCount = questionResults.filter((q) => q.is_correct === true).length

  return res.status(200).json({
    session,
    score: participant.score ?? 0,
    total_questions: questionResults.length,
    correct_count: correctCount,
    questions: questionResults,
  })
}
