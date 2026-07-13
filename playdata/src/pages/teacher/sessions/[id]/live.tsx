import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Database, BarChart3, BookOpen, Users,
  TrendingUp, UserCircle, ChevronLeft, ChevronRight,
  Radio, CheckCircle2, XCircle, UserCheck, BarChart2,
  StopCircle, Copy, AlertTriangle,
} from 'lucide-react'
import { GetServerSidePropsResult } from 'next'
import { toast } from 'sonner'
import { io as ioClient, Socket } from 'socket.io-client'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { type NavItem } from '@/components/layout/Sidebar'
import { TEACHER_NAV } from '@/lib/teacher-nav'
import { withAuth } from '@/lib/auth'
import { createClientFromContext } from '@/lib/supabase/server-props'
import { createAdminClient } from '@/lib/supabase/admin'

const QRCodeSVG = dynamic(() => import('qrcode.react').then((m) => m.QRCodeSVG), { ssr: false })

interface SessionItem {
  id: string
  type: 'visualisation' | 'quiz' | 'question'
  reference_id: string
  order_index: number
  title: string
  subtitle: string
  options?: string[] | null
  correct_answer?: string
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
      return { redirect: { destination: '/teacher/sessions', permanent: false } }
    }

    const [itemsRes, participantsRes, responsesRes] = await Promise.all([
      admin.from('session_items').select('id, type, reference_id, order_index').eq('session_id', sessionId).order('order_index'),
      admin.from('session_participants').select('id, student_id, score, joined_at, left_at, profiles(full_name, email)').eq('session_id', sessionId).order('joined_at'),
      admin.from('student_responses').select('id, question_id, student_id, answer, is_correct, submitted_at').eq('session_id', sessionId),
    ])

    const rawItems = itemsRes.data ?? []

    // Resolve reference names
    const quizIds = rawItems.filter((i: Record<string, unknown>) => i.type === 'quiz').map((i: Record<string, unknown>) => i.reference_id as string)
    const visIds = rawItems.filter((i: Record<string, unknown>) => i.type === 'visualisation').map((i: Record<string, unknown>) => i.reference_id as string)
    const questionIds = rawItems.filter((i: Record<string, unknown>) => i.type === 'question').map((i: Record<string, unknown>) => i.reference_id as string)

    type QuizRow = { id: string; title: string; questions: unknown[] }
    type VisRow = { id: string; name: string; chart_type: string }
    type QRow = { id: string; text: string; type: string; options: unknown; correct_answer: string }

    const [qRes, vRes, qsRes] = await Promise.all([
      quizIds.length > 0 ? admin.from('quizzes').select('id, title, questions(id)').in('id', quizIds) : { data: [] },
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
        return { id: item.id as string, type: 'quiz' as const, reference_id: ref, order_index: item.order_index as number, title: q?.title ?? 'Quiz', subtitle: `${Array.isArray(q?.questions) ? q.questions.length : 0} questions` }
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

const NAV_ITEMS = TEACHER_NAV

export default function LiveSession({ profile, session: initialSession, items, participants: initialParticipants, responses: initialResponses }: Props) {
  const router = useRouter()
  const socketRef = useRef<Socket | null>(null)

  const [session, setSession] = useState(initialSession)
  const [currentItem, setCurrentItem] = useState<number>(initialSession.current_item ?? 0)
  const [participants, setParticipants] = useState<Participant[]>(initialParticipants)
  const [responses, setResponses] = useState<Response[]>(initialResponses)
  const [starting, setStarting] = useState(false)
  const [ending, setEnding] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const [copied, setCopied] = useState(false)

  const sortedItems = [...items].sort((a, b) => a.order_index - b.order_index)
  const activeItem = sortedItems[currentItem] ?? null
  const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/student/join?code=${session.join_code}` : `https://playdata.app/student/join?code=${session.join_code}`

  // Current item responses (for question items)
  const activeResponses = activeItem?.type === 'question'
    ? responses.filter((r) => r.question_id === activeItem.reference_id)
    : activeItem?.type === 'quiz'
      ? responses // show all responses for quiz context
      : []

  const correctCount = activeResponses.filter((r) => r.is_correct === true).length
  const incorrectCount = activeResponses.filter((r) => r.is_correct === false).length

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
    // Initialize Socket.IO
    fetch('/api/socket').then(() => {
      const socket = ioClient({ path: '/api/socket', transports: ['websocket', 'polling'] })
      socketRef.current = socket
      socket.emit('join-session', session.id)

      socket.on('session:advance', ({ currentItem: idx }: { currentItem: number }) => {
        setCurrentItem(idx)
      })
      socket.on('session:end', () => {
        router.push('/teacher/sessions')
      })
    })

    // Start session if still in waiting state
    if (session.status === 'waiting') {
      fetch(`/api/teacher/sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      }).then((r) => r.json()).then((data) => {
        if (data.session) setSession((prev) => ({ ...prev, ...data.session }))
      })
    }

    // Poll for live data every 3 seconds
    const interval = setInterval(poll, 3000)

    return () => {
      clearInterval(interval)
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
      router.push('/teacher/sessions')
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

  const activeParticipants = participants.filter((p) => !p.left_at)

  return (
    <DashboardLayout navItems={NAV_ITEMS} profile={profile}>
      <div className="max-w-7xl space-y-5">

        {/* Top bar */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-400">
              <Radio className="size-3" /> Live
            </span>
            <h1 className="text-lg font-bold text-white truncate">{session.title}</h1>
          </div>
          <button
            onClick={() => setShowEndConfirm(true)}
            className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-600/10 px-4 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-600/20"
          >
            <StopCircle className="size-4" /> End Session
          </button>
        </motion.div>

        <div className="grid grid-cols-12 gap-5">

          {/* Left: Join info + participants */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }} className="col-span-3 space-y-4">

            {/* Join code + QR */}
            <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-b from-violet-600/10 to-transparent p-5 text-center">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#6a6a80] mb-1">Join Code</p>
              <button
                onClick={copyCode}
                className="flex items-center justify-center gap-2 mx-auto"
                title="Click to copy"
              >
                <span className="font-mono text-3xl font-bold tracking-[0.2em] text-violet-300">
                  {session.join_code}
                </span>
                <Copy className="size-4 text-[#6a6a80]" />
              </button>
              {copied && <p className="text-xs text-emerald-400 mt-1">Copied!</p>}

              <div className="mt-4 flex justify-center">
                <div className="rounded-xl bg-white p-3">
                  <QRCodeSVG value={joinUrl} size={120} bgColor="#ffffff" fgColor="#1a1a2e" level="M" />
                </div>
              </div>
              <p className="mt-2 text-xs text-[#6a6a80]">Scan to join</p>
            </div>

            {/* Participants */}
            <div className="rounded-2xl border border-[#35354a]/60 bg-[#11111f]/80 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#35354a]/40">
                <span className="text-xs font-semibold uppercase tracking-widest text-[#6a6a80]">Students</span>
                <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs font-bold text-violet-400">
                  {activeParticipants.length}
                </span>
              </div>
              <div className="divide-y divide-[#35354a]/30 max-h-64 overflow-y-auto">
                {activeParticipants.length === 0 ? (
                  <p className="py-6 text-center text-xs text-[#4a4a5a]">Waiting for students…</p>
                ) : (
                  activeParticipants.map((p) => (
                    <div key={p.id} className="flex items-center gap-2.5 px-4 py-2.5">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#252538]">
                        <UserCheck className="size-3 text-[#6a6a80]" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-white">
                          {profileName(p)}
                        </p>
                        <p className="truncate text-xs text-[#4a4a5a]">Score: {p.score}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </motion.div>

          {/* Centre: current item */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }} className="col-span-6 space-y-4">

            {/* Item display */}
            <div className="rounded-2xl border border-[#35354a]/60 bg-[#11111f]/80 min-h-64 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#35354a]/40">
                <span className="text-xs font-semibold uppercase tracking-widest text-[#6a6a80]">
                  Item {sortedItems.length > 0 ? currentItem + 1 : 0} of {sortedItems.length}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  activeItem?.type === 'quiz' ? 'bg-violet-500/15 text-violet-400' :
                  activeItem?.type === 'visualisation' ? 'bg-sky-500/15 text-sky-400' :
                  'bg-amber-500/15 text-amber-400'
                }`}>
                  {activeItem?.type ?? 'none'}
                </span>
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={currentItem}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="p-6"
                >
                  {!activeItem ? (
                    <div className="py-12 text-center">
                      <p className="text-[#4a4a5a]">No items in this session</p>
                    </div>
                  ) : activeItem.type === 'quiz' ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 ring-1 ring-violet-500/20">
                          <BookOpen className="size-5 text-violet-400" />
                        </span>
                        <div>
                          <p className="text-lg font-bold text-white">{activeItem.title}</p>
                          <p className="text-sm text-[#6a6a80]">{activeItem.subtitle}</p>
                        </div>
                      </div>
                      <p className="text-sm text-[#8d8da0] mt-4">Students are working through this quiz in real time. Response progress is shown on the right.</p>
                    </div>
                  ) : activeItem.type === 'visualisation' ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 ring-1 ring-sky-500/20">
                          <BarChart2 className="size-5 text-sky-400" />
                        </span>
                        <div>
                          <p className="text-lg font-bold text-white">{activeItem.title}</p>
                          <p className="text-sm text-[#6a6a80] capitalize">{activeItem.subtitle} chart</p>
                        </div>
                      </div>
                      <p className="text-sm text-[#8d8da0] mt-4">This visualisation is now displayed on student screens.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-base font-semibold text-white leading-relaxed">{activeItem.title}</p>
                      {Array.isArray(activeItem.options) && activeItem.options.length > 0 && (
                        <div className="grid grid-cols-2 gap-2">
                          {(activeItem.options as string[]).map((opt) => (
                            <div
                              key={opt}
                              className={`rounded-xl border px-4 py-2.5 text-sm transition ${
                                opt === activeItem.correct_answer
                                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                                  : 'border-[#35354a]/60 bg-[#1a1a2e]/40 text-[#c9c9d4]'
                              }`}
                            >
                              {opt}
                            </div>
                          ))}
                        </div>
                      )}
                      {activeItem.correct_answer && !Array.isArray(activeItem.options) && (
                        <p className="text-xs text-[#6a6a80]">
                          Answer: <span className="text-emerald-400 font-medium">{activeItem.correct_answer}</span>
                        </p>
                      )}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => advance(currentItem - 1)}
                disabled={currentItem === 0 || advancing || sortedItems.length === 0}
                className="flex items-center gap-2 rounded-xl border border-[#35354a] px-5 py-2.5 text-sm font-medium text-[#c9c9d4] transition hover:border-violet-500/40 hover:text-violet-400 disabled:opacity-30"
              >
                <ChevronLeft className="size-4" /> Previous
              </button>

              {/* Progress dots */}
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
                            ? 'h-2 w-2 bg-[#4a4a6a]'
                            : 'h-2 w-2 bg-[#35354a]'
                      }`}
                    />
                  ))}
                </div>
              )}

              <button
                onClick={() => advance(currentItem + 1)}
                disabled={currentItem >= sortedItems.length - 1 || advancing || sortedItems.length === 0}
                className="flex items-center gap-2 rounded-xl border border-[#35354a] px-5 py-2.5 text-sm font-medium text-[#c9c9d4] transition hover:border-violet-500/40 hover:text-violet-400 disabled:opacity-30"
              >
                Next <ChevronRight className="size-4" />
              </button>
            </div>
          </motion.div>

          {/* Right: response feed */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="col-span-3 space-y-4">

            {/* Tally */}
            {(activeItem?.type === 'question' || activeItem?.type === 'quiz') && (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-400">{correctCount}</p>
                  <p className="text-xs text-emerald-600">Correct</p>
                </div>
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-center">
                  <p className="text-2xl font-bold text-red-400">{incorrectCount}</p>
                  <p className="text-xs text-red-600">Incorrect</p>
                </div>
              </div>
            )}

            {/* Response list */}
            <div className="rounded-2xl border border-[#35354a]/60 bg-[#11111f]/80 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#35354a]/40">
                <span className="text-xs font-semibold uppercase tracking-widest text-[#6a6a80]">Responses</span>
                <span className="rounded-full bg-[#252538] px-2 py-0.5 text-xs font-bold text-[#8d8da0]">
                  {activeResponses.length}
                </span>
              </div>
              <div className="divide-y divide-[#35354a]/30 max-h-80 overflow-y-auto">
                {activeResponses.length === 0 ? (
                  <p className="py-6 text-center text-xs text-[#4a4a5a]">
                    {activeItem?.type === 'visualisation' ? 'No responses for charts' : 'No responses yet'}
                  </p>
                ) : (
                  [...activeResponses].sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()).map((r) => (
                    <div key={r.id} className="flex items-start gap-2.5 px-4 py-2.5">
                      {r.is_correct === true ? (
                        <CheckCircle2 className="size-4 shrink-0 mt-0.5 text-emerald-400" />
                      ) : r.is_correct === false ? (
                        <XCircle className="size-4 shrink-0 mt-0.5 text-red-400" />
                      ) : (
                        <span className="h-4 w-4 shrink-0 mt-0.5 rounded-full border border-[#35354a]" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-[#c9c9d4]">{r.answer}</p>
                        <p className="text-xs text-[#4a4a5a]">{new Date(r.submitted_at).toLocaleTimeString()}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Answered / total */}
            {activeItem?.type !== 'visualisation' && activeParticipants.length > 0 && (
              <div className="rounded-xl border border-[#35354a]/40 bg-[#0f0f1a]/60 px-4 py-3">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-[#6a6a80]">Answered</span>
                  <span className="text-[#8d8da0] font-medium">{activeResponses.length} / {activeParticipants.length}</span>
                </div>
                <div className="h-1.5 rounded-full bg-[#252538] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-violet-500 transition-all duration-500"
                    style={{ width: `${activeParticipants.length > 0 ? (activeResponses.length / activeParticipants.length) * 100 : 0}%` }}
                  />
                </div>
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm rounded-2xl border border-[#35354a]/60 bg-[#11111f] p-6 shadow-2xl"
            >
              <div className="flex items-start gap-3 mb-5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/10 ring-1 ring-red-500/20">
                  <AlertTriangle className="size-4 text-red-400" />
                </span>
                <div>
                  <h2 className="text-sm font-bold text-white">End session?</h2>
                  <p className="text-xs text-[#8d8da0] mt-0.5">
                    This disconnects all {activeParticipants.length} connected student{activeParticipants.length !== 1 ? 's' : ''} and locks the session.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowEndConfirm(false)}
                  className="rounded-xl border border-[#35354a] px-4 py-2 text-sm text-[#8d8da0] transition hover:text-white"
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
