import { useEffect, useState } from 'react'
import { GetServerSideProps } from 'next'
import { useRouter } from 'next/router'
import { motion } from 'framer-motion'
import {
  LayoutDashboard, Trophy, Users, UserCircle,
  CheckCircle2, XCircle, Calendar, Target, BookOpen,
  BarChart3, TrendingUp, ArrowRight,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar,
} from 'recharts'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { createClientFromContext } from '@/lib/supabase/server-props'
import { createAdminClient } from '@/lib/supabase/admin'
import type { NavItem } from '@/components/layout/Sidebar'

interface Profile {
  id: string
  full_name: string
  email: string
  role: string
}

interface SessionResult {
  session_id: string
  title: string
  status: string
  score: number
  correct: number
  incorrect: number
  answered: number
  date: string | null
}

interface Props {
  profile: Profile
  results: SessionResult[]
  summary: {
    totalSessions: number
    totalAnswered: number
    totalCorrect: number
    bestScore: number
  }
}

type SessionRef = {
  id: string
  title: string
  status: string
  ended_at: string | null
  started_at: string | null
} | null

type ParticipationRow = {
  score: number
  joined_at: string
  session_id: string
  sessions: SessionRef | SessionRef[]
}

type ResponseRow = {
  id: string
  is_correct: boolean | null
  session_id: string
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const supabase = createClientFromContext(context)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { redirect: { destination: '/auth/login', permanent: false } }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile) return { redirect: { destination: '/auth/login', permanent: false } }
  if (profile.role === 'teacher' || profile.role === 'admin') {
    return { redirect: { destination: '/teacher/dashboard', permanent: false } }
  }

  const admin = createAdminClient()

  const [participationsRes, responsesRes] = await Promise.all([
    admin
      .from('session_participants')
      .select('score, joined_at, session_id, sessions(id, title, status, ended_at, started_at)')
      .eq('student_id', user.id)
      .order('joined_at', { ascending: false }),
    admin
      .from('student_responses')
      .select('id, is_correct, session_id')
      .eq('student_id', user.id),
  ])

  const parts = (participationsRes.data ?? []) as ParticipationRow[]
  const resps = (responsesRes.data ?? []) as ResponseRow[]

  const results: SessionResult[] = parts.map((p) => {
    const sess = Array.isArray(p.sessions) ? p.sessions[0] : p.sessions
    const sessionResps = resps.filter((r) => r.session_id === p.session_id)
    const correct = sessionResps.filter((r) => r.is_correct === true).length
    const incorrect = sessionResps.filter((r) => r.is_correct === false).length
    return {
      session_id: p.session_id,
      title: (sess as { title?: string } | null)?.title ?? 'Session',
      status: (sess as { status?: string } | null)?.status ?? 'ended',
      score: p.score ?? 0,
      correct,
      incorrect,
      answered: sessionResps.length,
      date: (sess as { ended_at?: string | null } | null)?.ended_at
        ?? (sess as { started_at?: string | null } | null)?.started_at
        ?? p.joined_at,
    }
  })

  const totalAnswered = resps.length
  const totalCorrect = resps.filter((r) => r.is_correct === true).length
  const bestScore = parts.length > 0 ? Math.max(...parts.map((p) => p.score ?? 0)) : 0

  return {
    props: {
      profile,
      results,
      summary: {
        totalSessions: parts.length,
        totalAnswered,
        totalCorrect,
        bestScore,
      },
    },
  }
}

const NAV_ITEMS: NavItem[] = [
  { href: '/student/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/student/join', label: 'Join Session', icon: Users },
  { href: '/student/results', label: 'My Results', icon: Trophy },
  { href: '/profile', label: 'Profile', icon: UserCircle },
]

const TOOLTIP_STYLE = {
  backgroundColor: '#ffffff',
  border: '1px solid #e4e0f8',
  borderRadius: '12px',
  color: '#374151',
  fontSize: 12,
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
}

export default function StudentResults({ profile, results, summary }: Props) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const accuracy = summary.totalAnswered > 0
    ? Math.round((summary.totalCorrect / summary.totalAnswered) * 100)
    : null

  // Chart: accuracy % per session (oldest first, capped at 12)
  const trendData = [...results]
    .filter((r) => r.answered > 0)
    .slice(0, 12)
    .reverse()
    .map((r) => ({
      name: r.title.length > 10 ? r.title.slice(0, 10) + '…' : r.title,
      accuracy: Math.round((r.correct / r.answered) * 100),
      score: r.score,
    }))

  return (
    <DashboardLayout navItems={NAV_ITEMS} profile={profile}>
      <div className="max-w-5xl space-y-8">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 p-8 shadow-sm"
        >
          <div className="absolute -right-8 -top-8 h-48 w-48 rounded-full bg-amber-200/50 blur-3xl pointer-events-none" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="size-3.5 text-amber-600" />
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-amber-600">My Results</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-1">Performance Overview</h1>
            <p className="text-gray-500 text-sm">
              {summary.totalSessions === 0
                ? 'No sessions yet — join one to see your results here.'
                : `${summary.totalSessions} session${summary.totalSessions !== 1 ? 's' : ''} · ${summary.totalCorrect} correct answers`}
            </p>
          </div>
        </motion.div>

        {/* Summary stats */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
        >
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-gray-400">Summary</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: 'Sessions', value: summary.totalSessions.toString(), icon: Users, iconBg: 'bg-violet-100 ring-violet-200', iconColor: 'text-violet-600' },
              { label: 'Answered', value: summary.totalAnswered.toString(), icon: BookOpen, iconBg: 'bg-emerald-100 ring-emerald-200', iconColor: 'text-emerald-600' },
              { label: 'Best score', value: summary.totalSessions > 0 ? summary.bestScore.toString() : '—', icon: Trophy, iconBg: 'bg-amber-100 ring-amber-200', iconColor: 'text-amber-600' },
              { label: 'Accuracy', value: accuracy !== null ? `${accuracy}%` : '—', icon: Target, iconBg: 'bg-sky-100 ring-sky-200', iconColor: 'text-sky-600' },
            ].map(({ label, value, icon: Icon, iconBg, iconColor }) => (
              <div key={label} className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ring-1 ${iconBg} mb-3`}>
                  <Icon className={`size-4 ${iconColor}`} />
                </div>
                <p className="text-2xl font-bold text-gray-900">{value}</p>
                <p className="mt-1 text-xs text-gray-400">{label}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Trend chart */}
        {trendData.length > 1 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
          >
            <div className="mb-4 flex items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">Accuracy trend</h2>
              <TrendingUp className="size-3.5 text-gray-400" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
                <p className="text-xs text-gray-400 mb-4">Accuracy % per session</p>
                {mounted ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f0ff" />
                      <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false} unit="%" />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}%`, 'Accuracy']} />
                      <Line type="monotone" dataKey="accuracy" stroke="#7c3aed" strokeWidth={2.5} dot={trendData.length < 10} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <div className="h-[180px]" />}
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
                <p className="text-xs text-gray-400 mb-4">Score per session</p>
                {mounted ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={trendData} barCategoryGap="30%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f0ff" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Bar dataKey="score" name="Score" fill="#a78bfa" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div className="h-[180px]" />}
              </div>
            </div>
          </motion.div>
        )}

        {/* Session list */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16 }}
        >
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-gray-400">
            All sessions {results.length > 0 && <span className="text-gray-300 normal-case tracking-normal">({results.length})</span>}
          </h2>

          {results.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center py-16 gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 ring-1 ring-gray-200">
                <BarChart3 className="size-6 text-gray-400" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-500">No sessions yet</p>
                <p className="text-xs text-gray-400 mt-1">Join a live session to see results here.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {results.map((r, i) => {
                const acc = r.answered > 0 ? Math.round((r.correct / r.answered) * 100) : null
                const dateStr = r.date
                  ? new Date(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                  : '—'
                return (
                  <motion.div
                    key={r.session_id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.02 * i }}
                    className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-800 truncate">{r.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Calendar className="size-3 text-gray-400" />
                          <span className="text-xs text-gray-400">{dateStr}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {acc !== null && (
                          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                            acc >= 70 ? 'bg-emerald-100 text-emerald-700' :
                            acc >= 40 ? 'bg-amber-100 text-amber-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {acc}%
                          </span>
                        )}
                        <div className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1">
                          <Trophy className="size-3 text-amber-600" />
                          <span className="text-xs font-bold text-amber-700">{r.score}</span>
                        </div>
                      </div>
                    </div>

                    {r.answered > 0 && (
                      <div className="mt-4 space-y-2">
                        {/* Accuracy bar */}
                        {acc !== null && (
                          <div className="flex items-center gap-3">
                            <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${acc >= 70 ? 'bg-emerald-500' : acc >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                                style={{ width: `${acc}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-400 w-10 text-right">{acc}%</span>
                          </div>
                        )}
                        <div className="flex items-center gap-4 text-xs">
                          <span className="flex items-center gap-1 text-emerald-600">
                            <CheckCircle2 className="size-3" />
                            {r.correct} correct
                          </span>
                          <span className="flex items-center gap-1 text-red-500">
                            <XCircle className="size-3" />
                            {r.incorrect} wrong
                          </span>
                          <span className="text-gray-400">{r.answered} answered</span>
                        </div>
                      </div>
                    )}

                    {r.answered === 0 && (
                      <p className="mt-2 text-xs text-gray-400">No answers submitted in this session.</p>
                    )}

                    {/* Review link */}
                    <div className="mt-4 pt-3 border-t border-gray-100">
                      <button
                        onClick={() => router.push(`/student/results/${r.session_id}`)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-violet-600 hover:text-violet-500 transition-colors"
                      >
                        Review questions <ArrowRight className="size-3" />
                      </button>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )}
        </motion.div>

      </div>
    </DashboardLayout>
  )
}
