import { useState } from 'react'
import { useRouter } from 'next/router'
import { motion } from 'framer-motion'
import {
  LayoutDashboard, Database, BarChart3, BookOpen, Users,
  TrendingUp, UserCircle, Play, Plus, Trash2, ChevronUp,
  ChevronDown, BarChart2, FileQuestion, ArrowLeft, Copy,
} from 'lucide-react'
import { GetServerSidePropsResult } from 'next'
import { toast } from 'sonner'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { type NavItem } from '@/components/layout/Sidebar'
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

interface AvailableVis {
  id: string
  name: string
  chart_type: string
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
  availableVisualisations: AvailableVis[]
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

    const [itemsRes, quizzesRes, visRes] = await Promise.all([
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
      admin
        .from('visualisations')
        .select('id, name, chart_type')
        .eq('teacher_id', userId)
        .order('created_at', { ascending: false }),
    ])

    const items = itemsRes.data ?? []

    // Resolve titles for existing items
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

    const availableVisualisations: AvailableVis[] = (visRes.data ?? []).map((v: VisRow) => ({
      id: v.id,
      name: v.name,
      chart_type: v.chart_type,
    }))

    return {
      props: {
        profile,
        session: { id: session.id, title: session.title, join_code: session.join_code, status: session.status },
        initialItems,
        availableQuizzes,
        availableVisualisations,
      },
    }
  },
  { allowedRoles: ['teacher'] }
)

const NAV_ITEMS = TEACHER_NAV

const CHART_LABELS: Record<string, string> = {
  bar: 'Bar', line: 'Line', pie: 'Pie', scatter: 'Scatter', histogram: 'Histogram',
}

export default function SessionBuilder({ profile, session, initialItems, availableQuizzes, availableVisualisations }: Props) {
  const router = useRouter()
  const [items, setItems] = useState<SessionItem[]>(initialItems)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [launching, setLaunching] = useState(false)
  const [activeTab, setActiveTab] = useState<'quizzes' | 'visualisations'>('quizzes')
  const [copied, setCopied] = useState(false)

  const addItem = async (type: 'quiz' | 'visualisation', referenceId: string, title: string, subtitle: string) => {
    const alreadyAdded = items.some((i) => i.reference_id === referenceId && i.type === type)
    if (alreadyAdded) { toast.error('Already added to this session'); return }

    setAddingId(referenceId)
    const res = await fetch(`/api/teacher/sessions/${session.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, reference_id: referenceId }),
    })
    const data = await res.json()
    setAddingId(null)
    if (!res.ok) { toast.error(data.error ?? 'Failed to add item'); return }

    setItems((prev) => [
      ...prev,
      { id: data.item.id, type, reference_id: referenceId, order_index: data.item.order_index, title, subtitle },
    ])
    toast.success('Added to session')
  }

  const removeItem = async (itemId: string) => {
    setRemovingId(itemId)
    const res = await fetch(`/api/teacher/sessions/${session.id}/items?itemId=${itemId}`, { method: 'DELETE' })
    setRemovingId(null)
    if (!res.ok) { const d = await res.json(); toast.error(d.error ?? 'Failed to remove'); return }
    setItems((prev) => prev.filter((i) => i.id !== itemId).map((i, idx) => ({ ...i, order_index: idx })))
    toast.success('Removed')
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
    if (items.length === 0) { toast.error('Add at least one item before going live'); return }
    setLaunching(true)
    router.push(`/teacher/sessions/${session.id}/live`)
  }

  const copyCode = () => {
    navigator.clipboard.writeText(session.join_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isAdded = (type: string, id: string) => items.some((i) => i.type === type && i.reference_id === id)

  return (
    <DashboardLayout navItems={NAV_ITEMS} profile={profile}>
      <div className="max-w-6xl space-y-6">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Link href="/teacher/sessions" className="mt-1 rounded-lg border border-[#35354a] p-1.5 text-[#6a6a80] hover:text-white transition">
              <ArrowLeft className="size-4" />
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-[#6a6a80]">Session Builder</p>
              <h1 className="mt-0.5 text-2xl font-bold text-white">{session.title}</h1>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-xs text-[#8d8da0]">Join code:</span>
                <button
                  onClick={copyCode}
                  className="flex items-center gap-1.5 rounded-lg border border-[#35354a] px-2 py-0.5 font-mono text-sm font-bold tracking-widest text-violet-400 transition hover:border-violet-500/40"
                >
                  {session.join_code}
                  <Copy className="size-3" />
                </button>
                {copied && <span className="text-xs text-emerald-400">Copied!</span>}
              </div>
            </div>
          </div>
          <button
            onClick={handleLaunch}
            disabled={launching || items.length === 0}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40"
          >
            <Play className="size-4" fill="currentColor" />
            {launching ? 'Launching…' : 'Go Live'}
          </button>
        </motion.div>

        <div className="grid grid-cols-5 gap-6">

          {/* Session items list */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }} className="col-span-3 space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[#6a6a80]">
              Session Items <span className="text-[#4a4a5a]">({items.length})</span>
            </h2>

            {items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#35354a]/60 bg-[#0f0f1a]/40 py-14 text-center">
                <Plus className="mx-auto size-8 text-[#35354a] mb-2" />
                <p className="text-sm text-[#4a4a5a]">Add quizzes or visualisations from the panel →</p>
              </div>
            ) : (
              <div className="space-y-2">
                {[...items].sort((a, b) => a.order_index - b.order_index).map((item, index) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-xl border border-[#35354a]/60 bg-[#11111f]/80 px-4 py-3"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#252538] text-xs font-bold text-[#6a6a80]">
                      {index + 1}
                    </span>
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${item.type === 'quiz' ? 'bg-violet-500/10 text-violet-400' : 'bg-sky-500/10 text-sky-400'}`}>
                      {item.type === 'quiz' ? <BookOpen className="size-3.5" /> : <BarChart2 className="size-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{item.title}</p>
                      <p className="text-xs text-[#6a6a80] capitalize">{item.type} · {item.subtitle}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => moveItem(index, 'up')}
                        disabled={index === 0}
                        className="rounded p-1 text-[#4a4a5a] hover:text-white disabled:opacity-20 transition"
                      >
                        <ChevronUp className="size-4" />
                      </button>
                      <button
                        onClick={() => moveItem(index, 'down')}
                        disabled={index === items.length - 1}
                        className="rounded p-1 text-[#4a4a5a] hover:text-white disabled:opacity-20 transition"
                      >
                        <ChevronDown className="size-4" />
                      </button>
                      <button
                        onClick={() => removeItem(item.id)}
                        disabled={removingId === item.id}
                        className="rounded p-1 text-red-500/40 hover:text-red-400 disabled:opacity-40 transition"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>

          {/* Available items panel */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="col-span-2 space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[#6a6a80]">Add Items</h2>

            <div className="rounded-2xl border border-[#35354a]/60 bg-[#11111f]/80 overflow-hidden">
              {/* Tabs */}
              <div className="flex border-b border-[#35354a]/60">
                {(['quizzes', 'visualisations'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-2.5 text-xs font-semibold transition capitalize ${activeTab === tab ? 'text-violet-400 border-b-2 border-violet-500 bg-violet-500/5' : 'text-[#6a6a80] hover:text-white'}`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="divide-y divide-[#35354a]/40 max-h-[calc(100vh-24rem)] overflow-y-auto">
                {activeTab === 'quizzes' && (
                  availableQuizzes.length === 0
                    ? <p className="py-8 text-center text-xs text-[#4a4a5a]">No quizzes yet. Create one first.</p>
                    : availableQuizzes.map((quiz) => {
                      const added = isAdded('quiz', quiz.id)
                      return (
                        <div key={quiz.id} className="flex items-center gap-3 px-4 py-3">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
                            <BookOpen className="size-3.5 text-violet-400" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-white">{quiz.title}</p>
                            <p className="text-xs text-[#6a6a80]">{quiz.question_count} question{quiz.question_count !== 1 ? 's' : ''}</p>
                          </div>
                          <button
                            onClick={() => addItem('quiz', quiz.id, quiz.title, `${quiz.question_count} questions`)}
                            disabled={addingId === quiz.id || added}
                            className={`flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition ${added ? 'text-emerald-400 bg-emerald-500/10 cursor-default' : 'border border-[#35354a] text-[#8d8da0] hover:border-violet-500/40 hover:text-violet-400'}`}
                          >
                            {added ? '✓ Added' : addingId === quiz.id ? '…' : <><Plus className="size-3" /> Add</>}
                          </button>
                        </div>
                      )
                    })
                )}
                {activeTab === 'visualisations' && (
                  availableVisualisations.length === 0
                    ? <p className="py-8 text-center text-xs text-[#4a4a5a]">No visualisations yet.</p>
                    : availableVisualisations.map((vis) => {
                      const added = isAdded('visualisation', vis.id)
                      return (
                        <div key={vis.id} className="flex items-center gap-3 px-4 py-3">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/10">
                            <BarChart2 className="size-3.5 text-sky-400" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-white">{vis.name}</p>
                            <p className="text-xs text-[#6a6a80]">{CHART_LABELS[vis.chart_type] ?? vis.chart_type} chart</p>
                          </div>
                          <button
                            onClick={() => addItem('visualisation', vis.id, vis.name, `${CHART_LABELS[vis.chart_type] ?? vis.chart_type} chart`)}
                            disabled={addingId === vis.id || added}
                            className={`flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition ${added ? 'text-emerald-400 bg-emerald-500/10 cursor-default' : 'border border-[#35354a] text-[#8d8da0] hover:border-violet-500/40 hover:text-violet-400'}`}
                          >
                            {added ? '✓ Added' : addingId === vis.id ? '…' : <><Plus className="size-3" /> Add</>}
                          </button>
                        </div>
                      )
                    })
                )}
              </div>
            </div>

            {/* Tip */}
            <div className="rounded-xl border border-[#35354a]/40 bg-[#0f0f1a]/60 px-4 py-3">
              <p className="text-xs text-[#6a6a80]">
                <span className="text-[#8d8da0] font-medium">Tip:</span> Students join with the 6-character code <span className="font-mono font-bold text-violet-400">{session.join_code}</span>. Add content, then click <span className="text-emerald-400 font-medium">Go Live</span> to start.
              </p>
            </div>

            {/* Separate FileQuestion items in future */}
            <div className="rounded-xl border border-[#35354a]/40 bg-[#0f0f1a]/60 px-4 py-3 flex items-start gap-2">
              <FileQuestion className="size-3.5 text-[#4a4a5a] shrink-0 mt-0.5" />
              <p className="text-xs text-[#4a4a5a]">Standalone question items (from individual quiz questions) can be added here in a future update.</p>
            </div>
          </motion.div>
        </div>
      </div>
    </DashboardLayout>
  )
}
