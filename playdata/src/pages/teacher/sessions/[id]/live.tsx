import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Radio, CheckCircle2, XCircle, UserCheck, BarChart2,
  StopCircle, Copy, AlertTriangle, BookOpen,
  ChevronLeft, ChevronRight, Clock, Trophy,
} from 'lucide-react'
import { GetServerSidePropsResult } from 'next'
import { toast } from 'sonner'
import { io as ioClient, Socket } from 'socket.io-client'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { TEACHER_NAV } from '@/lib/teacher-nav'
import { withAuth } from '@/lib/auth'
import { createClientFromContext } from '@/lib/supabase/server-props'
import { createAdminClient } from '@/lib/supabase/admin'

const QRCodeSVG = dynamic(() => import('qrcode.react').then((m) => m.QRCodeSVG), { ssr: false })

interface QuizQuestion {
  id: string
  text: string
  type: string
  options: string[] | null
  correct_answer: string
  time_limit_secs: number
  order_index: number
}

interface SessionItem {
  id: string
  type: 'visualisation' | 'quiz' | 'question'
  reference_id: string
  order_index: number
  title: string
  subtitle: string
  options?: string[] | null
  correct_answer?: string
  quizQuestions?: QuizQuestion[]
}

interface Participant {
  id: string
  student_id: string
  score: number
  joined_at: string
  left_at: string | null
  profiles: { full_name: string; email: string } | { full_name: string; email: string }[] | null
}

function profileName(p: Participant): string {
  if (!p.profiles) return 'Student'
  if (Array.isArray(p.profiles)) return p.profiles[0]?.full_name ?? 'Student'
  return p.profiles.full_name ?? 'Student'
}

interface Response {
  id: string
  question_id: string
  student_id: string
  answer: string
  is_correct: boolean | null
  submitted_at: string
}

interface Session {
  id: string
  title: string
  join_code: string
  status: string
  current_item: number | null
  started_at: string | null
  ended_at: string | null
}

interface Profile {
  id: string
  full_name: string
  email: string
  role: string
}

interface Props {
  profile: Profile
  session: Session
  items: SessionItem[]
  participants: Participant[]
  responses: Response[]
}

export const getServerSideProps = withAuth(
  async (context, userId): Promise<GetServerSidePropsResult<Props>> => {
    const supabase = createClientFromContext(context)
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .eq('id', userId)
      .single()

    if (!profile) return { redirect: { destination: '/auth/login', permanent: false } }

    const sessionId = context.params?.id as string
    const admin = createAdminClient()

    const { data: session } = await admin
      .from('sessions')
      .select('id, title, join_code, status, current_item, started_at, ended_at, teacher_id')
      .eq('id', sessionId)
      .single()

    if (!session || session.teacher_id !== userId) {
      return { redirect: { destination: '/teacher/sessions', permanent: false } }
    }

    if (session.status === 'ended') {
      return { redirect: { destination: `/teacher/sessions/${sessionId}/results`, permanent: false } }
    }

    const [itemsRes, participantsRes, responsesRes] = await Promise.all([
      admin.from('session_items').select('id, type, reference_id, order_index').eq('session_id', sessionId).order('order_index'),
      admin.from('session_participants').select('id, student_id, score, joined_at, left_at, profiles(full_name, email)').eq('session_id', sessionId).order('joined_at'),
      admin.from('student_responses').select('id, question_id, student_id, answer, is_correct, submitted_at').eq('session_id', sessionId),
    ])

    const rawItems = itemsRes.data ?? []

    const quizIds = rawItems.filter((i: Record<string, unknown>) => i.type === 'quiz').map((i: Record<string, unknown>) => i.reference_id as string)
    const visIds = rawItems.filter((i: Record<string, unknown>) => i.type === 'visualisation').map((i: Record<string, unknown>) => i.reference_id as string)
    const questionIds = rawItems.filter((i: Record<string, unknown>) => i.type === 'question').map((i: Record<string, unknown>) => i.reference_id as string)

    type QuizRow = { id: string; title: string; questions: QuizQuestion[] }
    type VisRow = { id: string; name: string; chart_type: string }
    type QRow = { id: string; text: string; type: string; options: unknown; correct_answer: string }

    const [qRes, vRes, qsRes] = await Promise.all([
      quizIds.length > 0
        ? admin.from('quizzes').select('id, title, questions(id, text, type, options, correct_answer, time_limit_secs, order_index)').in('id', quizIds)
        : { data: [] },
      visIds.length > 0 ? admin.from('visualisations').select('id, name, chart_type').in('id', visIds) : { data: [] },
      questionIds.length > 0 ? admin.from('questions').select('id, text, type, options, correct_answer').in('id', questionIds) : { data: [] },
    ])

    const qMap = new Map((qRes.data ?? []).map((q: QuizRow) => [q.id, q]))
    const vMap = new Map((vRes.data ?? []).map((v: VisRow) => [v.id, v]))
    const qsMap = new Map((qsRes.data ?? []).map((q: QRow) => [q.id, q]))

    const items: SessionItem[] = rawItems.map((item: Record<string, unknown>) => {
      const ref = item.reference_id as string
      if (item.type === 'quiz') {
        const q = qMap.get(ref) as QuizRow | undefined
        const quizQuestions = (Array.isArray(q?.questions) ? [...q!.questions] : [])
          .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)) as QuizQuestion[]
        return {
          id: item.id as string,
          type: 'quiz' as const,
          reference_id: ref,
          order_index: item.order_index as number,
          title: q?.title ?? 'Quiz',
          subtitle: `${quizQuestions.length} questions`,
          quizQuestions,
        }
      }
      if (item.type === 'visualisation') {
        const v = vMap.get(ref) as VisRow | undefined
        return { id: item.id as string, type: 'visualisation' as const, reference_id: ref, order_index: item.order_index as number, title: v?.name ?? 'Chart', subtitle: v?.chart_type ?? '' }
      }
      const q = qsMap.get(ref) as QRow | undefined
      return { id: item.id as string, type: 'question' as const, reference_id: ref, order_index: item.order_index as number, title: q?.text ?? 'Question', subtitle: q?.type ?? '', options: q?.options as string[] | null, correct_answer: q?.correct_answer }
    })

    return {
      props: {
        profile,
        session: { id: session.id, title: session.title, join_code: session.join_code, status: session.status, current_item: session.current_item, started_at: session.started_at, ended_at: session.ended_at },
        items,
        participants: participantsRes.data ?? [],
        responses: responsesRes.data ?? [],
      },
    }
  },
  { allowedRoles: ['teacher'] }
)

// ── Timer display ──────────────────────────────────────────────────────────────
function TimerBar({ timeLeft, total }: { timeLeft: number; total: number }) {
  const pct = total > 0 ? Math.max(0, timeLeft / total) : 0
  const isLow = pct < 0.25
  const isMid = pct < 0.5

  return (
    <div className="flex items-center gap-3">
      <Clock className={`size-4 shrink-0 ${isLow ? 'text-red-400 animate-pulse' : isMid ? 'text-amber-400' : 'text-emerald-400'}`} />
      <div className="flex-1">
        <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden ring-1 ring-gray-200">
          <motion.div
            className={`h-full rounded-full transition-colors duration-300 ${
              isLow
                ? 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.8)]'
                : isMid
                  ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]'
                  : 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]'
            }`}
            style={{ width: `${pct * 100}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </div>
      <span
        className={`text-sm font-mono font-bold tabular-nums w-8 text-right ${isLow ? 'text-red-400' : isMid ? 'text-amber-400' : 'text-emerald-400'}`}
        style={isLow ? { filter: 'drop-shadow(0 0 6px rgba(239,68,68,0.8))' } : undefined}
      >
        {timeLeft}s
      </span>
    </div>
  )
}

const NAV_ITEMS = TEACHER_NAV

export default function LiveSession({ profile, session: initialSession, items, participants: initialParticipants, responses: initialResponses }: Props) {
  const router = useRouter()
  const socketRef = useRef<Socket | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [session, setSession] = useState(initialSession)
  const [currentItem, setCurrentItem] = useState<number>(initialSession.current_item ?? 0)
  const [participants, setParticipants] = useState<Participant[]>(initialParticipants)
  const [responses, setResponses] = useState<Response[]>(initialResponses)
  const [ending, setEnding] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const [copied, setCopied] = useState(false)

  // Within-quiz question navigation
  const [quizQuestionIndex, setQuizQuestionIndex] = useState(0)

  // Timer
  const [timeLeft, setTimeLeft] = useState<number | null>(null)

  const sortedItems = [...items].sort((a, b) => a.order_index - b.order_index)
  const activeItem = sortedItems[currentItem] ?? null
  const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/student/join?code=${session.join_code}` : `https://playdata.app/student/join?code=${session.join_code}`

  const activeQuizQuestion = activeItem?.type === 'quiz' && activeItem.quizQuestions
    ? activeItem.quizQuestions[quizQuestionIndex] ?? null
    : null

  // Get responses for the active question
  const activeQuestionId = activeItem?.type === 'question'
    ? activeItem.reference_id
    : activeQuizQuestion?.id ?? null

  const activeResponses = activeQuestionId
    ? responses.filter((r) => r.question_id === activeQuestionId)
    : activeItem?.type === 'quiz'
      ? responses
      : []

  const correctCount = activeResponses.filter((r) => r.is_correct === true).length
  const incorrectCount = activeResponses.filter((r) => r.is_correct === false).length

  // Start countdown timer for a question
  const startTimer = useCallback((secs: number) => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (secs <= 0) { setTimeLeft(null); return }
    setTimeLeft(secs)
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timerRef.current!)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  // Reset quiz question index when session item changes
  useEffect(() => {
    setQuizQuestionIndex(0)
    if (activeItem?.type === 'quiz' && activeItem.quizQuestions?.[0]) {
      startTimer(activeItem.quizQuestions[0].time_limit_secs)
    } else if (activeItem?.type !== 'quiz') {
      if (timerRef.current) clearInterval(timerRef.current)
      setTimeLeft(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentItem])

  // Start timer when quiz question changes
  useEffect(() => {
    if (activeQuizQuestion) {
      startTimer(activeQuizQuestion.time_limit_secs)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizQuestionIndex, currentItem])

  const poll = useCallback(async () => {
    const res = await fetch(`/api/teacher/sessions/${session.id}`)
    if (!res.ok) return
    const data = await res.json()
    setParticipants(data.participants ?? [])
    setResponses(data.responses ?? [])
    if (data.session?.current_item !== undefined && data.session.current_item !== null) {
      setCurrentItem(data.session.current_item)
    }
  }, [session.id])

  useEffect(() => {
    fetch('/api/socket').then(() => {
      const socket = ioClient({ path: '/api/socket', transports: ['websocket', 'polling'] })
      socketRef.current = socket
      socket.emit('join-session', session.id)
      socket.on('session:advance', ({ currentItem: idx }: { currentItem: number }) => {
        setCurrentItem(idx)
      })
      socket.on('session:end', () => {
        router.push(`/teacher/sessions/${session.id}/results`)
      })
    })

    if (session.status === 'waiting') {
      fetch(`/api/teacher/sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      }).then((r) => r.json()).then((data) => {
        if (data.session) setSession((prev) => ({ ...prev, ...data.session }))
      })
    }

    const interval = setInterval(poll, 3000)

    return () => {
      clearInterval(interval)
      if (timerRef.current) clearInterval(timerRef.current)
      if (socketRef.current) {
        socketRef.current.emit('leave-session', session.id)
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id])

  const advance = async (newIndex: number) => {
    if (newIndex < 0 || newIndex >= sortedItems.length || advancing) return
    setAdvancing(true)
    const res = await fetch(`/api/teacher/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'advance', itemIndex: newIndex }),
    })
    setAdvancing(false)
    if (res.ok) setCurrentItem(newIndex)
    else { const d = await res.json(); toast.error(d.error ?? 'Failed to advance') }
  }

  const handleEnd = async () => {
    setEnding(true)
    const res = await fetch(`/api/teacher/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'end' }),
    })
    setEnding(false)
    setShowEndConfirm(false)
    if (res.ok) {
      toast.success('Session ended')
      router.push(`/teacher/sessions/${session.id}/results`)
    } else {
      const d = await res.json()
      toast.error(d.error ?? 'Failed to end session')
    }
  }

  const copyCode = () => {
    navigator.clipboard.writeText(session.join_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const navigateQuizQuestion = (idx: number) => {
    if (!activeItem?.quizQuestions) return
    const clamped = Math.max(0, Math.min(activeItem.quizQuestions.length - 1, idx))
    setQuizQuestionIndex(clamped)
  }

  const activeParticipants = participants.filter((p) => !p.left_at)

  return (
    <DashboardLayout navItems={NAV_ITEMS} profile={profile}>
      <div className="max-w-7xl space-y-5">

        {/* Top bar */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold tracking-wider text-emerald-700 ring-1 ring-emerald-200"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <Radio className="size-3" /> LIVE
            </span>
            <h1 className="text-base font-bold text-gray-900 truncate md:text-lg">{session.title}</h1>
          </div>
          <button
            onClick={() => setShowEndConfirm(true)}
            className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-100"
          >
            <StopCircle className="size-4" /> End Session
          </button>
        </motion.div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-12">

          {/* Centre: current item — shown first on mobile */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }} className="order-1 col-span-1 space-y-4 md:order-2 md:col-span-6">

            {/* Item display */}
            <div className="rounded-2xl border border-gray-200 bg-white min-h-64 overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
                <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                  Item {sortedItems.length > 0 ? currentItem + 1 : 0} of {sortedItems.length}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  activeItem?.type === 'quiz' ? 'bg-violet-100 text-violet-700' :
                  activeItem?.type === 'visualisation' ? 'bg-sky-100 text-sky-700' :
                  'bg-amber-100 text-amber-700'
                }`}>
                  {activeItem?.type ?? 'none'}
                </span>
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={`${currentItem}-${quizQuestionIndex}`}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="p-5 md:p-6"
                >
                  {!activeItem ? (
                    <div className="py-12 text-center">
                      <p className="text-gray-400">No items in this session</p>
                    </div>
                  ) : activeItem.type === 'quiz' ? (
                    <div className="space-y-4">
                      {/* Quiz header */}
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 ring-1 ring-violet-200">
                          <BookOpen className="size-5 text-violet-600" />
                        </span>
                        <div>
                          <p className="text-base font-bold text-gray-900">{activeItem.title}</p>
                          <p className="text-xs text-gray-400">{activeItem.quizQuestions?.length ?? 0} questions</p>
                        </div>
                      </div>

                      {activeItem.quizQuestions && activeItem.quizQuestions.length > 0 ? (
                        <>
                          {/* Question dots */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {activeItem.quizQuestions.map((_, i) => (
                              <button
                                key={i}
                                onClick={() => navigateQuizQuestion(i)}
                                className={`rounded-full transition-all duration-200 ${
                                  i === quizQuestionIndex
                                    ? 'h-2.5 w-6 bg-violet-500'
                                    : i < quizQuestionIndex
                                      ? 'h-2 w-2 bg-violet-300'
                                      : 'h-2 w-2 bg-gray-200'
                                }`}
                              />
                            ))}
                            <span className="ml-2 text-xs text-gray-400">
                              Q{quizQuestionIndex + 1} / {activeItem.quizQuestions.length}
                            </span>
                          </div>

                          {/* Timer */}
                          {activeQuizQuestion && activeQuizQuestion.time_limit_secs > 0 && timeLeft !== null && (
                            <TimerBar timeLeft={timeLeft} total={activeQuizQuestion.time_limit_secs} />
                          )}
                          {activeQuizQuestion && activeQuizQuestion.time_limit_secs <= 0 && (
                            <div className="flex items-center gap-2 text-xs text-gray-400">
                              <Clock className="size-3" /> Untimed question
                            </div>
                          )}

                          {/* Current question */}
                          {activeQuizQuestion && (
                            <div className="space-y-3">
                              <p className="text-sm font-semibold text-gray-900 leading-relaxed">
                                {activeQuizQuestion.text}
                              </p>
                              {activeQuizQuestion.type === 'mcq' && Array.isArray(activeQuizQuestion.options) && (
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                  {(activeQuizQuestion.options as string[]).map((opt) => (
                                    <div
                                      key={opt}
                                      className={`rounded-xl border px-3 py-2.5 text-sm transition ${
                                        opt === activeQuizQuestion.correct_answer
                                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                          : 'border-gray-200 bg-gray-50 text-gray-700'
                                      }`}
                                    >
                                      {opt}
                                    </div>
                                  ))}
                                </div>
                              )}
                              {activeQuizQuestion.type !== 'mcq' && (
                                <p className="text-xs text-gray-400">
                                  Answer: <span className="text-emerald-600 font-medium">{activeQuizQuestion.correct_answer}</span>
                                </p>
                              )}
                            </div>
                          )}

                          {/* Within-quiz navigation */}
                          <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                            <button
                              onClick={() => navigateQuizQuestion(quizQuestionIndex - 1)}
                              disabled={quizQuestionIndex === 0}
                              className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 transition hover:border-violet-300 hover:text-violet-600 disabled:opacity-30"
                            >
                              <ChevronLeft className="size-3" /> Prev Q
                            </button>
                            <span className="flex-1 text-center text-xs text-gray-400 hidden sm:block">preview only — students navigate independently</span>
                            <button
                              onClick={() => navigateQuizQuestion(quizQuestionIndex + 1)}
                              disabled={quizQuestionIndex >= (activeItem.quizQuestions.length - 1)}
                              className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 transition hover:border-violet-300 hover:text-violet-600 disabled:opacity-30"
                            >
                              Next Q <ChevronRight className="size-3" />
                            </button>
                          </div>
                        </>
                      ) : (
                        <p className="text-sm text-gray-500">No questions in this quiz.</p>
                      )}
                    </div>
                  ) : activeItem.type === 'visualisation' ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 ring-1 ring-sky-200">
                          <BarChart2 className="size-5 text-sky-600" />
                        </span>
                        <div>
                          <p className="text-lg font-bold text-gray-900">{activeItem.title}</p>
                          <p className="text-sm text-gray-400 capitalize">{activeItem.subtitle} chart</p>
                        </div>
                      </div>
                      <p className="text-sm text-gray-500 mt-4">This visualisation is now displayed on student screens.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Standalone question */}
                      <p className="text-base font-semibold text-gray-900 leading-relaxed">{activeItem.title}</p>
                      {Array.isArray(activeItem.options) && activeItem.options.length > 0 && (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {(activeItem.options as string[]).map((opt) => (
                            <div
                              key={opt}
                              className={`rounded-xl border px-4 py-2.5 text-sm transition ${
                                opt === activeItem.correct_answer
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : 'border-gray-200 bg-gray-50 text-gray-700'
                              }`}
                            >
                              {opt}
                            </div>
                          ))}
                        </div>
                      )}
                      {activeItem.correct_answer && !Array.isArray(activeItem.options) && (
                        <p className="text-xs text-gray-400">
                          Answer: <span className="text-emerald-600 font-medium">{activeItem.correct_answer}</span>
                        </p>
                      )}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Session navigation */}
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => advance(currentItem - 1)}
                disabled={currentItem === 0 || advancing || sortedItems.length === 0}
                className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:border-violet-300 hover:text-violet-600 disabled:opacity-30 md:px-5"
              >
                <ChevronLeft className="size-4" /> Previous
              </button>

              {sortedItems.length > 0 && (
                <div className="flex items-center gap-1.5">
                  {sortedItems.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => advance(i)}
                      disabled={advancing}
                      className={`rounded-full transition-all duration-200 ${
                        i === currentItem
                          ? 'h-2.5 w-6 bg-violet-500'
                          : i < currentItem
                            ? 'h-2 w-2 bg-violet-300'
                            : 'h-2 w-2 bg-gray-200'
                      }`}
                    />
                  ))}
                </div>
              )}

              <button
                onClick={() => advance(currentItem + 1)}
                disabled={currentItem >= sortedItems.length - 1 || advancing || sortedItems.length === 0}
                className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:border-violet-300 hover:text-violet-600 disabled:opacity-30 md:px-5"
              >
                Next <ChevronRight className="size-4" />
              </button>
            </div>
          </motion.div>

          {/* Left: Join info + participants */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }} className="order-2 col-span-1 space-y-4 md:order-1 md:col-span-3">

            {/* Join code + QR */}
            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5 text-center shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-violet-500 mb-1">Join Code</p>
              <button onClick={copyCode} className="flex items-center justify-center gap-2 mx-auto" title="Click to copy">
                <span className="font-mono text-3xl font-black tracking-[0.2em] text-violet-700 md:text-4xl md:tracking-[0.25em]">
                  {session.join_code}
                </span>
                <Copy className="size-4 text-violet-400" />
              </button>
              {copied && <p className="text-xs text-emerald-600 mt-1">Copied!</p>}
              <div className="mt-4 flex justify-center">
                <div className="rounded-xl bg-white p-3 shadow-sm">
                  <QRCodeSVG value={joinUrl} size={120} bgColor="#ffffff" fgColor="#1e1b4b" level="M" />
                </div>
              </div>
              <p className="mt-2 text-xs text-violet-500">Scan to join</p>
            </div>

            {/* Participants */}
            <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Students</span>
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700">
                  {activeParticipants.length}
                </span>
              </div>
              <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
                {activeParticipants.length === 0 ? (
                  <p className="py-6 text-center text-xs text-gray-400">Waiting for students…</p>
                ) : (
                  [...activeParticipants].sort((a, b) => b.score - a.score).map((p, rank) => (
                    <div key={p.id} className="flex items-center gap-2.5 px-4 py-2.5">
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        rank === 0 ? 'bg-amber-100 text-amber-600' :
                        rank === 1 ? 'bg-gray-100 text-gray-500' :
                        rank === 2 ? 'bg-orange-100 text-orange-600' :
                        'bg-gray-50 text-gray-400'
                      }`}>
                        {rank < 3 ? <Trophy className="size-3" /> : rank + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-gray-900">{profileName(p)}</p>
                        <p className="truncate text-xs text-gray-400">Score: {p.score}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </motion.div>

          {/* Right: response feed */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="order-3 col-span-1 space-y-4 md:col-span-3">

            {/* Tally */}
            {activeItem?.type !== 'visualisation' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-600">{correctCount}</p>
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Correct</p>
                </div>
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-center">
                  <p className="text-2xl font-bold text-red-600">{incorrectCount}</p>
                  <p className="text-xs font-semibold uppercase tracking-wider text-red-700">Wrong</p>
                </div>
              </div>
            )}

            {/* Response list */}
            <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                  {activeQuizQuestion ? `Q${quizQuestionIndex + 1} Responses` : 'Responses'}
                </span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-500">
                  {activeResponses.length}
                </span>
              </div>
              <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
                {activeResponses.length === 0 ? (
                  <p className="py-6 text-center text-xs text-gray-400">
                    {activeItem?.type === 'visualisation' ? 'No responses for charts' : 'No responses yet'}
                  </p>
                ) : (
                  [...activeResponses].sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()).map((r) => (
                    <div key={r.id} className="flex items-start gap-2.5 px-4 py-2.5">
                      {r.is_correct === true ? (
                        <CheckCircle2 className="size-4 shrink-0 mt-0.5 text-emerald-500" />
                      ) : r.is_correct === false ? (
                        <XCircle className="size-4 shrink-0 mt-0.5 text-red-500" />
                      ) : (
                        <span className="h-4 w-4 shrink-0 mt-0.5 rounded-full border border-gray-200" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-gray-700">{r.answer}</p>
                        <p className="text-xs text-gray-400">{new Date(r.submitted_at).toLocaleTimeString()}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Answered / total */}
            {activeItem?.type !== 'visualisation' && activeParticipants.length > 0 && (
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-gray-400">Answered</span>
                  <span className="text-gray-600 font-medium">{activeResponses.length} / {activeParticipants.length}</span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-violet-500 transition-all duration-500"
                    style={{ width: `${activeParticipants.length > 0 ? (activeResponses.length / activeParticipants.length) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            {/* Quick leaderboard */}
            {activeParticipants.length > 0 && (
              <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Trophy className="size-3 text-amber-500" />
                  <span className="text-xs font-bold text-amber-700 uppercase tracking-widest">Leaderboard</span>
                </div>
                {[...activeParticipants].sort((a, b) => b.score - a.score).slice(0, 3).map((p, i) => (
                  <div key={p.id} className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm leading-none">{(['🥇', '🥈', '🥉'] as const)[i]}</span>
                      <span className="text-xs text-gray-700 truncate max-w-[100px]">{profileName(p)}</span>
                    </div>
                    <span
                      className={`text-xs font-mono font-bold ${i === 0 ? 'text-amber-600' : i === 1 ? 'text-gray-500' : 'text-orange-600'}`}
                    >
                      {p.score}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* End session confirmation */}
      <AnimatePresence>
        {showEndConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-xl"
            >
              <div className="flex items-start gap-3 mb-5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-100 ring-1 ring-red-200">
                  <AlertTriangle className="size-4 text-red-500" />
                </span>
                <div>
                  <h2 className="text-sm font-bold text-gray-900">End session?</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    This disconnects all {activeParticipants.length} connected student{activeParticipants.length !== 1 ? 's' : ''} and opens the results page.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowEndConfirm(false)}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-500 transition hover:text-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEnd}
                  disabled={ending}
                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
                >
                  {ending ? 'Ending…' : 'End Session'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </DashboardLayout>
  )
}
