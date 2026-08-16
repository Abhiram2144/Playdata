import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen, Play, Plus, Trash2, ChevronUp, ChevronDown,
  BarChart2, ArrowLeft, Copy, Check, Eye, X, Loader2,
  Sparkles, Clock, List, AlignLeft, Hash, Layers,
} from 'lucide-react'
import { GetServerSidePropsResult } from 'next'
import { toast } from 'sonner'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { TEACHER_NAV } from '@/lib/teacher-nav'
import { withAuth } from '@/lib/auth'
import { createClientFromContext } from '@/lib/supabase/server-props'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'

interface SessionItem {
  id: string
  type: 'visualisation' | 'quiz' | 'question'
  reference_id: string
  order_index: number
  title: string
  subtitle: string
}

interface AvailableQuiz {
  id: string
  title: string
  question_count: number
}

interface Session {
  id: string
  title: string
  join_code: string
  status: string
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
  initialItems: SessionItem[]
  availableQuizzes: AvailableQuiz[]
}

interface PreviewQuestion {
  id: string
  order_index: number
  text: string
  type: 'mcq' | 'short_answer' | 'numerical'
  options: string[] | null
  correct_answer: string
  time_limit_secs: number
  topic_tag: string | null
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
      .select('id, title, join_code, status, teacher_id')
      .eq('id', sessionId)
      .single()

    if (!session || session.teacher_id !== userId) {
      return { redirect: { destination: '/teacher/sessions', permanent: false } }
    }

    if (session.status === 'active') {
      return { redirect: { destination: `/teacher/sessions/${sessionId}/live`, permanent: false } }
    }

    const [itemsRes, quizzesRes] = await Promise.all([
      admin
        .from('session_items')
        .select('id, type, reference_id, order_index')
        .eq('session_id', sessionId)
        .order('order_index'),
      admin
        .from('quizzes')
        .select('id, title, questions(id)')
        .eq('teacher_id', userId)
        .order('created_at', { ascending: false }),
    ])

    const items = itemsRes.data ?? []

    // Resolve titles for existing items (legacy sessions may contain charts)
    const quizIds = items.filter((i: Record<string, unknown>) => i.type === 'quiz').map((i: Record<string, unknown>) => i.reference_id as string)
    const visIds = items.filter((i: Record<string, unknown>) => i.type === 'visualisation').map((i: Record<string, unknown>) => i.reference_id as string)

    type QuizRow = { id: string; title: string; questions: unknown[] }
    type VisRow = { id: string; name: string; chart_type: string }

    const [quizDetailRes, visDetailRes] = await Promise.all([
      quizIds.length > 0 ? admin.from('quizzes').select('id, title, questions(id)').in('id', quizIds) : { data: [] },
      visIds.length > 0 ? admin.from('visualisations').select('id, name, chart_type').in('id', visIds) : { data: [] },
    ])

    const quizMap = new Map((quizDetailRes.data ?? []).map((q: QuizRow) => [q.id, q]))
    const visMap = new Map((visDetailRes.data ?? []).map((v: VisRow) => [v.id, v]))

    const initialItems: SessionItem[] = items.map((item: Record<string, unknown>) => {
      const ref = item.reference_id as string
      if (item.type === 'quiz') {
        const q = quizMap.get(ref) as QuizRow | undefined
        return { id: item.id as string, type: 'quiz' as const, reference_id: ref, order_index: item.order_index as number, title: q?.title ?? 'Unknown quiz', subtitle: `${Array.isArray(q?.questions) ? q.questions.length : 0} questions` }
      }
      if (item.type === 'visualisation') {
        const v = visMap.get(ref) as VisRow | undefined
        return { id: item.id as string, type: 'visualisation' as const, reference_id: ref, order_index: item.order_index as number, title: v?.name ?? 'Unknown chart', subtitle: v?.chart_type ?? '' }
      }
      return { id: item.id as string, type: item.type as 'question', reference_id: ref, order_index: item.order_index as number, title: 'Question', subtitle: '' }
    })

    const availableQuizzes: AvailableQuiz[] = (quizzesRes.data ?? []).map((q: QuizRow) => ({
      id: q.id,
      title: q.title,
      question_count: Array.isArray(q.questions) ? q.questions.length : 0,
    }))

    return {
      props: {
        profile,
        session: { id: session.id, title: session.title, join_code: session.join_code, status: session.status },
        initialItems,
        availableQuizzes,
      },
    }
  },
  { allowedRoles: ['teacher'] }
)

const TYPE_META: Record<PreviewQuestion['type'], { label: string; icon: React.ElementType; classes: string }> = {
  mcq:          { label: 'MCQ',          icon: List,      classes: 'bg-violet-100 text-violet-700 ring-violet-200' },
  short_answer: { label: 'Short answer', icon: AlignLeft, classes: 'bg-amber-100 text-amber-700 ring-amber-200' },
  numerical:    { label: 'Numerical',    icon: Hash,      classes: 'bg-sky-100 text-sky-700 ring-sky-200' },
}

// ── Quiz preview modal ─────────────────────────────────────────────────────────

function QuizPreviewModal({ quizId, quizTitle, onClose }: { quizId: string; quizTitle: string; onClose: () => void }) {
  const [questions, setQuestions] = useState<PreviewQuestion[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/teacher/quizzes/${quizId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (data.error) { setError(data.error); return }
        setQuestions((data.quiz?.questions ?? []) as PreviewQuestion[])
      })
      .catch(() => { if (!cancelled) setError('Failed to load quiz') })
    return () => { cancelled = true }
  }, [quizId])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 14 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="relative shrink-0 overflow-hidden border-b border-gray-100 bg-gradient-to-r from-violet-50 via-white to-white px-6 py-5">
          <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-violet-200/40 blur-2xl" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-violet-500">
                <Eye className="size-3.5" /> Quiz preview
              </p>
              <h2 className="mt-1 text-lg font-bold text-gray-900">{quizTitle}</h2>
              {questions && (
                <p className="mt-0.5 text-xs text-gray-500">
                  {questions.length} question{questions.length !== 1 ? 's' : ''} — exactly what students will be asked
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Close preview"
              className="rounded-xl p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Modal body */}
        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
          )}
          {!questions && !error && (
            <div className="flex flex-col items-center gap-3 py-14">
              <Loader2 className="size-6 animate-spin text-violet-500" />
              <p className="text-xs text-gray-500">Loading questions…</p>
            </div>
          )}
          {questions?.length === 0 && (
            <p className="py-10 text-center text-sm text-gray-500">This quiz has no questions yet.</p>
          )}
          {questions?.map((q, qi) => {
            const meta = TYPE_META[q.type] ?? TYPE_META.mcq
            const TypeIcon = meta.icon
            return (
              <motion.div
                key={q.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.04 * qi }}
                className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white text-[11px] font-bold text-gray-500 ring-1 ring-gray-200">
                    {qi + 1}
                  </span>
                  <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${meta.classes}`}>
                    <TypeIcon className="size-3" /> {meta.label}
                  </span>
                  {q.time_limit_secs > 0 && (
                    <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                      <Clock className="size-3" /> {q.time_limit_secs}s
                    </span>
                  )}
                  {q.topic_tag && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                      {q.topic_tag}
                    </span>
                  )}
                </div>

                <p className="text-sm font-medium text-gray-800">{q.text}</p>

                {q.type === 'mcq' && Array.isArray(q.options) && (
                  <ul className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
                    {q.options.map((opt, oi) => (
                      <li
                        key={oi}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs ${
                          opt === q.correct_answer
                            ? 'border-emerald-200 bg-emerald-50 font-semibold text-emerald-700'
                            : 'border-gray-200 bg-white text-gray-600'
                        }`}
                      >
                        {opt === q.correct_answer && <Check className="size-3 shrink-0 text-emerald-500" />}
                        <span className="truncate">{opt}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {q.type !== 'mcq' && (
                  <p className="mt-2.5 text-xs text-gray-500">
                    Answer: <span className="font-semibold text-emerald-700">{q.correct_answer}</span>
                  </p>
                )}
              </motion.div>
            )
          })}
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function SessionBuilder({ profile, session, initialItems, availableQuizzes }: Props) {
  const router = useRouter()
  const [items, setItems] = useState<SessionItem[]>(initialItems)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [launching, setLaunching] = useState(false)
  const [copied, setCopied] = useState(false)
  const [preview, setPreview] = useState<{ id: string; title: string } | null>(null)

  const addQuiz = async (quiz: AvailableQuiz) => {
    const alreadyAdded = items.some((i) => i.reference_id === quiz.id && i.type === 'quiz')
    if (alreadyAdded) { toast.error('Already added to this session'); return }

    setAddingId(quiz.id)
    const res = await fetch(`/api/teacher/sessions/${session.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'quiz', reference_id: quiz.id }),
    })
    const data = await res.json()
    setAddingId(null)
    if (!res.ok) { toast.error(data.error ?? 'Failed to add quiz'); return }

    setItems((prev) => [
      ...prev,
      {
        id: data.item.id,
        type: 'quiz',
        reference_id: quiz.id,
        order_index: data.item.order_index,
        title: quiz.title,
        subtitle: `${quiz.question_count} question${quiz.question_count !== 1 ? 's' : ''}`,
      },
    ])
    toast.success('Quiz added to the line-up')
  }

  const removeItem = async (itemId: string) => {
    setRemovingId(itemId)
    const res = await fetch(`/api/teacher/sessions/${session.id}/items?itemId=${itemId}`, { method: 'DELETE' })
    setRemovingId(null)
    if (!res.ok) { const d = await res.json(); toast.error(d.error ?? 'Failed to remove'); return }
    setItems((prev) => prev.filter((i) => i.id !== itemId).map((i, idx) => ({ ...i, order_index: idx })))
  }

  const moveItem = async (index: number, direction: 'up' | 'down') => {
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    if (swapIndex < 0 || swapIndex >= items.length) return

    const reordered = [...items]
    const tmp = reordered[index]
    reordered[index] = { ...reordered[swapIndex], order_index: index }
    reordered[swapIndex] = { ...tmp, order_index: swapIndex }

    setItems(reordered)

    await fetch(`/api/teacher/sessions/${session.id}/items`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: reordered.map((i) => ({ id: i.id, order_index: i.order_index })) }),
    })
  }

  const handleLaunch = async () => {
    if (items.length === 0) { toast.error('Add at least one quiz before going live'); return }
    setLaunching(true)
    router.push(`/teacher/sessions/${session.id}/live`)
  }

  const copyCode = () => {
    navigator.clipboard.writeText(session.join_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isAdded = (id: string) => items.some((i) => i.type === 'quiz' && i.reference_id === id)
  const sorted = [...items].sort((a, b) => a.order_index - b.order_index)

  return (
    <DashboardLayout navItems={TEACHER_NAV} profile={profile}>
      <div className="max-w-6xl space-y-6">

        {/* Hero header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="relative overflow-hidden rounded-3xl border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-indigo-50/60 p-6 shadow-sm sm:p-8"
        >
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-violet-200/40 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-1/3 h-48 w-48 rounded-full bg-indigo-200/30 blur-3xl" />

          <div className="relative flex flex-wrap items-end justify-between gap-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <Link
                  href="/teacher/sessions"
                  className="rounded-xl border border-gray-200 bg-white/80 p-2 text-gray-400 backdrop-blur transition hover:border-violet-300 hover:text-violet-600"
                >
                  <ArrowLeft className="size-4" />
                </Link>
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-violet-500">
                  <Sparkles className="size-3.5" /> Session builder
                </p>
              </div>
              <h1 className="mt-3 truncate text-3xl font-bold tracking-tight text-gray-900">{session.title}</h1>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  onClick={copyCode}
                  className="group flex items-center gap-2.5 rounded-2xl border border-violet-200 bg-white px-4 py-2 shadow-sm transition hover:border-violet-300 hover:shadow"
                >
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Join code</span>
                  <span className="font-mono text-lg font-bold tracking-[0.3em] text-violet-700">{session.join_code}</span>
                  <AnimatePresence mode="wait" initial={false}>
                    {copied ? (
                      <motion.span key="check" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }}>
                        <Check className="size-4 text-emerald-500" />
                      </motion.span>
                    ) : (
                      <motion.span key="copy" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }}>
                        <Copy className="size-4 text-gray-400 transition group-hover:text-violet-500" />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
                <p className="text-xs text-gray-500">Students join with this code once you go live.</p>
              </div>
            </div>

            <motion.button
              onClick={handleLaunch}
              disabled={launching || items.length === 0}
              whileHover={items.length > 0 ? { scale: 1.03 } : undefined}
              whileTap={items.length > 0 ? { scale: 0.97 } : undefined}
              className="relative flex items-center gap-2.5 rounded-2xl bg-emerald-600 px-7 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-500 disabled:opacity-40 disabled:shadow-none"
            >
              {items.length > 0 && !launching && (
                <span className="absolute -right-1 -top-1 flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
                </span>
              )}
              <Play className="size-4" fill="currentColor" />
              {launching ? 'Launching…' : 'Go Live'}
            </motion.button>
          </div>
        </motion.div>

        <div className="grid gap-6 lg:grid-cols-5">

          {/* Session line-up */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-3 lg:col-span-3"
          >
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-gray-400">
                <Layers className="size-3.5" /> Session line-up
              </h2>
              <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-bold text-violet-700">
                {items.length} item{items.length !== 1 ? 's' : ''}
              </span>
            </div>

            {sorted.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center rounded-3xl border-2 border-dashed border-gray-200 bg-white/60 px-8 py-16 text-center"
              >
                <motion.span
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                  className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 ring-1 ring-violet-200"
                >
                  <BookOpen className="size-7 text-violet-600" />
                </motion.span>
                <p className="mt-4 text-sm font-semibold text-gray-800">Your line-up is empty</p>
                <p className="mt-1 max-w-xs text-xs leading-relaxed text-gray-500">
                  Pick a quiz from the library to build your session. You can preview any quiz before adding it.
                </p>
              </motion.div>
            ) : (
              <div className="relative space-y-2.5">
                <AnimatePresence initial={false}>
                  {sorted.map((item, index) => (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, x: 24, scale: 0.98 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: -24, scale: 0.98 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      className="group flex items-center gap-4 rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-sm transition hover:border-violet-200 hover:shadow-md"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-sm font-bold text-white shadow-sm shadow-violet-600/30">
                        {index + 1}
                      </span>
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.type === 'quiz' ? 'bg-violet-100 text-violet-600' : 'bg-sky-100 text-sky-600'}`}>
                        {item.type === 'quiz' ? <BookOpen className="size-4" /> : <BarChart2 className="size-4" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-900">{item.title}</p>
                        <p className="text-xs capitalize text-gray-400">{item.type} · {item.subtitle}</p>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-60 transition group-hover:opacity-100">
                        {item.type === 'quiz' && (
                          <button
                            onClick={() => setPreview({ id: item.reference_id, title: item.title })}
                            aria-label="Preview quiz"
                            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-violet-50 hover:text-violet-600"
                          >
                            <Eye className="size-4" />
                          </button>
                        )}
                        <button
                          onClick={() => moveItem(index, 'up')}
                          disabled={index === 0}
                          aria-label="Move up"
                          className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-20"
                        >
                          <ChevronUp className="size-4" />
                        </button>
                        <button
                          onClick={() => moveItem(index, 'down')}
                          disabled={index === sorted.length - 1}
                          aria-label="Move down"
                          className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-20"
                        >
                          <ChevronDown className="size-4" />
                        </button>
                        <button
                          onClick={() => removeItem(item.id)}
                          disabled={removingId === item.id}
                          aria-label="Remove from session"
                          className="rounded-lg p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </motion.div>

          {/* Quiz library */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-3 lg:col-span-2"
          >
            <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-gray-400">
              <BookOpen className="size-3.5" /> Quiz library
            </h2>

            <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
              <div className="max-h-[calc(100vh-26rem)] divide-y divide-gray-50 overflow-y-auto">
                {availableQuizzes.length === 0 ? (
                  <div className="px-6 py-12 text-center">
                    <p className="text-sm font-medium text-gray-700">No quizzes yet</p>
                    <p className="mt-1 text-xs text-gray-500">
                      Create one in the{' '}
                      <Link href="/teacher/quizzes" className="font-semibold text-violet-600 hover:text-violet-500">
                        Quizzes
                      </Link>{' '}
                      section first.
                    </p>
                  </div>
                ) : (
                  availableQuizzes.map((quiz, qi) => {
                    const added = isAdded(quiz.id)
                    return (
                      <motion.div
                        key={quiz.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.18 + qi * 0.04 }}
                        className="group flex items-center gap-3 px-4 py-3.5 transition hover:bg-violet-50/40"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 transition group-hover:bg-violet-200/70">
                          <BookOpen className="size-4 text-violet-600" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-gray-900">{quiz.title}</p>
                          <p className="text-xs text-gray-400">{quiz.question_count} question{quiz.question_count !== 1 ? 's' : ''}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            onClick={() => setPreview({ id: quiz.id, title: quiz.title })}
                            aria-label={`Preview ${quiz.title}`}
                            title="Preview quiz"
                            className="rounded-xl border border-gray-200 p-1.5 text-gray-400 transition hover:border-violet-300 hover:text-violet-600"
                          >
                            <Eye className="size-3.5" />
                          </button>
                          <button
                            onClick={() => addQuiz(quiz)}
                            disabled={addingId === quiz.id || added}
                            className={`flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                              added
                                ? 'cursor-default bg-emerald-50 text-emerald-600'
                                : 'bg-violet-600 text-white shadow-sm shadow-violet-600/25 hover:bg-violet-500'
                            }`}
                          >
                            {added
                              ? <><Check className="size-3" /> Added</>
                              : addingId === quiz.id
                                ? <Loader2 className="size-3.5 animate-spin" />
                                : <><Plus className="size-3" /> Add</>}
                          </button>
                        </div>
                      </motion.div>
                    )
                  })
                )}
              </div>
            </div>

            {/* Tip */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="rounded-2xl border border-violet-100 bg-violet-50/60 px-4 py-3"
            >
              <p className="text-xs leading-relaxed text-gray-500">
                <span className="font-semibold text-violet-700">Tip:</span> use the <Eye className="mx-0.5 inline size-3 text-violet-500" /> preview
                to double-check questions before adding a quiz, then hit{' '}
                <span className="font-semibold text-emerald-600">Go Live</span> when your line-up is ready.
              </p>
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* Quiz preview modal */}
      <AnimatePresence>
        {preview && (
          <QuizPreviewModal
            key={preview.id}
            quizId={preview.id}
            quizTitle={preview.title}
            onClose={() => setPreview(null)}
          />
        )}
      </AnimatePresence>
    </DashboardLayout>
  )
}
