import type { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  TrendDir, AnalyticsOverview, StudentStat, TopicStat, TrendPoint, ClassroomAnalytics,
} from '@/types/classroom-analytics'

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


export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

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

  // ── Fetch sessions scoped to this classroom ────────────────────────────────
  const { data: sessions } = await admin
    .from('sessions')
    .select('id, title, started_at')
    .eq('classroom_id', classroomId)
    .order('started_at', { ascending: true })

  const sessionIds = (sessions ?? []).map(s => s.id as string)
  const totalSessions = sessionIds.length

  if (totalSessions === 0) {
    return res.status(200).json({
      overview: { total_sessions: 0, total_students: 0, avg_score: null, trend: null, trend_delta_pp: null },
      students: [],
      topics: [],
      trend: [],
    } satisfies ClassroomAnalytics)
  }

  // ── Parallel fetch: active roster, participants, responses ─────────────────
  const [
    { data: activeMembers },
    { data: participants },
    { data: responses },
  ] = await Promise.all([
    admin
      .from('classroom_students')
      .select('student_id, email, profiles(full_name)')
      .eq('classroom_id', classroomId)
      .eq('status', 'active'),
    admin
      .from('session_participants')
      .select('session_id, student_id')
      .in('session_id', sessionIds)
      .limit(10000),
    admin
      .from('student_responses')
      .select('session_id, student_id, question_id, is_correct')
      .in('session_id', sessionIds)
      .limit(10000),
  ])

  const allResponses = responses ?? []

  // Fetch topic tags only for questions that appear in responses
  const questionIds = [...new Set(allResponses.map(r => r.question_id as string))]
  const questionTopics: Record<string, string | null> = {}
  if (questionIds.length > 0) {
    const { data: questions } = await admin
      .from('questions')
      .select('id, topic_tag')
      .in('id', questionIds)
    for (const q of questions ?? []) {
      questionTopics[q.id as string] = (q.topic_tag as string | null) ?? null
    }
  }

  // ── Gamification: fetch student_stats (gracefully skipped on any error) ────
  type MemberRow = {
    student_id: string | null
    email: string
    profiles: { full_name: string } | { full_name: string }[] | null
  }

  const memberStudentIds = (activeMembers ?? [])
    .filter((m: MemberRow) => m.student_id)
    .map((m: MemberRow) => m.student_id as string)

  const gamificationMap: Record<string, { current_streak: number; total_points: number }> = {}
  if (memberStudentIds.length > 0) {
    const { data: statsRows, error: statsError } = await admin
      .from('student_stats')
      .select('student_id, current_streak, total_points')
      .in('student_id', memberStudentIds)
    if (!statsError && statsRows) {
      for (const s of statsRows) {
        gamificationMap[s.student_id as string] = {
          current_streak: s.current_streak as number,
          total_points: s.total_points as number,
        }
      }
    }
  }

  // ── Overview ───────────────────────────────────────────────────────────────
  const uniqueParticipants = new Set((participants ?? []).map(p => p.student_id as string))
  const totalStudents = uniqueParticipants.size

  const avgScore =
    allResponses.length > 0
      ? (allResponses.filter(r => r.is_correct === true).length / allResponses.length) * 100
      : null

  // ── Per-session accuracy for trend chart ──────────────────────────────────
  const sessionAcc: Record<string, { correct: number; total: number }> = {}
  for (const r of allResponses) {
    const sid = r.session_id as string
    if (!sessionAcc[sid]) sessionAcc[sid] = { correct: 0, total: 0 }
    sessionAcc[sid].total++
    if (r.is_correct === true) sessionAcc[sid].correct++
  }

  const trendData: TrendPoint[] = (sessions ?? [])
    .filter(s => (sessionAcc[s.id as string]?.total ?? 0) > 0)
    .map(s => ({
      session_id: s.id as string,
      title: s.title as string,
      date: s.started_at as string | null,
      avg_score: (sessionAcc[s.id as string].correct / sessionAcc[s.id as string].total) * 100,
    }))

  // Trend: avg of 3 most recent sessions vs avg of 3 before that
  let trend: TrendDir | null = null
  let trendDeltaPp: number | null = null
  if (trendData.length >= 4) {
    const recent = trendData.slice(-3)
    const prior = trendData.slice(-6, -3)
    if (prior.length > 0) {
      const recentAvg = recent.reduce((s, p) => s + p.avg_score, 0) / recent.length
      const priorAvg = prior.reduce((s, p) => s + p.avg_score, 0) / prior.length
      trendDeltaPp = recentAvg - priorAvg
      trend = trendDeltaPp > 2 ? 'up' : trendDeltaPp < -2 ? 'down' : 'flat'
    }
  }

  // ── Per-student breakdown (all active members, including 0-attendance) ─────
  const studentSessions: Record<string, Set<string>> = {}
  for (const p of (participants ?? [])) {
    const sid = p.student_id as string
    if (sid) {
      if (!studentSessions[sid]) studentSessions[sid] = new Set()
      studentSessions[sid].add(p.session_id as string)
    }
  }

  const sessionDate: Record<string, string | null> = Object.fromEntries(
    (sessions ?? []).map(s => [s.id as string, s.started_at as string | null])
  )

  const studentAcc: Record<string, { correct: number; total: number; lastDate: string | null }> = {}
  for (const r of allResponses) {
    const sid = r.student_id as string
    if (!sid) continue
    if (!studentAcc[sid]) studentAcc[sid] = { correct: 0, total: 0, lastDate: null }
    studentAcc[sid].total++
    if (r.is_correct === true) studentAcc[sid].correct++
    const d = sessionDate[r.session_id as string]
    if (d && (!studentAcc[sid].lastDate || d > studentAcc[sid].lastDate!)) {
      studentAcc[sid].lastDate = d
    }
  }

  const studentBreakdown: StudentStat[] = (activeMembers ?? []).map((m: MemberRow) => {
    const prof = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
    const sid = m.student_id
    const attended = sid ? (studentSessions[sid]?.size ?? 0) : 0
    const acc = sid ? studentAcc[sid] : null
    const gam = sid ? gamificationMap[sid] : undefined
    return {
      student_id: sid,
      email: m.email,
      full_name: prof?.full_name ?? null,
      sessions_attended: attended,
      total_sessions: totalSessions,
      avg_score: acc && acc.total > 0 ? (acc.correct / acc.total) * 100 : null,
      last_session_date: acc?.lastDate ?? null,
      current_streak: gam?.current_streak ?? null,
      total_points: gam?.total_points ?? null,
    }
  })

  // ── Topic breakdown — weakest first (ascending accuracy) ──────────────────
  const topicAcc: Record<string, { correct: number; total: number }> = {}
  for (const r of allResponses) {
    const raw = questionTopics[r.question_id as string]
    const tag = raw ?? 'Untagged'
    if (!topicAcc[tag]) topicAcc[tag] = { correct: 0, total: 0 }
    topicAcc[tag].total++
    if (r.is_correct === true) topicAcc[tag].correct++
  }

  const topicBreakdown: TopicStat[] = Object.entries(topicAcc)
    .map(([topic, s]) => ({
      topic,
      accuracy_pct: (s.correct / s.total) * 100,
      total_responses: s.total,
      correct_responses: s.correct,
    }))
    .sort((a, b) => a.accuracy_pct - b.accuracy_pct) // weakest first

  return res.status(200).json({
    overview: {
      total_sessions: totalSessions,
      total_students: totalStudents,
      avg_score: avgScore,
      trend,
      trend_delta_pp: trendDeltaPp,
    },
    students: studentBreakdown,
    topics: topicBreakdown,
    trend: trendData,
  } satisfies ClassroomAnalytics)
}
