import { createAdminClient } from '@/lib/supabase/admin'

export interface SessionAnalyticsRow {
  session_id: string
  avg_score: number | null
  participation_rate: number | null
  completion_rate: number | null
  total_questions: number
  participant_count: number
  computed_at: string
}

// Reads raw tables and upserts a single row into session_analytics so later
// views never need to re-aggregate over student_responses again.
export async function computeAndStoreAnalytics(
  sessionId: string,
  admin: ReturnType<typeof createAdminClient>
): Promise<SessionAnalyticsRow> {
  const [participantsRes, itemsRes, responsesRes] = await Promise.all([
    admin.from('session_participants').select('student_id, score').eq('session_id', sessionId),
    admin.from('session_items').select('type, reference_id').eq('session_id', sessionId),
    admin.from('student_responses').select('student_id, question_id').eq('session_id', sessionId),
  ])

  const participants = participantsRes.data ?? []
  const items = itemsRes.data ?? []
  const responses = responsesRes.data ?? []

  // Total questions across all quiz items in this session
  const quizIds = items
    .filter((i: Record<string, unknown>) => i.type === 'quiz')
    .map((i: Record<string, unknown>) => i.reference_id as string)

  let totalQuestions = items.filter((i: Record<string, unknown>) => i.type === 'question').length
  if (quizIds.length > 0) {
    const { count } = await admin
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .in('quiz_id', quizIds)
    totalQuestions += count ?? 0
  }

  const participantCount = participants.length

  // avg_score: mean raw score (correct-answer count) across all participants
  const avgScore =
    participantCount > 0
      ? participants.reduce((sum: number, p: { score: number }) => sum + (p.score ?? 0), 0) /
        participantCount
      : null

  // participation_rate (0–1): fraction of participants who submitted ≥1 response
  const respondedIds = new Set(
    responses
      .map((r: { student_id: string | null }) => r.student_id)
      .filter(Boolean)
  )
  const participationRate =
    participantCount > 0 ? respondedIds.size / participantCount : null

  // completion_rate (0–1): average fraction of questions answered per participant
  let completionRate: number | null = null
  if (participantCount > 0 && totalQuestions > 0) {
    const answeredByStudent = new Map<string, Set<string>>()
    responses.forEach((r: { student_id: string | null; question_id: string }) => {
      if (!r.student_id) return
      const set = answeredByStudent.get(r.student_id) ?? new Set<string>()
      set.add(r.question_id)
      answeredByStudent.set(r.student_id, set)
    })

    let totalFraction = 0
    participants.forEach((p: { student_id: string | null }) => {
      if (!p.student_id) return
      const answered = answeredByStudent.get(p.student_id)?.size ?? 0
      totalFraction += answered / totalQuestions
    })
    completionRate = totalFraction / participantCount
  }

  const row: SessionAnalyticsRow = {
    session_id: sessionId,
    avg_score: avgScore,
    participation_rate: participationRate,
    completion_rate: completionRate,
    total_questions: totalQuestions,
    participant_count: participantCount,
    computed_at: new Date().toISOString(),
  }

  await admin.from('session_analytics').upsert(row, { onConflict: 'session_id' })

  return row
}
