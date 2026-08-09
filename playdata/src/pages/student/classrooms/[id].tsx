import { useCallback, useEffect, useRef, useState } from 'react'
import { GetServerSideProps } from 'next'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, GraduationCap, Zap, ArrowRight, UserCircle,
  Trophy, CheckCircle2, XCircle, Target, BookOpen,
  Calendar, BarChart3,
} from 'lucide-react'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { STUDENT_NAV } from '@/lib/student-nav'
import { createClientFromContext } from '@/lib/supabase/server-props'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ClassroomDetail, ActiveSession } from '@/pages/api/student/classrooms/[id]'
import type { InvitePayload } from '@/components/StudentInviteListener'

interface Profile {
  id: string
  full_name: string
  email: string
  role: string
}

interface SessionStat {
  session_id: string
  title: string
  status: string
  date: string | null
  score: number
  answered: number
  correct: number
  incorrect: number
}

interface ClassroomAnalytics {
  sessionsJoined: number
  totalAnswered: number
  totalCorrect: number
  bestScore: number
  sessions: SessionStat[]
}

interface Props {
  profile: Profile
  classroom: ClassroomDetail
  activeSession: ActiveSession | null
  analytics?: ClassroomAnalytics
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const supabase = createClientFromContext(context)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { redirect: { destination: '/auth/login', permanent: false } }

  const admin = createAdminClient()
  const classroomId = context.params!.id as string

  const [profileRes, membershipRes] = await Promise.all([
    admin.from('profiles').select('id, full_name, email, role').eq('id', user.id).maybeSingle(),
    admin
      .from('classroom_students')
      .select('id, status')
      .eq('classroom_id', classroomId)
      .eq('student_id', user.id)
      .maybeSingle(),
  ])

  if (!profileRes.data) return { redirect: { destination: '/onboarding/student', permanent: false } }
  if (profileRes.data.role !== 'student') return { redirect: { destination: '/teacher/dashboard', permanent: false } }
  if (!membershipRes.data || membershipRes.data.status !== 'active') {
    return { notFound: true }
  }

  const [classroomRes, activeSessionRes, allSessionsRes] = await Promise.all([
    admin
      .from('classrooms')
      .select('id, name, description, teacher_id, created_at')
      .eq('id', classroomId)
      .single(),
    admin
      .from('sessions')
      .select('id, title, join_code, status')
      .eq('classroom_id', classroomId)
      .eq('status', 'active')
      .maybeSingle(),
    admin
      .from('sessions')
      .select('id, title, status, started_at, ended_at')
      .eq('classroom_id', classroomId)
      .order('started_at', { ascending: false }),
  ])

  if (!classroomRes.data) return { notFound: true }

  const { data: teacher } = await admin
    .from('profiles')
    .select('full_name')
    .eq('id', classroomRes.data.teacher_id)
    .single()

  const allSessions = allSessionsRes.data ?? []
  const sessionIds = allSessions.map((s) => s.id)

  const [participationsRes, responsesRes] = await Promise.all([
    sessionIds.length > 0
      ? admin
          .from('session_participants')
          .select('session_id, score')
          .in('session_id', sessionIds)
          .eq('student_id', user.id)
      : { data: [] as { session_id: string; score: number }[] },
    sessionIds.length > 0
      ? admin
          .from('student_responses')
          .select('session_id, is_correct')
          .in('session_id', sessionIds)
          .eq('student_id', user.id)
      : { data: [] as { session_id: string; is_correct: boolean | null }[] },
  ])

  const participations = participationsRes.data ?? []
  const responses = responsesRes.data ?? []

  const participatedIds = new Set(participations.map((p) => p.session_id))

  const sessions: SessionStat[] = allSessions
    .filter((s) => participatedIds.has(s.id))
    .map((s) => {
      const part = participations.find((p) => p.session_id === s.id)
      const resps = responses.filter((r) => r.session_id === s.id)
      const correct = resps.filter((r) => r.is_correct === true).length
      const incorrect = resps.filter((r) => r.is_correct === false).length
      return {
        session_id: s.id,
        title: s.title,
        status: s.status,
        date: s.ended_at ?? s.started_at,
        score: part?.score ?? 0,
        answered: resps.length,
        correct,
        incorrect,
      }
    })

  const analytics: ClassroomAnalytics = {
    sessionsJoined: sessions.length,
    totalAnswered: responses.length,
    totalCorrect: responses.filter((r) => r.is_correct === true).length,
    bestScore: sessions.length > 0 ? Math.max(...sessions.map((s) => s.score)) : 0,
    sessions,
  }

  return {
    props: {
      profile: profileRes.data,
      classroom: { ...classroomRes.data, teacher_name: teacher?.full_name ?? 'Teacher' } as ClassroomDetail,
      activeSession: (activeSessionRes.data ?? null) as ActiveSession | null,
      analytics,
    },
  }
}

const EMPTY_ANALYTICS: ClassroomAnalytics = { sessionsJoined: 0, totalAnswered: 0, totalCorrect: 0, bestScore: 0, sessions: [] }

export default function StudentClassroomDetail({
  profile, classroom, activeSession: initialActiveSession, analytics = EMPTY_ANALYTICS,
}: Props) {
  const router = useRouter()
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(initialActiveSession)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const channelRef = useRef<BroadcastChannel | null>(null)

  const fetchActiveSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/student/classrooms/${classroom.id}`)
      if (!res.ok) return
      const data = await res.json() as { activeSession: ActiveSession | null }
      setActiveSession(data.activeSession)
    } catch {
      // network error — keep current state
    }
  }, [classroom.id])

  useEffect(() => {
    const bc = new BroadcastChannel('playdata-sessions')
    channelRef.current = bc

    bc.onmessage = (evt: MessageEvent) => {
      if (evt.data?.type === 'session-started') {
        const payload = evt.data.payload as InvitePayload
        if (!activeSession) {
          fetchActiveSession()
        } else {
          setActiveSession({ id: payload.sessionId, title: payload.sessionTitle, join_code: payload.joinCode, status: 'active' })
        }
      }
    }

    pollRef.current = setInterval(fetchActiveSession, 10_000)

    return () => {
      bc.close()
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [classroom.id, activeSession, fetchActiveSession])

  const createdDate = new Date(classroom.created_at).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  const accuracy = analytics.totalAnswered > 0
    ? Math.round((analytics.totalCorrect / analytics.totalAnswered) * 100)
    : null

  return (
    <DashboardLayout navItems={STUDENT_NAV} profile={profile}>
      <div className="max-w-3xl space-y-6">

        {/* Back */}
        <Link
          href="/student/classrooms"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="size-4" />
          My Classrooms
        </Link>

        {/* Active session banner */}
        <AnimatePresence>
          {activeSession && (
            <motion.div
              key="banner"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col gap-3 rounded-2xl border border-violet-300 bg-gradient-to-br from-violet-50 via-purple-50 to-indigo-50 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-violet-600" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-violet-900">
                    {activeSession.title} — Session Live
                  </p>
                  <p className="text-xs text-violet-600 mt-0.5">
                    Your teacher has started a quiz for this class
                  </p>
                </div>
              </div>
              <button
                onClick={() => router.push(`/student/sessions/${activeSession.id}`)}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 transition-colors shrink-0"
              >
                Join Now <ArrowRight className="size-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Classroom header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden"
        >
          <div className="h-1.5 bg-gradient-to-r from-violet-600 to-indigo-500" />
          <div className="p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 ring-1 ring-violet-200">
                <GraduationCap className="size-6 text-violet-600" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-bold uppercase tracking-widest text-violet-600">Classroom</span>
                <h1 className="text-xl font-bold text-gray-900 truncate mt-0.5">{classroom.name}</h1>
                {classroom.description && (
                  <p className="text-sm text-gray-500 mt-1">{classroom.description}</p>
                )}
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-gray-400">Teacher</p>
                <p className="text-sm font-semibold text-gray-700 mt-0.5 truncate">{classroom.teacher_name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Created</p>
                <p className="text-sm font-semibold text-gray-700 mt-0.5">{createdDate}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Session</p>
                <div className="flex items-center justify-center gap-1.5 mt-0.5">
                  <span className={`inline-flex h-2 w-2 rounded-full ${activeSession ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                  <p className={`text-sm font-semibold ${activeSession ? 'text-emerald-700' : 'text-gray-400'}`}>
                    {activeSession ? 'Live' : 'None'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Analytics header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="size-4 text-gray-400" />
            <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">My Performance</h2>
          </div>

          {analytics.sessionsJoined === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center py-12 gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 ring-1 ring-gray-200">
                <BarChart3 className="size-5 text-gray-400" />
              </div>
              <p className="text-sm text-gray-500 text-center">
                No sessions joined yet.<br />Join a session from this classroom to see your stats.
              </p>
            </div>
          ) : (
            <>
              {/* Stat cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  {
                    label: 'Sessions',
                    value: analytics.sessionsJoined.toString(),
                    icon: BookOpen,
                    iconBg: 'bg-violet-100 ring-violet-200',
                    iconColor: 'text-violet-600',
                  },
                  {
                    label: 'Best Score',
                    value: analytics.bestScore.toString(),
                    icon: Trophy,
                    iconBg: 'bg-amber-100 ring-amber-200',
                    iconColor: 'text-amber-600',
                  },
                  {
                    label: 'Correct',
                    value: analytics.totalCorrect.toString(),
                    icon: CheckCircle2,
                    iconBg: 'bg-emerald-100 ring-emerald-200',
                    iconColor: 'text-emerald-600',
                  },
                  {
                    label: 'Accuracy',
                    value: accuracy !== null ? `${accuracy}%` : '—',
                    icon: Target,
                    iconBg: 'bg-sky-100 ring-sky-200',
                    iconColor: 'text-sky-600',
                  },
                ].map(({ label, value, icon: Icon, iconBg, iconColor }, i) => (
                  <motion.div
                    key={label}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.12 + i * 0.04 }}
                    className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4"
                  >
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ring-1 ${iconBg} mb-3`}>
                      <Icon className={`size-4 ${iconColor}`} />
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{value}</p>
                    <p className="mt-0.5 text-xs text-gray-400">{label}</p>
                  </motion.div>
                ))}
              </div>

              {/* Session history */}
              <div className="mt-5">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Session History</h3>
                <div className="space-y-3">
                  {analytics.sessions.map((s, i) => {
                    const acc = s.answered > 0 ? Math.round((s.correct / s.answered) * 100) : null
                    const dateStr = s.date
                      ? new Date(s.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                      : '—'
                    return (
                      <motion.div
                        key={s.session_id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 + i * 0.04 }}
                        className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">{s.title}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <Calendar className="size-3 text-gray-400" />
                              <span className="text-xs text-gray-400">{dateStr}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {acc !== null && (
                              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                                acc >= 70 ? 'bg-emerald-100 text-emerald-700' :
                                acc >= 40 ? 'bg-amber-100 text-amber-700' :
                                'bg-red-100 text-red-700'
                              }`}>
                                {acc}%
                              </span>
                            )}
                            <div className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1">
                              <Trophy className="size-3 text-amber-600" />
                              <span className="text-xs font-bold text-amber-700">{s.score}</span>
                            </div>
                          </div>
                        </div>

                        {s.answered > 0 && (
                          <div className="mt-3 space-y-1.5">
                            {acc !== null && (
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${acc >= 70 ? 'bg-emerald-500' : acc >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                                    style={{ width: `${acc}%` }}
                                  />
                                </div>
                                <span className="text-xs text-gray-400 w-8 text-right">{acc}%</span>
                              </div>
                            )}
                            <div className="flex items-center gap-4 text-xs">
                              <span className="flex items-center gap-1 text-emerald-600">
                                <CheckCircle2 className="size-3" />
                                {s.correct} correct
                              </span>
                              <span className="flex items-center gap-1 text-red-500">
                                <XCircle className="size-3" />
                                {s.incorrect} wrong
                              </span>
                              <span className="text-gray-400">{s.answered} answered</span>
                            </div>
                          </div>
                        )}

                        {s.answered === 0 && (
                          <p className="mt-2 text-xs text-gray-400">No answers submitted.</p>
                        )}

                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <button
                            onClick={() => router.push(`/student/results/${s.session_id}`)}
                            className="flex items-center gap-1.5 text-xs font-semibold text-violet-600 hover:text-violet-500 transition-colors"
                          >
                            Review answers <ArrowRight className="size-3" />
                          </button>
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </motion.div>

        {/* Spacer */}
        <div className="h-4" />

      </div>
    </DashboardLayout>
  )
}
