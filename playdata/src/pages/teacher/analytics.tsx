import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ArrowRight, BarChart2, Users, CheckCircle2, Activity,
  Clock, TrendingUp, BookOpen,
} from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { GetServerSidePropsResult } from 'next'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { TEACHER_NAV } from '@/lib/teacher-nav'
import { withAuth } from '@/lib/auth'
import { createClientFromContext } from '@/lib/supabase/server-props'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeAndStoreAnalytics, SessionAnalyticsRow } from '@/lib/session-analytics'
import { categoricalColor, CHART_PRIMARY, CHART_AXIS_STYLE } from '@/lib/chart-colors'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Profile {
  id: string
  full_name: string
  email: string
  role: string
}

interface SessionRow {
  id: string
  title: string
  join_code: string
  started_at: string | null
  ended_at: string | null
  avg_score: number | null
  participation_rate: number | null
  completion_rate: number | null
  total_questions: number
  participant_count: number
  duration_mins: number | null
}

interface SummaryStats {
  total_sessions: number
  total_participants: number
  avg_score_pct: number | null
  avg_participation_pct: number | null
}

interface TopicAccuracy {
  topic: string
  accuracy_pct: number
  responses: number
}

interface HardQuestion {
  text: string
  quiz_title: string
  pct_correct: number
  responses: number
}

interface DistributionBucket {
  bucket: string
  count: number
}

interface ClassroomStat {
  name: string
  accuracy_pct: number | null
  participation_pct: number | null
  sessions: number
}

interface Props {
  profile: Profile
  sessions: SessionRow[]
  summary: SummaryStats
  topics: TopicAccuracy[]
  hardest: HardQuestion[]
  distribution: DistributionBucket[]
  classrooms: ClassroomStat[]
}

// ── Server-side data ───────────────────────────────────────────────────────────

export const getServerSideProps = withAuth(
  async (context, userId): Promise<GetServerSidePropsResult<Props>> => {
    const supabase = createClientFromContext(context)
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .eq('id', userId)
      .single()

    if (!profile) return { redirect: { destination: '/auth/login', permanent: false } }
    if ((profile as { role: string }).role !== 'teacher') {
      return { redirect: { destination: '/student/dashboard', permanent: false } }
    }

    const admin = createAdminClient()

    // Fetch all ended sessions for this teacher, joined with analytics
    const { data: rawSessions } = await admin
      .from('sessions')
      .select(`
        id, title, join_code, started_at, ended_at, classroom_id,
        session_analytics(avg_score, participation_rate, completion_rate, total_questions, participant_count)
      `)
      .eq('teacher_id', userId)
      .eq('status', 'ended')
      .order('ended_at', { ascending: false })

    // Backfill: sessions ended before analytics stored participant_count /
    // total_questions (or before the analytics table was written at all) have
    // missing or zeroed rows — recompute them once so the page has real data.
    const recomputed = new Map<string, SessionAnalyticsRow>()
    await Promise.all(
      (rawSessions ?? []).map(async (s: Record<string, unknown>) => {
        const a = Array.isArray(s.session_analytics)
          ? (s.session_analytics[0] as Record<string, unknown> | undefined)
          : (s.session_analytics as Record<string, unknown> | undefined)
        if (!a || ((a.participant_count as number | null) ?? 0) === 0) {
          try {
            recomputed.set(s.id as string, await computeAndStoreAnalytics(s.id as string, admin))
          } catch {
            // non-fatal — the row just renders with dashes
          }
        }
      })
    )

    const sessions: SessionRow[] = (rawSessions ?? []).map((s: Record<string, unknown>) => {
      const analytics: Record<string, unknown> | undefined =
        recomputed.get(s.id as string) as unknown as Record<string, unknown> | undefined ??
        (Array.isArray(s.session_analytics)
          ? (s.session_analytics[0] as Record<string, unknown> | undefined)
          : (s.session_analytics as Record<string, unknown> | undefined))

      const durationMins =
        s.started_at && s.ended_at
          ? Math.round(
              (new Date(s.ended_at as string).getTime() - new Date(s.started_at as string).getTime()) / 60000
            )
          : null

      return {
        id: s.id as string,
        title: s.title as string,
        join_code: s.join_code as string,
        started_at: s.started_at as string | null,
        ended_at: s.ended_at as string | null,
        avg_score: analytics ? (analytics.avg_score as number | null) : null,
        participation_rate: analytics ? (analytics.participation_rate as number | null) : null,
        completion_rate: analytics ? (analytics.completion_rate as number | null) : null,
        total_questions: analytics ? ((analytics.total_questions as number) ?? 0) : 0,
        participant_count: analytics ? ((analytics.participant_count as number) ?? 0) : 0,
        duration_mins: durationMins,
      }
    })

    // Cross-session summary
    const withAnalytics = sessions.filter((s) => s.participant_count > 0)
    const totalParticipants = sessions.reduce((sum, s) => sum + s.participant_count, 0)
    const avgScorePct =
      withAnalytics.length > 0 && withAnalytics.some((s) => s.avg_score !== null && s.total_questions > 0)
        ? Math.round(
            withAnalytics
              .filter((s) => s.avg_score !== null && s.total_questions > 0)
              .reduce((sum, s) => sum + ((s.avg_score! / s.total_questions) * 100), 0) /
              withAnalytics.filter((s) => s.avg_score !== null && s.total_questions > 0).length
          )
        : null
    const avgParticipationPct =
      withAnalytics.length > 0 && withAnalytics.some((s) => s.participation_rate !== null)
        ? Math.round(
            withAnalytics
              .filter((s) => s.participation_rate !== null)
              .reduce((sum, s) => sum + s.participation_rate! * 100, 0) /
              withAnalytics.filter((s) => s.participation_rate !== null).length
          )
        : null

    const summary: SummaryStats = {
      total_sessions: sessions.length,
      total_participants: totalParticipants,
      avg_score_pct: avgScorePct,
      avg_participation_pct: avgParticipationPct,
    }

    // ── Deeper insights: topics, hardest questions, distribution, classrooms ──
    const sessionIds = sessions.map((s) => s.id)

    let topics: TopicAccuracy[] = []
    let hardest: HardQuestion[] = []
    let distribution: DistributionBucket[] = []
    let classroomStats: ClassroomStat[] = []

    if (sessionIds.length > 0) {
      const { data: responses } = await admin
        .from('student_responses')
        .select('session_id, student_id, question_id, is_correct')
        .in('session_id', sessionIds)
        .limit(10000)
      const allResponses = responses ?? []

      const questionIds = [...new Set(allResponses.map((r) => r.question_id as string))]
      type QuestionMeta = { id: string; topic_tag: string | null; text: string; quizzes: { title: string } | { title: string }[] | null }
      const questionMeta = new Map<string, QuestionMeta>()
      if (questionIds.length > 0) {
        const { data: questions } = await admin
          .from('questions')
          .select('id, topic_tag, text, quizzes(title)')
          .in('id', questionIds)
        for (const q of (questions ?? []) as QuestionMeta[]) questionMeta.set(q.id, q)
      }

      // Accuracy by topic (weakest first)
      const topicAcc: Record<string, { correct: number; total: number }> = {}
      for (const r of allResponses) {
        const tag = questionMeta.get(r.question_id as string)?.topic_tag ?? 'Untagged'
        if (!topicAcc[tag]) topicAcc[tag] = { correct: 0, total: 0 }
        topicAcc[tag].total++
        if (r.is_correct === true) topicAcc[tag].correct++
      }
      topics = Object.entries(topicAcc)
        .map(([topic, s]) => ({
          topic,
          accuracy_pct: Math.round((s.correct / s.total) * 100),
          responses: s.total,
        }))
        .sort((a, b) => a.accuracy_pct - b.accuracy_pct)

      // Hardest questions (lowest correct rate, ≥2 responses so a single
      // wrong answer doesn't dominate the ranking)
      const qAcc: Record<string, { correct: number; total: number }> = {}
      for (const r of allResponses) {
        const qid = r.question_id as string
        if (!qAcc[qid]) qAcc[qid] = { correct: 0, total: 0 }
        qAcc[qid].total++
        if (r.is_correct === true) qAcc[qid].correct++
      }
      hardest = Object.entries(qAcc)
        .filter(([, s]) => s.total >= 2)
        .map(([qid, s]) => {
          const meta = questionMeta.get(qid)
          const quiz = meta?.quizzes
          const quizTitle = Array.isArray(quiz) ? quiz[0]?.title ?? '' : quiz?.title ?? ''
          return {
            text: meta?.text ?? 'Unknown question',
            quiz_title: quizTitle,
            pct_correct: Math.round((s.correct / s.total) * 100),
            responses: s.total,
          }
        })
        .sort((a, b) => a.pct_correct - b.pct_correct)
        .slice(0, 8)

      // Student accuracy distribution (per participant across all sessions)
      const perStudent: Record<string, { correct: number; total: number }> = {}
      for (const r of allResponses) {
        const key = `${r.session_id}:${r.student_id}`
        if (!r.student_id) continue
        if (!perStudent[key]) perStudent[key] = { correct: 0, total: 0 }
        perStudent[key].total++
        if (r.is_correct === true) perStudent[key].correct++
      }
      const buckets = [
        { bucket: '0–20%', min: 0, max: 20, count: 0 },
        { bucket: '21–40%', min: 21, max: 40, count: 0 },
        { bucket: '41–60%', min: 41, max: 60, count: 0 },
        { bucket: '61–80%', min: 61, max: 80, count: 0 },
        { bucket: '81–100%', min: 81, max: 100, count: 0 },
      ]
      for (const s of Object.values(perStudent)) {
        if (s.total === 0) continue
        const pct = Math.round((s.correct / s.total) * 100)
        const b = buckets.find((b) => pct >= b.min && pct <= b.max)
        if (b) b.count++
      }
      distribution = buckets.map(({ bucket, count }) => ({ bucket, count }))

      // Classroom comparison
      const classroomOfSession = new Map<string, string>()
      for (const s of (rawSessions ?? []) as Record<string, unknown>[]) {
        if (s.classroom_id) classroomOfSession.set(s.id as string, s.classroom_id as string)
      }
      const classroomIds = [...new Set(classroomOfSession.values())]
      if (classroomIds.length > 0) {
        const { data: classroomRows } = await admin
          .from('classrooms')
          .select('id, name')
          .in('id', classroomIds)
        const classroomName = new Map((classroomRows ?? []).map((c) => [c.id as string, c.name as string]))

        const byClassroom: Record<string, { correct: number; total: number; sessions: Set<string>; participationSum: number; participationN: number }> = {}
        for (const r of allResponses) {
          const cid = classroomOfSession.get(r.session_id as string)
          if (!cid) continue
          if (!byClassroom[cid]) byClassroom[cid] = { correct: 0, total: 0, sessions: new Set(), participationSum: 0, participationN: 0 }
          byClassroom[cid].total++
          byClassroom[cid].sessions.add(r.session_id as string)
          if (r.is_correct === true) byClassroom[cid].correct++
        }
        for (const s of sessions) {
          const cid = classroomOfSession.get(s.id)
          if (!cid || s.participation_rate === null) continue
          if (!byClassroom[cid]) byClassroom[cid] = { correct: 0, total: 0, sessions: new Set(), participationSum: 0, participationN: 0 }
          byClassroom[cid].sessions.add(s.id)
          byClassroom[cid].participationSum += s.participation_rate * 100
          byClassroom[cid].participationN++
        }
        classroomStats = Object.entries(byClassroom)
          .map(([cid, s]) => ({
            name: classroomName.get(cid) ?? 'Classroom',
            accuracy_pct: s.total > 0 ? Math.round((s.correct / s.total) * 100) : null,
            participation_pct: s.participationN > 0 ? Math.round(s.participationSum / s.participationN) : null,
            sessions: s.sessions.size,
          }))
          .sort((a, b) => (b.accuracy_pct ?? 0) - (a.accuracy_pct ?? 0))
      }
    }

    return {
      props: {
        profile: profile as Profile,
        sessions,
        summary,
        topics,
        hardest,
        distribution,
        classrooms: classroomStats,
      },
    }
  }
)

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function pct(rate: number | null): string {
  if (rate === null) return '—'
  return `${Math.round(rate * 100)}%`
}

function avgScorePct(avg: number | null, total: number): string {
  if (avg === null || total === 0) return '—'
  return `${Math.round((avg / total) * 100)}%`
}

function ScoreBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  const color =
    pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-rose-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      {/* value is always shown as text so the colour above is reinforcement, not the only signal */}
      <span className="text-xs text-gray-600 w-9 text-right">{pct}%</span>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AnalyticsPage({ profile, sessions, summary, topics, hardest, distribution, classrooms }: Props) {
  const hasInsights = topics.length > 0 || hardest.length > 0 || distribution.some((d) => d.count > 0) || classrooms.length > 0
  return (
    <DashboardLayout
      navItems={TEACHER_NAV}
      profile={profile}
    >
      <div className="p-6 max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Analytics</p>
          <h1 className="mt-0.5 text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="mt-1 text-sm text-gray-500">Cross-session overview of all ended sessions</p>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            {
              label: 'Sessions',
              value: String(summary.total_sessions),
              icon: <BookOpen className="h-4 w-4" />,
              color: 'text-violet-700',
              bg: 'bg-violet-50 ring-1 ring-violet-200',
            },
            {
              label: 'Total participants',
              value: String(summary.total_participants),
              icon: <Users className="h-4 w-4" />,
              color: 'text-sky-700',
              bg: 'bg-sky-50 ring-1 ring-sky-200',
            },
            {
              label: 'Avg score',
              value: summary.avg_score_pct !== null ? `${summary.avg_score_pct}%` : '—',
              icon: <TrendingUp className="h-4 w-4" />,
              color: 'text-emerald-700',
              bg: 'bg-emerald-50 ring-1 ring-emerald-200',
            },
            {
              label: 'Avg participation',
              value: summary.avg_participation_pct !== null ? `${summary.avg_participation_pct}%` : '—',
              icon: <Activity className="h-4 w-4" />,
              color: 'text-amber-700',
              bg: 'bg-amber-50 ring-1 ring-amber-200',
            },
          ].map((stat) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className={`rounded-xl p-4 space-y-1 ${stat.bg}`}
            >
              <div className={`flex items-center gap-1.5 text-xs font-medium ${stat.color}`}>
                {stat.icon}
                {stat.label}
              </div>
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
            </motion.div>
          ))}
        </div>

        {/* Charts — only when there are enough sessions to be meaningful */}
        {sessions.length >= 2 && (() => {
          const chartData = [...sessions].reverse().map((s) => ({
            label: s.ended_at
              ? new Date(s.ended_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
              : '—',
            score: s.total_questions > 0 && s.avg_score !== null
              ? Math.round((s.avg_score / s.total_questions) * 100)
              : undefined,
            participation: s.participation_rate !== null
              ? Math.round(s.participation_rate * 100)
              : undefined,
            completion: s.completion_rate !== null
              ? Math.round(s.completion_rate * 100)
              : undefined,
            participants: s.participant_count,
          }))

          return (
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Score trend */}
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
                <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-500">Avg score trend</p>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={CHART_AXIS_STYLE} />
                    <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={CHART_AXIS_STYLE} />
                    <Tooltip
                      formatter={(v) => [`${v ?? 0}%`, 'Avg score']}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke={CHART_PRIMARY}
                      strokeWidth={2}
                      dot={{ r: 3, fill: CHART_PRIMARY }}
                      connectNulls
                      name="Avg score"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Participation & completion */}
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
                <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-500">Participation & completion</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey="label" tick={CHART_AXIS_STYLE} />
                    <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={CHART_AXIS_STYLE} />
                    <Tooltip
                      formatter={(v, name) => [`${v ?? 0}%`, String(name)]}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {/* Two series distinguished by an Okabe-Ito pair (orange/blue) rather than
                        cyan-vs-emerald, which sit too close together under deuteranopia. */}
                    <Bar dataKey="participation" name="Participation" fill={categoricalColor(0)} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="completion" name="Completion" fill={categoricalColor(4)} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Participant count over time */}
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 lg:col-span-2">
                <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-500">Participants per session</p>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} barCategoryGap="40%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey="label" tick={CHART_AXIS_STYLE} />
                    <YAxis allowDecimals={false} tick={CHART_AXIS_STYLE} />
                    <Tooltip
                      formatter={(v) => [v ?? 0, 'Participants']}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                    />
                    <Bar dataKey="participants" name="Participants" fill={CHART_PRIMARY} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )
        })()}

        {/* Deeper insights */}
        {hasInsights && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Deeper insights</p>
              <p className="mt-0.5 text-sm text-gray-500">Where the class is strongest and weakest, across all your ended sessions</p>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">

              {/* Accuracy by topic */}
              {topics.length > 0 && (
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-gray-500">Accuracy by topic</p>
                  <p className="mb-4 text-xs text-gray-500">Weakest topics first — these need revisiting</p>
                  <ResponsiveContainer width="100%" height={Math.max(160, topics.length * 36)}>
                    <BarChart data={topics} layout="vertical" margin={{ top: 0, right: 32, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={CHART_AXIS_STYLE} />
                      <YAxis type="category" dataKey="topic" width={110} tick={{ ...CHART_AXIS_STYLE, width: 105 }} />
                      <Tooltip
                        formatter={(v, _n, item) => [`${v}% correct (${(item?.payload as TopicAccuracy)?.responses} answers)`, 'Accuracy']}
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                      />
                      <Bar dataKey="accuracy_pct" name="Accuracy" fill={CHART_PRIMARY} radius={[0, 3, 3, 0]}
                        label={{ position: 'right', fontSize: 11, fill: '#374151', formatter: (v: unknown) => `${v}%` }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Hardest questions */}
              {hardest.length > 0 && (
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-gray-500">Hardest questions</p>
                  <p className="mb-4 text-xs text-gray-500">Lowest correct rate across all sessions</p>
                  <div className="space-y-3">
                    {hardest.map((q, i) => (
                      <div key={i}>
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="min-w-0 truncate text-xs text-gray-800" title={q.text}>
                            {q.text}
                          </p>
                          <span className="shrink-0 text-xs font-semibold text-gray-700">{q.pct_correct}%</span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                            <div
                              className={`h-full rounded-full ${q.pct_correct < 40 ? 'bg-rose-500' : q.pct_correct < 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                              style={{ width: `${Math.max(q.pct_correct, 3)}%` }}
                            />
                          </div>
                          <span className="shrink-0 text-[10px] text-gray-500">
                            {q.responses} answer{q.responses !== 1 ? 's' : ''}{q.quiz_title ? ` · ${q.quiz_title}` : ''}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Student accuracy distribution */}
              {distribution.some((d) => d.count > 0) && (
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-gray-500">Student accuracy distribution</p>
                  <p className="mb-4 text-xs text-gray-500">Each student's accuracy per session, grouped into bands</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={distribution} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis dataKey="bucket" tick={CHART_AXIS_STYLE} />
                      <YAxis allowDecimals={false} tick={CHART_AXIS_STYLE} />
                      <Tooltip
                        formatter={(v) => [v ?? 0, 'Students']}
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                      />
                      <Bar dataKey="count" name="Students" fill={CHART_PRIMARY} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Classroom comparison */}
              {classrooms.length > 0 && (
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-gray-500">Classroom comparison</p>
                  <p className="mb-4 text-xs text-gray-500">Average accuracy and participation per classroom</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={classrooms} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} barCategoryGap="25%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis dataKey="name" tick={CHART_AXIS_STYLE} />
                      <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={CHART_AXIS_STYLE} />
                      <Tooltip
                        formatter={(v, name) => [`${v ?? 0}%`, String(name)]}
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="accuracy_pct" name="Accuracy" fill={categoricalColor(0)} radius={[3, 3, 0, 0]} />
                      <Bar dataKey="participation_pct" name="Participation" fill={categoricalColor(4)} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sessions table */}
        {sessions.length === 0 ? (
          <div className="rounded-xl border border-gray-100 bg-white p-12 text-center shadow-sm">
            <BarChart2 className="mx-auto h-10 w-10 text-gray-300 mb-3" />
            <p className="text-gray-500 text-sm">No ended sessions yet.</p>
            <p className="text-gray-500 text-xs mt-1">
              Analytics are computed automatically when you end a session.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Session
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                    Date
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
                    <span className="flex items-center justify-end gap-1">
                      <Clock className="h-3 w-3" /> Dur.
                    </span>
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <span className="flex items-center justify-end gap-1">
                      <Users className="h-3 w-3" /> Participants
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[140px] hidden lg:table-cell">
                    <span className="flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" /> Avg score
                    </span>
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                    <span className="flex items-center justify-end gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Participation
                    </span>
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider hidden xl:table-cell">
                    Completion
                  </th>
                  <th className="px-2 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {sessions.map((s, idx) => (
                  <motion.tr
                    key={s.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className="group hover:bg-violet-50/40 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 leading-snug">{s.title}</p>
                      <p className="text-gray-500 text-xs font-mono mt-0.5">{s.join_code}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                      {formatDate(s.ended_at)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500 hidden md:table-cell">
                      {s.duration_mins !== null ? `${s.duration_mins}m` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 font-medium">
                      {s.participant_count}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {s.total_questions > 0 && s.avg_score !== null ? (
                        <ScoreBar value={s.avg_score} max={s.total_questions} />
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right hidden lg:table-cell">
                      <span
                        className={
                          s.participation_rate === null
                            ? 'text-gray-500'
                            : s.participation_rate >= 0.7
                            ? 'text-emerald-700'
                            : s.participation_rate >= 0.4
                            ? 'text-amber-700'
                            : 'text-rose-600'
                        }
                      >
                        {pct(s.participation_rate)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right hidden xl:table-cell">
                      <span className="text-gray-500">{pct(s.completion_rate)}</span>
                    </td>
                    <td className="px-2 py-3">
                      <Link
                        href={`/teacher/sessions/${s.id}/results`}
                        className="flex items-center justify-end gap-1 text-xs text-violet-600 hover:text-violet-700 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        Results <ArrowRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Score trend note */}
        {sessions.length >= 3 && (
          <p className="text-xs text-gray-500 text-center">
            Showing {sessions.length} sessions — most recent first
          </p>
        )}
      </div>
    </DashboardLayout>
  )
}
