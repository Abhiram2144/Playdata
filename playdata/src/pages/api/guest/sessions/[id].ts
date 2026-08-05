import type { NextApiRequest, NextApiResponse } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const sessionId = req.query.id as string
  const guestToken = req.query.guest_token as string
  if (!guestToken) return res.status(400).json({ error: 'guest_token is required' })

  const admin = createAdminClient()

  const { data: participant } = await admin
    .from('session_participants')
    .select('id, score, guest_name, guest_student_id')
    .eq('session_id', sessionId)
    .eq('guest_token', guestToken)
    .maybeSingle()

  if (!participant) return res.status(403).json({ error: 'Not a participant in this session' })

  const { data: session } = await admin
    .from('sessions')
    .select('id, title, join_code, status, current_item, started_at, ended_at')
    .eq('id', sessionId)
    .single()

  if (!session) return res.status(404).json({ error: 'Session not found' })

  const { data: rawItems } = await admin
    .from('session_items')
    .select('id, type, reference_id, order_index')
    .eq('session_id', sessionId)
    .order('order_index')

  const items = rawItems ?? []
  const quizIds = items.filter((i) => i.type === 'quiz').map((i) => i.reference_id as string)
  const visIds = items.filter((i) => i.type === 'visualisation').map((i) => i.reference_id as string)
  const questionIds = items.filter((i) => i.type === 'question').map((i) => i.reference_id as string)

  type QuizQuestionRaw = { id: string; text: string; type: string; options: unknown; correct_answer: string; time_limit_secs: number; order_index: number; visualisation_ids: string[] | null }
  type QuizRow = { id: string; title: string; allow_student_charts: boolean; questions: QuizQuestionRaw[] }
  type VisRow = { id: string; name: string; chart_type: string; config: Record<string, unknown>; dataset_id: string | null }
  type QuestionRow = { id: string; text: string; type: string; options: unknown; correct_answer: string; time_limit_secs: number }

  const [quizzesRes, visRes, questionsRes] = await Promise.all([
    quizIds.length > 0
      ? admin.from('quizzes').select('id, title, allow_student_charts, questions(id, text, type, options, correct_answer, time_limit_secs, order_index, visualisation_ids)').in('id', quizIds)
      : { data: [] },
    visIds.length > 0
      ? admin.from('visualisations').select('id, name, chart_type, config, dataset_id').in('id', visIds)
      : { data: [] },
    questionIds.length > 0
      ? admin.from('questions').select('id, text, type, options, correct_answer, time_limit_secs').in('id', questionIds)
      : { data: [] },
  ])

  const quizQuestionVisIds = new Set<string>()
  for (const quiz of (quizzesRes.data ?? []) as QuizRow[]) {
    for (const q of quiz.questions ?? []) {
      for (const visId of q.visualisation_ids ?? []) {
        quizQuestionVisIds.add(visId)
      }
    }
  }
  const missingVisIds = [...quizQuestionVisIds].filter((id) => !visIds.includes(id))
  const questionVisRes = missingVisIds.length > 0
    ? await admin.from('visualisations').select('id, name, chart_type, config, dataset_id').in('id', missingVisIds)
    : { data: [] }

  const quizMap = new Map((quizzesRes.data ?? []).map((q: QuizRow) => [q.id, q]))
  const visMap = new Map([
    ...(visRes.data ?? []).map((v: VisRow) => [v.id, v] as [string, VisRow]),
    ...(questionVisRes.data ?? []).map((v: VisRow) => [v.id, v] as [string, VisRow]),
  ])
  const qMap = new Map((questionsRes.data ?? []).map((q: QuestionRow) => [q.id, q]))

  const enrichedItems = items.map((item) => {
    const ref = item.reference_id as string
    if (item.type === 'quiz') {
      const q = quizMap.get(ref) as QuizRow | undefined
      const quizQuestions = (Array.isArray(q?.questions) ? [...q!.questions] : [])
        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
        .map((qq) => ({
          ...qq,
          visualisation_ids: qq.visualisation_ids ?? [],
          visualisations: (qq.visualisation_ids ?? []).map((visId: string) => visMap.get(visId)).filter(Boolean),
        }))
      return { ...item, title: q?.title ?? 'Quiz', allow_student_charts: q?.allow_student_charts ?? false, quizQuestions }
    }
    if (item.type === 'visualisation') {
      const v = visMap.get(ref) as VisRow | undefined
      return { ...item, title: v?.name ?? 'Chart', chart_type: v?.chart_type ?? 'bar', config: v?.config ?? {}, dataset_id: v?.dataset_id ?? null }
    }
    const q = qMap.get(ref) as QuestionRow | undefined
    return {
      ...item,
      title: q?.text ?? 'Question',
      question_type: q?.type ?? 'short_answer',
      options: q?.options ?? null,
      correct_answer: q?.correct_answer ?? '',
      time_limit_secs: q?.time_limit_secs ?? 0,
    }
  })

  const { data: myResponses } = await admin
    .from('student_responses')
    .select('id, question_id, answer, is_correct, submitted_at')
    .eq('session_id', sessionId)
    .eq('guest_token', guestToken)

  return res.status(200).json({
    session,
    items: enrichedItems,
    participant: { id: participant.id, score: participant.score },
    myResponses: myResponses ?? [],
    guestName: participant.guest_name,
    guestStudentId: participant.guest_student_id,
  })
}
