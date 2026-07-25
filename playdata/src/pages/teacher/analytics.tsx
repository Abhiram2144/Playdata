import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ArrowRight, BarChart2, Users, CheckCircle2, Activity,
  Clock, TrendingUp, BookOpen,
} from 'lucide-react'
import { GetServerSidePropsResult } from 'next'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { TEACHER_NAV } from '@/lib/teacher-nav'
import { withAuth } from '@/lib/auth'
import { createClientFromContext } from '@/lib/supabase/server-props'
import { createAdminClient } from '@/lib/supabase/admin'

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

interface Props {
  profile: Profile
  sessions: SessionRow[]
  summary: SummaryStats
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
        id, title, join_code, started_at, ended_at,
        session_analytics(avg_score, participation_rate, completion_rate, total_questions, participant_count)
      `)
      .eq('teacher_id', userId)
      .eq('status', 'ended')
      .order('ended_at', { ascending: false })

    const sessions: SessionRow[] = (rawSessions ?? []).map((s: Record<string, unknown>) => {
      const analytics = Array.isArray(s.session_analytics)
        ? (s.session_analytics[0] as Record<string, unknown> | undefined)
        : (s.session_analytics as Record<string, unknown> | undefined)

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

    return {
      props: {
        profile: profile as Profile,
        sessions,
        summary,
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
      <span className="text-xs text-gray-500 w-9 text-right">{pct}%</span>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AnalyticsPage({ profile, sessions, summary }: Props) {
  return (
    <DashboardLayout
      navItems={TEACHER_NAV}
      profile={profile}
    >
      <div className="p-6 max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Analytics</p>
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

        {/* Sessions table */}
        {sessions.length === 0 ? (
          <div className="rounded-xl border border-gray-100 bg-white p-12 text-center shadow-sm">
            <BarChart2 className="mx-auto h-10 w-10 text-gray-300 mb-3" />
            <p className="text-gray-500 text-sm">No ended sessions yet.</p>
            <p className="text-gray-400 text-xs mt-1">
              Analytics are computed automatically when you end a session.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Session
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden sm:table-cell">
                    Date
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider hidden md:table-cell">
                    <span className="flex items-center justify-end gap-1">
                      <Clock className="h-3 w-3" /> Dur.
                    </span>
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                    <span className="flex items-center justify-end gap-1">
                      <Users className="h-3 w-3" /> Participants
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider min-w-[140px] hidden lg:table-cell">
                    <span className="flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" /> Avg score
                    </span>
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider hidden lg:table-cell">
                    <span className="flex items-center justify-end gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Participation
                    </span>
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider hidden xl:table-cell">
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
                      <p className="text-gray-400 text-xs font-mono mt-0.5">{s.join_code}</p>
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
                            ? 'text-gray-300'
                            : s.participation_rate >= 0.7
                            ? 'text-emerald-600'
                            : s.participation_rate >= 0.4
                            ? 'text-amber-600'
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
          <p className="text-xs text-gray-400 text-center">
            Showing {sessions.length} sessions — most recent first
          </p>
        )}
      </div>
    </DashboardLayout>
  )
}
