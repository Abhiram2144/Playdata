import { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

// ── Shared types ──────────────────────────────────────────────────────────────

export interface NewBadgeAward {
  badgeId: string
  code: string
  name: string
  description: string | null
  rarity: string
}

/** Maps studentId → badges earned in this session. Emitted as session:badges. */
export type BadgeAwardsMap = Record<string, NewBadgeAward[]>

interface BadgeRow {
  id: string
  code: string
  name: string
  description: string | null
  criteria_type: string
  criteria_value: number | null
  rarity: string
}

interface ParticipantRow {
  student_id: string
  score: number | null
  best_streak: number | null
}

interface ResponseRow {
  student_id: string | null
  is_correct: boolean | null
  response_time_ms: number | null
  // Supabase returns joined one-row relations as object or array depending on client version.
  questions: { topic_tag: string | null } | { topic_tag: string | null }[] | null
}

interface StatsRow {
  total_points: number | null
  current_login_streak: number | null
  longest_login_streak: number | null
  last_active_date: string | null
}

// ── Topic-tag extraction helper ───────────────────────────────────────────────

function getTopicTag(r: ResponseRow): string | null {
  if (!r.questions) return null
  if (Array.isArray(r.questions)) return r.questions[0]?.topic_tag ?? null
  return (r.questions as { topic_tag: string | null }).topic_tag
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Runs after a session transitions to 'ended':
 *  1. Upserts student_stats for every authenticated participant.
 *  2. Evaluates all badge criteria and inserts newly-earned rows.
 *  3. Emits session:badges to the room (then cleans the room via socketsLeave).
 *
 * Designed to be fire-and-forget from the caller. Never throws — errors are
 * caught internally so the session-end response is never blocked.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function awardPostSessionBadges(io: any, sessionId: string, admin: AdminClient): Promise<void> {
  const today     = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)

  // ── 1. Authenticated participants for this session ────────────────────────
  const { data: participantsRaw } = await admin
    .from('session_participants')
    .select('student_id, score, best_streak')
    .eq('session_id', sessionId)
    .not('student_id', 'is', null)

  const participants = (participantsRaw ?? []) as ParticipantRow[]
  if (!participants.length) return

  const studentIds = participants.map(p => p.student_id)

  // ── 2. Badge definitions (small table — fetch once) ───────────────────────
  const { data: badgesRaw } = await admin
    .from('badges')
    .select('id, code, name, description, criteria_type, criteria_value, rarity')

  const allBadges = (badgesRaw ?? []) as BadgeRow[]
  if (!allBadges.length) return

  // ── 3. Already-earned badges (pre-fetch to avoid duplicate inserts) ───────
  const { data: earnedRaw } = await admin
    .from('student_badges')
    .select('student_id, badge_id')
    .in('student_id', studentIds)

  const earnedSet = new Set(
    ((earnedRaw ?? []) as { student_id: string; badge_id: string }[])
      .map(e => `${e.student_id}:${e.badge_id}`)
  )

  // ── 4. This session's responses grouped by student ────────────────────────
  const { data: sessionRespsRaw } = await admin
    .from('student_responses')
    .select('student_id, is_correct, response_time_ms, questions(topic_tag)')
    .eq('session_id', sessionId)
    .in('student_id', studentIds)

  const sessionRespByStudent = new Map<string, ResponseRow[]>()
  for (const r of (sessionRespsRaw ?? []) as unknown as ResponseRow[]) {
    if (!r.student_id) continue
    const list = sessionRespByStudent.get(r.student_id) ?? []
    list.push(r)
    sessionRespByStudent.set(r.student_id, list)
  }

  // ── 5. Process each participant sequentially ──────────────────────────────
  const awardsMap: BadgeAwardsMap = {}

  for (const p of participants) {
    const studentId   = p.student_id
    const sessionScore = p.score   ?? 0
    const bestStreak  = p.best_streak ?? 0
    const myResps     = sessionRespByStudent.get(studentId) ?? []

    try {
      // ── 5a. student_stats upsert ──────────────────────────────────────────
      const { data: statsRaw } = await admin
        .from('student_stats')
        .select('total_points, current_login_streak, longest_login_streak, last_active_date')
        .eq('student_id', studentId)
        .maybeSingle()

      const prev        = statsRaw as StatsRow | null
      const newPoints   = (prev?.total_points ?? 0) + sessionScore
      const newLevel    = Math.floor(newPoints / 500) + 1
      const lastActive  = prev?.last_active_date ?? null

      let newLoginStreak: number
      if (!lastActive || lastActive < yesterday) {
        // First-ever session, or gap longer than one day — reset.
        newLoginStreak = 1
      } else if (lastActive === yesterday) {
        // Consecutive day — extend the streak.
        newLoginStreak = (prev?.current_login_streak ?? 0) + 1
      } else {
        // lastActive === today — already counted, leave unchanged.
        newLoginStreak = prev?.current_login_streak ?? 1
      }

      const newLongest = Math.max(prev?.longest_login_streak ?? 0, newLoginStreak)

      await admin.from('student_stats').upsert(
        {
          student_id:           studentId,
          total_points:         newPoints,
          level:                newLevel,
          current_login_streak: newLoginStreak,
          longest_login_streak: newLongest,
          last_active_date:     today,
          updated_at:           new Date().toISOString(),
        },
        { onConflict: 'student_id' }
      )

      // ── 5b. Badge criteria ────────────────────────────────────────────────

      // sessions_joined — total participations across all sessions.
      const { count: sessionsJoined } = await admin
        .from('session_participants')
        .select('id', { count: 'exact', head: true })
        .eq('student_id', studentId)

      // perfect_session — every response in this session was correct.
      const correctCount = myResps.filter(r => r.is_correct === true).length
      const isPerfect    = myResps.length > 0 && correctCount === myResps.length

      // fast_answers — cumulative responses submitted in < 2 000 ms.
      const { count: fastAnswers } = await admin
        .from('student_responses')
        .select('id', { count: 'exact', head: true })
        .eq('student_id', studentId)
        .not('response_time_ms', 'is', null)
        .lt('response_time_ms', 2000)

      // topic_mastery — highest per-tag accuracy across all historical responses.
      const { data: allRespsRaw } = await admin
        .from('student_responses')
        .select('is_correct, questions(topic_tag)')
        .eq('student_id', studentId)

      const topicAcc = new Map<string, { correct: number; total: number }>()
      for (const r of (allRespsRaw ?? []) as unknown as ResponseRow[]) {
        const tag = getTopicTag(r)
        if (!tag) continue
        const entry = topicAcc.get(tag) ?? { correct: 0, total: 0 }
        entry.total++
        if (r.is_correct) entry.correct++
        topicAcc.set(tag, entry)
      }
      const maxTopicPct = topicAcc.size > 0
        ? Math.max(...Array.from(topicAcc.values()).map(t => t.total > 0 ? (t.correct / t.total) * 100 : 0))
        : 0

      // ── 5c. Award badges ──────────────────────────────────────────────────
      const newAwards: NewBadgeAward[] = []

      for (const badge of allBadges) {
        if (earnedSet.has(`${studentId}:${badge.id}`)) continue

        const threshold = badge.criteria_value ?? 0
        let qualifies   = false

        switch (badge.criteria_type) {
          case 'sessions_joined':
            qualifies = (sessionsJoined ?? 0) >= threshold
            break
          case 'perfect_session':
            qualifies = isPerfect
            break
          case 'fast_answers':
            qualifies = (fastAnswers ?? 0) >= threshold
            break
          case 'in_session_streak':
            qualifies = bestStreak >= threshold
            break
          case 'login_streak':
            qualifies = newLoginStreak >= threshold
            break
          case 'topic_mastery':
            qualifies = maxTopicPct >= threshold
            break
        }

        if (!qualifies) continue

        const { error } = await admin.from('student_badges').insert({
          student_id: studentId,
          badge_id:   badge.id,
          session_id: sessionId,
          earned_at:  new Date().toISOString(),
        })

        if (!error) {
          newAwards.push({
            badgeId:     badge.id,
            code:        badge.code,
            name:        badge.name,
            description: badge.description,
            rarity:      badge.rarity,
          })
          // Guard against duplicate award within the same run.
          earnedSet.add(`${studentId}:${badge.id}`)
        }
        // UNIQUE constraint violation → silently ignored; badge was already awarded.
      }

      if (newAwards.length > 0) {
        awardsMap[studentId] = newAwards
      }
    } catch (err) {
      console.error('[badges] error processing student', studentId, err)
    }
  }

  // ── 6. Broadcast badge map, then clean up the socket room ─────────────────
  if (io) {
    if (Object.keys(awardsMap).length > 0) {
      io.to(`session:${sessionId}`).emit('session:badges', awardsMap)
    }
    // Room cleanup — safe to call after badge emission since Socket.IO
    // delivers events before processing the leave command.
    io.socketsLeave(`session:${sessionId}`)
  }
}
