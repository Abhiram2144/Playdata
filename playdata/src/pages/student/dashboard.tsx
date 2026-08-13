import { useEffect, useState } from 'react'
import { GetServerSideProps } from 'next'
import { useRouter } from 'next/router'
import { motion } from 'framer-motion'
import {
  LayoutDashboard, Trophy, Users, UserCircle,
  BookOpen, BarChart3, Zap, CheckCircle2, XCircle,
  ArrowRight, TrendingUp, Target, Calendar,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { createClientFromContext } from '@/lib/supabase/server-props'
import { createAdminClient } from '@/lib/supabase/admin'
import { STUDENT_NAV } from '@/lib/student-nav'
import { CHART_PRIMARY, CHART_AXIS_STYLE } from '@/lib/chart-colors'

interface Profile {
  id: string
  full_name: string
  email: string
  role: string
  education_level: string | null
  onboarding_completed: boolean | null
  created_at: string
}

interface SessionHistoryItem {
  session_id: string
  title: string
  status: string
  score: number
  correct: number
  incorrect: number
  answered: number
  date: string | null
}

interface Analytics {
  sessionsJoined: number
  quizzesAnswered: number
  correctAnswers: number
  bestScore: number
  sessionHistory: SessionHistoryItem[]
}

interface Props {
  profile: Profile
  analytics: Analytics
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
    .select('id, full_name, email, role, education_level, onboarding_completed, created_at')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile) return { redirect: { destination: '/onboarding/student', permanent: false } }
  if (profile.role === 'teacher' || profile.role === 'admin') {
    return { redirect: { destination: '/teacher/dashboard', permanent: false } }
  }
  if (!profile.onboarding_completed) {
    return { redirect: { destination: '/onboarding/student', permanent: false } }
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

  const sessionsJoined = parts.length
  const quizzesAnswered = resps.length
  const correctAnswers = resps.filter((r) => r.is_correct === true).length
  const bestScore = parts.length > 0 ? Math.max(...parts.map((p) => p.score ?? 0)) : 0

  const sessionHistory: SessionHistoryItem[] = parts.slice(0, 30).map((p) => {
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
      date: (sess as { ended_at?: string | null; started_at?: string | null } | null)?.ended_at
        ?? (sess as { started_at?: string | null } | null)?.started_at
        ?? p.joined_at,
    }
  })

  return {
    props: {
      profile,
      analytics: { sessionsJoined, quizzesAnswered, correctAnswers, bestScore, sessionHistory },
    },
  }
}

const NAV_ITEMS = STUDENT_NAV

const TOOLTIP_STYLE = {
  backgroundColor: '#ffffff',
  border: '1px solid #e4e0f8',
  borderRadius: '12px',
  color: '#374151',
  fontSize: 12,
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
}

export default function StudentDashboard({ profile, analytics }: Props) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const firstName = profile.full_name?.split(' ')[0] || 'Student'
  const joinedDate = new Date(profile.created_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const accuracy = analytics.quizzesAnswered > 0
    ? Math.round((analytics.correctAnswers / analytics.quizzesAnswered) * 100)
    : null

  // Chart data: most recent 8 sessions, oldest first
  const chartData = [...analytics.sessionHistory]
    .filter((s) => s.answered > 0)
    .slice(0, 8)
    .reverse()
    .map((s) => ({
      name: s.title.length > 12 ? s.title.slice(0, 12) + '…' : s.title,
      score: s.score,
      correct: s.correct,
    }))

  const recentSessions = analytics.sessionHistory.slice(0, 5)

  return (
    <DashboardLayout navItems={NAV_ITEMS} profile={profile}>
      <div className="max-w-5xl space-y-8">

        {/* Welcome card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="relative overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-purple-50 to-indigo-50 p-5 sm:p-8 shadow-sm"
        >
          <div className="absolute -right-8 -top-8 h-56 w-56 rounded-full bg-violet-200/50 blur-3xl pointer-events-none" />
          <div className="absolute -left-16 -bottom-12 h-48 w-48 rounded-full bg-indigo-200/40 blur-3xl pointer-events-none" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="size-3.5 text-violet-600" />
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-violet-600">Dashboard</span>
            </div>
            <h1 className="text-2xl font-bold mb-1 sm:text-3xl">
              <span className="text-gray-900">Welcome back, </span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-indigo-500">{firstName}</span>
              <span className="ml-1">👋</span>
            </h1>
            <p className="text-gray-500">
              {analytics.sessionsJoined === 0
                ? 'Join your first session to get started.'
                : `${analytics.sessionsJoined} session${analytics.sessionsJoined !== 1 ? 's' : ''} joined · ${analytics.correctAnswers} correct answers`}
            </p>
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-gray-500">Activity</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              {
                label: 'Sessions joined',
                value: analytics.sessionsJoined > 0 ? analytics.sessionsJoined.toString() : '0',
                icon: Users,
                iconBg: 'bg-violet-100 ring-violet-200',
                iconColor: 'text-violet-600',
                empty: analytics.sessionsJoined === 0,
              },
              {
                label: 'Questions answered',
                value: analytics.quizzesAnswered > 0 ? analytics.quizzesAnswered.toString() : '0',
                icon: BookOpen,
                iconBg: 'bg-emerald-100 ring-emerald-200',
                iconColor: 'text-emerald-600',
                empty: analytics.quizzesAnswered === 0,
              },
              {
                label: 'Best score',
                value: analytics.sessionsJoined > 0 ? analytics.bestScore.toString() : '—',
                icon: Trophy,
                iconBg: 'bg-amber-100 ring-amber-200',
                iconColor: 'text-amber-600',
                empty: analytics.sessionsJoined === 0,
              },
              {
                label: 'Accuracy',
                value: accuracy !== null ? `${accuracy}%` : '—',
                icon: Target,
                iconBg: 'bg-sky-100 ring-sky-200',
                iconColor: 'text-sky-600',
                empty: accuracy === null,
              },
            ].map(({ label, value, icon: Icon, iconBg, iconColor, empty }) => (
              <div key={label} className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ring-1 ${iconBg}`}>
                    <Icon className={`size-4 ${iconColor}`} />
                  </div>
                </div>
                <p className={`text-2xl font-bold ${empty ? 'text-gray-300' : 'text-gray-900'}`}>{value}</p>
                <p className="mt-1 text-xs text-gray-500">{label}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Performance chart */}
        {chartData.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14 }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-500">Score history</h2>
              <button
                onClick={() => router.push('/student/results')}
                className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-500 transition-colors"
              >
                View all <ArrowRight className="size-3" />
              </button>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
              <p className="text-xs text-gray-500 mb-4">Correct answers per session (last {chartData.length})</p>
              {mounted ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f0ff" vertical={false} />
                    <XAxis dataKey="name" tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} />
                    <YAxis tick={CHART_AXIS_STYLE} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#f5f3ff' }} />
                    <Bar dataKey="correct" name="Correct" fill={CHART_PRIMARY} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[200px] flex items-center justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Join session quick action */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
        >
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-gray-500">Live Sessions</h2>
          <motion.button
            whileHover={{ y: -2 }}
            transition={{ duration: 0.15 }}
            onClick={() => router.push('/student/join')}
            className="w-full flex items-center justify-between rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-purple-50 to-indigo-50 p-5 text-left shadow-sm transition hover:border-violet-300 hover:shadow-md"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 ring-1 ring-violet-200">
                <BarChart3 className="size-5 text-violet-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Join a Session</p>
                <p className="text-sm text-gray-500">Enter a code to join your teacher&apos;s live session</p>
              </div>
            </div>
            <ArrowRight className="size-5 text-violet-500 shrink-0" />
          </motion.button>
        </motion.div>

        {/* Recent sessions */}
        {recentSessions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22 }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-500">Recent sessions</h2>
              <button
                onClick={() => router.push('/student/results')}
                className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-500 transition-colors"
              >
                View all <ArrowRight className="size-3" />
              </button>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm divide-y divide-gray-100">
              {recentSessions.map((s) => {
                const acc = s.answered > 0 ? Math.round((s.correct / s.answered) * 100) : null
                const dateStr = s.date
                  ? new Date(s.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                  : '—'
                return (
                  <div key={s.session_id} className="flex items-center justify-between px-5 py-4 gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800 truncate">{s.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Calendar className="size-3 text-gray-500" />
                        <span className="text-xs text-gray-500">{dateStr}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {s.answered > 0 && (
                        <div className="hidden items-center gap-2 text-xs sm:flex">
                          <span className="flex items-center gap-1 text-emerald-700">
                            <CheckCircle2 className="size-3" />{s.correct}
                          </span>
                          <span className="flex items-center gap-1 text-red-600">
                            <XCircle className="size-3" />{s.incorrect}
                          </span>
                        </div>
                      )}
                      {acc !== null && (
                        <span className={`hidden rounded-full px-2.5 py-1 text-xs font-bold sm:inline-block ${
                          acc >= 70 ? 'bg-emerald-100 text-emerald-700' :
                          acc >= 40 ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {acc}%
                        </span>
                      )}
                      <div className="flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1">
                        <Trophy className="size-3 text-violet-600" />
                        <span className="text-xs font-bold text-violet-700">{s.score}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}

        {/* Account info */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.26 }}
        >
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-gray-500">Account</h2>
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm divide-y divide-gray-100">
            {[
              { label: 'Full name', value: profile.full_name },
              { label: 'Email', value: profile.email },
              { label: 'Role', value: 'Student' },
              { label: 'Education level', value: profile.education_level ?? '—' },
              { label: 'Member since', value: joinedDate },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between px-6 py-3.5">
                <span className="text-sm text-gray-500">{label}</span>
                <span className="text-sm font-medium text-gray-700">{value}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Performance tip */}
        {analytics.sessionsJoined === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5"
          >
            <div className="flex items-start gap-3">
              <TrendingUp className="size-5 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-indigo-800">Ready to learn?</p>
                <p className="text-sm text-indigo-600 mt-0.5">
                  Ask your teacher for a session code, or scan the QR code displayed in class.
                </p>
              </div>
            </div>
          </motion.div>
        )}

      </div>
    </DashboardLayout>
  )
}
