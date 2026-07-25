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

function csvEscape(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvEscape).join(',')
}

// GET /api/teacher/sessions/[id]/export
// Returns a CSV file attachment with the full response data for a session.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const user = await getSessionUser(req, res)
  if (!user) return res.status(401).json({ error: 'Unauthorised' })

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' })

  const { id: sessionId } = req.query
  if (!sessionId || typeof sessionId !== 'string') return res.status(400).json({ error: 'Session ID required' })

  const { data: session } = await admin
    .from('sessions')
    .select('id, title, teacher_id, join_code, status, started_at, ended_at')
    .eq('id', sessionId)
    .single()

  if (!session) return res.status(404).json({ error: 'Session not found' })
  if (session.teacher_id !== user.id) return res.status(403).json({ error: 'Forbidden' })

  // Fetch all data in parallel
  const [itemsRes, participantsRes, responsesRes] = await Promise.all([
    admin.from('session_items').select('type, reference_id, order_index').eq('session_id', sessionId).order('order_index'),
    admin.from('session_participants').select('id, student_id, display_name, score, profiles(full_name, email)').eq('session_id', sessionId).order('joined_at'),
    admin.from('student_responses').select('student_id, question_id, answer, is_correct').eq('session_id', sessionId),
  ])

  // Resolve questions from all quiz items
  const quizIds = (itemsRes.data ?? [])
    .filter((i: Record<string, unknown>) => i.type === 'quiz')
    .map((i: Record<string, unknown>) => i.reference_id as string)

  type QuizRow = { id: string; title: string; questions: { id: string; order_index: number; text: string; type: string; correct_answer: string }[] }
  const quizzesRes = quizIds.length > 0
    ? await admin
      .from('quizzes')
      .select('id, title, questions(id, order_index, text, type, correct_answer)')
      .in('id', quizIds)
    : { data: [] }

  // Build ordered list of questions
  type QuestionEntry = { quizTitle: string; id: string; text: string; order_index: number }
  const questions: QuestionEntry[] = []
  const quizOrder = (itemsRes.data ?? [])
    .filter((i: Record<string, unknown>) => i.type === 'quiz')
    .sort((a: Record<string, unknown>, b: Record<string, unknown>) => (a.order_index as number) - (b.order_index as number))
    .map((i: Record<string, unknown>) => i.reference_id as string)

  const quizMap = new Map((quizzesRes.data ?? []).map((q: QuizRow) => [q.id, q]))
  quizOrder.forEach((qid) => {
    const quiz = quizMap.get(qid) as QuizRow | undefined
    if (!quiz) return
    const sorted = [...(quiz.questions ?? [])].sort((a, b) => a.order_index - b.order_index)
    sorted.forEach((q) => questions.push({ quizTitle: quiz.title, id: q.id, text: q.text, order_index: q.order_index }))
  })

  // Index responses: studentId → questionId → { answer, is_correct }
  type ResponseEntry = { answer: string; is_correct: boolean | null }
  const responseIndex = new Map<string, Map<string, ResponseEntry>>()
  ;(responsesRes.data ?? []).forEach((r: { student_id: string | null; question_id: string; answer: string; is_correct: boolean | null }) => {
    if (!r.student_id) return
    const byQ = responseIndex.get(r.student_id) ?? new Map<string, ResponseEntry>()
    byQ.set(r.question_id, { answer: r.answer, is_correct: r.is_correct })
    responseIndex.set(r.student_id, byQ)
  })

  // Helper to get participant display name
  function participantName(p: { student_id: string | null; display_name: string | null; profiles: unknown }): string {
    if (p.profiles) {
      const prof = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles
      if (prof && typeof prof === 'object') {
        const name = (prof as { full_name?: string }).full_name
        if (name) return name
      }
    }
    return p.display_name ?? 'Guest'
  }
  function participantEmail(p: { profiles: unknown }): string {
    if (p.profiles) {
      const prof = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles
      if (prof && typeof prof === 'object') {
        return (prof as { email?: string }).email ?? ''
      }
    }
    return ''
  }

  // ── Build CSV ──────────────────────────────────────────────────────────────
  const lines: string[] = []

  // Metadata header block
  lines.push(csvRow(['Session', session.title]))
  lines.push(csvRow(['Join code', session.join_code]))
  lines.push(csvRow(['Status', session.status]))
  if (session.started_at) lines.push(csvRow(['Started', new Date(session.started_at).toISOString()]))
  if (session.ended_at) lines.push(csvRow(['Ended', new Date(session.ended_at).toISOString()]))
  if (session.started_at && session.ended_at) {
    const mins = Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60000)
    lines.push(csvRow(['Duration (mins)', mins]))
  }
  lines.push(csvRow(['Total questions', questions.length]))
  lines.push(csvRow(['Total participants', (participantsRes.data ?? []).length]))
  lines.push('')  // blank separator

  // Column headers
  const qHeaders = questions.map((q, i) => `Q${i + 1}: ${q.text.slice(0, 40)}${q.text.length > 40 ? '…' : ''}`)
  lines.push(csvRow(['Student Name', 'Email', ...qHeaders, 'Score', '% Correct']))

  // One data row per participant
  ;(participantsRes.data ?? []).forEach((p: {
    student_id: string | null
    display_name: string | null
    score: number
    profiles: unknown
  }) => {
    const name = participantName(p)
    const email = participantEmail(p)
    const byQ = p.student_id ? (responseIndex.get(p.student_id) ?? new Map()) : new Map()
    const questionCells = questions.map((q) => {
      const r = byQ.get(q.id)
      if (!r) return 'No answer'
      return r.is_correct === true ? 'Correct' : r.is_correct === false ? 'Incorrect' : r.answer
    })
    const correctCount = Array.from(byQ.values()).filter((r) => r.is_correct === true).length
    const pct = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0
    lines.push(csvRow([name, email, ...questionCells, p.score, `${pct}%`]))
  })

  const csv = lines.join('\r\n')
  const filename = `session-results-${session.join_code}.csv`

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  return res.status(200).send('﻿' + csv) // BOM so Excel opens UTF-8 correctly
}
