import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Users, BookOpen, BarChart2, Clock, Trophy,
  CheckCircle2, XCircle, Minus, Download, MessageSquare,
  Target, AlertTriangle, Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { GetServerSidePropsResult } from 'next'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { TEACHER_NAV } from '@/lib/teacher-nav'
import { withAuth } from '@/lib/auth'
import { createClientFromContext } from '@/lib/supabase/server-props'
import { createAdminClient } from '@/lib/supabase/admin'

// ── Types ──────────────────────────────────────────────────────────────────────

interface SessionMeta {
  id: string
  title: string
  join_code: string
  status: string
  started_at: string | null
  ended_at: string | null
  ai_summary: string | null
}

interface Analytics {
  avg_score: number | null
  participation_rate: number | null
  completion_rate: number | null
  total_questions: number
  participant_count: number
  computed_at: string | null
}

interface QuestionResult {
  id: string
  quiz_id: string
  quiz_title: string
  label: string
  text: string
  type: string
  correct_answer: string
  correct_count: number
  incorrect_count: number
  no_answer_count: number
  pct_correct: number
}

interface ParticipantResult {
  id: string
  student_id: string | null
  display_name: string
  email: string
  score: number
  correct_count: number
  incorrect_count: number
  answered_count: number
  pct_correct: number
  responses: Record<string, { answer: string; is_correct: boolean | null }>
}

interface VisItem {
  id: string
  title: string
}

interface Profile {
  id: string
  full_name: string
  email: string
  role: string
}

interface Props {
  profile: Profile
  session: SessionMeta
  analytics: Analytics
  questions: QuestionResult[]
  participants: ParticipantResult[]
  visItems: VisItem[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveParticipantName(raw: {
  student_id: string | null
  display_name: string | null
  profiles: unknown
}): [string, string] {
  if (raw.profiles) {
    const p = Array.isArray(raw.profiles) ? raw.profiles[0] : raw.profiles
    if (p && typeof p === 'object') {
      const name = (p as { full_name?: string }).full_name ?? ''
      const email = (p as { email?: string }).email ?? ''
      if (name) return [name, email]
    }
  }
  return [raw.display_name ?? 'Guest', '']
}

function formatDuration(start: string | null, end: string | null): string {
  if (!start || !end) return '—'
  const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000)
  if (mins < 60) return `${mins} min${mins !== 1 ? 's' : ''}`
  const h = Math.floor(mins / 60), m = mins % 60
  return `${h}h ${m}m`
}

function fmtPct(n: number | null): string {
  if (n == null) return '—'
  return `${Math.round(n * 100)}%`
}

// ── Server-side ───────────────────────────────────────────────────────────────

export const getServerSideProps = withAuth(
  async (context, userId): Promise<GetServerSidePropsResult<Props>> => {
    const { id: sessionId } = context.params as { id: string }
    const supabase = createClientFromContext(context)

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .eq('id', userId)
      .single()
    if (!profile) return { redirect: { destination: '/auth/login', permanent: false } }

    const admin = createAdminClient()

    const { data: session } = await admin
      .from('sessions')
      .select('id, title, join_code, status, started_at, ended_at, teacher_id, ai_summary')
      .eq('id', sessionId)
      .single()

    if (!session || session.teacher_id !== userId) {
      return { redirect: { destination: '/teacher/sessions', permanent: false } }
    }
    if (session.status === 'active') {
      return { redirect: { destination: `/teacher/sessions/${sessionId}/live`, permanent: false } }
    }

    const [analyticsRes, itemsRes, participantsRes, responsesRes] = await Promise.all([
      admin
        .from('session_analytics')
        .select('avg_score, participation_rate, completion_rate, total_questions, participant_count, computed_at')
        .eq('session_id', sessionId)
        .maybeSingle(),
      admin.from('session_items').select('type, reference_id, order_index').eq('session_id', sessionId).order('order_index'),
      admin.from('session_participants').select('id, student_id, display_name, score, profiles(full_name, email)').eq('session_id', sessionId).order('joined_at'),
      admin.from('student_responses').select('student_id, question_id, answer, is_correct').eq('session_id', sessionId),
    ])

    const items = itemsRes.data ?? []

    const quizIds = items
      .filter((i: Record<string, unknown>) => i.type === 'quiz')
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) => (a.order_index as number) - (b.order_index as number))
      .map((i: Record<string, unknown>) => i.reference_id as string)

    const visRefs = items
      .filter((i: Record<string, unknown>) => i.type === 'visualisation')
      .map((i: Record<string, unknown>) => i.reference_id as string)

    type QuizRow = {
      id: string; title: string
      questions: { id: string; order_index: number; text: string; type: string; correct_answer: string }[]
    }
    type VisRow = { id: string; name: string }

    const [quizzesRes, visRes] = await Promise.all([
      quizIds.length > 0
        ? admin.from('quizzes').select('id, title, questions(id, order_index, text, type, correct_answer)').in('id', quizIds)
        : { data: [] },
      visRefs.length > 0
        ? admin.from('visualisations').select('id, name').in('id', visRefs)
        : { data: [] },
    ])

    const quizMap = new Map((quizzesRes.data ?? []).map((q: QuizRow) => [q.id, q]))
    const visMap = new Map((visRes.data ?? []).map((v: VisRow) => [v.id, v]))

    type QEntry = Omit<QuestionResult, 'correct_count' | 'incorrect_count' | 'no_answer_count' | 'pct_correct'>
    const orderedQuestions: QEntry[] = []
    quizIds.forEach((qid) => {
      const quiz = quizMap.get(qid) as QuizRow | undefined
      if (!quiz) return
      ;[...(quiz.questions ?? [])].sort((a, b) => a.order_index - b.order_index).forEach((q) => {
        orderedQuestions.push({
          id: q.id, quiz_id: quiz.id, quiz_title: quiz.title,
          label: `Q${orderedQuestions.length + 1}`,
          text: q.text, type: q.type, correct_answer: q.correct_answer,
        })
      })
    })

    const participantCount = (participantsRes.data ?? []).length

    type RespEntry = { answer: string; is_correct: boolean | null }
    const byStudent = new Map<string, Map<string, RespEntry>>()
    ;(responsesRes.data ?? []).forEach((r: { student_id: string | null; question_id: string; answer: string; is_correct: boolean | null }) => {
      if (!r.student_id) return
      const m = byStudent.get(r.student_id) ?? new Map<string, RespEntry>()
      m.set(r.question_id, { answer: r.answer, is_correct: r.is_correct })
      byStudent.set(r.student_id, m)
    })

    const questions: QuestionResult[] = orderedQuestions.map((q) => {
      let correct = 0, incorrect = 0
      ;(responsesRes.data ?? []).forEach((r: { question_id: string; is_correct: boolean | null }) => {
        if (r.question_id !== q.id) return
        if (r.is_correct === true) correct++
        else if (r.is_correct === false) incorrect++
      })
      return {
        ...q, correct_count: correct, incorrect_count: incorrect,
        no_answer_count: Math.max(0, participantCount - correct - incorrect),
        pct_correct: participantCount > 0 ? Math.round((correct / participantCount) * 100) : 0,
      }
    })

    const participants: ParticipantResult[] = (participantsRes.data ?? []).map((p: {
      id: string; student_id: string | null; display_name: string | null; score: number; profiles: unknown
    }) => {
      const [name, email] = resolveParticipantName(p)
      const respMap = p.student_id ? (byStudent.get(p.student_id) ?? new Map()) : new Map()
      const responses: ParticipantResult['responses'] = {}
      respMap.forEach((v: RespEntry, k: string) => { responses[k] = v })
      const correctCount = Array.from(respMap.values()).filter((r: RespEntry) => r.is_correct === true).length
      const incorrectCount = Array.from(respMap.values()).filter((r: RespEntry) => r.is_correct === false).length
      return {
        id: p.id, student_id: p.student_id, display_name: name, email,
        score: p.score ?? 0, correct_count: correctCount, incorrect_count: incorrectCount,
        answered_count: respMap.size,
        pct_correct: questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0,
        responses,
      }
    })

    const rawA = analyticsRes.data
    const analytics: Analytics = {
      avg_score: rawA?.avg_score ?? null,
      participation_rate: rawA?.participation_rate ?? null,
      completion_rate: rawA?.completion_rate ?? null,
      total_questions: rawA?.total_questions ?? questions.length,
      participant_count: rawA?.participant_count ?? participantCount,
      computed_at: rawA?.computed_at ?? null,
    }

    const visItems: VisItem[] = visRefs.map((vid) => {
      const v = visMap.get(vid) as VisRow | undefined
      return { id: vid, title: v?.name ?? 'Chart' }
    })

    return {
      props: {
        profile,
        session: { id: session.id, title: session.title, join_code: session.join_code, status: session.status, started_at: session.started_at, ended_at: session.ended_at, ai_summary: session.ai_summary ?? null },
        analytics, questions, participants, visItems,
      },
    }
  },
  { allowedRoles: ['teacher'] }
)

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, colour }: {
  label: string; value: string | number; sub?: string
  colour: 'violet' | 'emerald' | 'sky' | 'amber'
}) {
  const cls: Record<string, string> = {
    violet: 'text-violet-700 ring-violet-200 bg-violet-50',
    emerald: 'text-emerald-700 ring-emerald-200 bg-emerald-50',
    sky: 'text-sky-700 ring-sky-200 bg-sky-50',
    amber: 'text-amber-700 ring-amber-200 bg-amber-50',
  }
  return (
    <div className={`rounded-2xl border border-gray-100 bg-white shadow-sm p-5 ring-1 ${cls[colour]}`}>
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${cls[colour].split(' ')[0]}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  )
}

function HorizBar({ value, total, cls }: { value: number; total: number; cls: string }) {
  const pct = total > 0 ? Math.max(0, Math.min(1, value / total)) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full ${cls}`} style={{ width: `${pct * 100}%` }} />
      </div>
      <span className="w-6 text-right text-xs font-mono text-gray-500 shrink-0">{value}</span>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SessionResults({ profile, session, analytics, questions, participants, visItems }: Props) {
  const [activeTab, setActiveTab] = useState<'questions' | 'students'>('questions')
  const [exporting, setExporting] = useState(false)
  const [notes, setNotes] = useState('')

  const sorted = [...participants].sort((a, b) => b.score - a.score)
  const avgScorePct = analytics.total_questions > 0 && analytics.avg_score != null
    ? Math.round((analytics.avg_score / analytics.total_questions) * 100)
    : null
  const struggling = participants.filter((p) => p.score === 0 && p.answered_count > 0)

  const handleExport = () => {
    setExporting(true)
    const a = document.createElement('a')
    a.href = `/api/teacher/sessions/${session.id}/export`
    a.download = `session-${session.join_code}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => setExporting(false), 1500)
  }

  const byQuiz = new Map<string, { title: string; qs: QuestionResult[] }>()
  questions.forEach((q) => {
    const g = byQuiz.get(q.quiz_id) ?? { title: q.quiz_title, qs: [] }
    g.qs.push(q)
    byQuiz.set(q.quiz_id, g)
  })

  return (
    <DashboardLayout navItems={TEACHER_NAV} profile={profile}>
      <div className="max-w-6xl space-y-8">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Link href="/teacher/sessions" className="mt-1 rounded-lg border border-gray-200 p-1.5 text-gray-500 transition hover:text-gray-700 hover:border-gray-300">
              <ArrowLeft className="size-4" />
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Session Results</p>
              <h1 className="mt-0.5 text-2xl font-bold text-gray-900">{session.title}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                <span className="font-mono font-bold tracking-widest text-violet-600">{session.join_code}</span>
                {session.ended_at && (
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    {new Date(session.ended_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Target className="size-3" />
                  {formatDuration(session.started_at, session.ended_at)}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex shrink-0 items-center gap-2 rounded-xl border border-gray-200 bg-white shadow-sm px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:border-violet-300 hover:text-violet-600 disabled:opacity-40"
          >
            <Download className="size-4" />
            {exporting ? 'Preparing…' : 'Export CSV'}
          </button>
        </motion.div>

        {/* Performance summary */}
        {session.ai_summary && (
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.02 }}
            className="rounded-2xl border border-violet-200 bg-violet-50 p-5"
          >
            <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-violet-600">
              <Sparkles className="size-3.5" /> Performance Summary
            </p>
            <ul className="space-y-1.5">
              {session.ai_summary.split('\n').map((line, i) => {
                const text = line.replace(/^[-•]\s*/, '').trim()
                if (!text) return null
                return (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-800">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-violet-400" />
                    {text}
                  </li>
                )
              })}
            </ul>
          </motion.div>
        )}

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}
          className="grid grid-cols-2 gap-4 sm:grid-cols-4"
        >
          <StatCard label="Participants" value={analytics.participant_count}
            sub={`${analytics.total_questions} question${analytics.total_questions !== 1 ? 's' : ''}`} colour="violet" />
          <StatCard label="Avg Score"
            value={avgScorePct != null ? `${avgScorePct}%` : '—'}
            sub={analytics.avg_score != null ? `${analytics.avg_score.toFixed(1)} / ${analytics.total_questions}` : 'No data'} colour="emerald" />
          <StatCard label="Participation" value={fmtPct(analytics.participation_rate)}
            sub="Answered ≥1 question" colour="sky" />
          <StatCard label="Completion" value={fmtPct(analytics.completion_rate)}
            sub="Avg % of questions" colour="amber" />
        </motion.div>

        {/* Struggling students banner */}
        {struggling.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
            <AlertTriangle className="size-4 shrink-0 mt-0.5 text-amber-500" />
            <div>
              <p className="text-sm font-semibold text-amber-800">
                {struggling.length} student{struggling.length !== 1 ? 's' : ''} scored 0 — may need support
              </p>
              <p className="mt-0.5 text-xs text-amber-600">
                {struggling.map((p) => p.display_name).join(', ')}
              </p>
            </div>
          </motion.div>
        )}

        {/* Tabs */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07 }}>
          <div className="flex gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1 w-fit mb-6">
            {(['questions', 'students'] as const).map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`rounded-lg px-5 py-2 text-sm font-semibold transition ${activeTab === tab ? 'bg-white text-violet-700 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}>
                {tab === 'questions'
                  ? <span className="flex items-center gap-1.5"><BookOpen className="size-3.5" /> Questions</span>
                  : <span className="flex items-center gap-1.5"><Users className="size-3.5" /> Students</span>}
              </button>
            ))}
          </div>

          {/* ── Questions tab ─────────────────────────────────── */}
          {activeTab === 'questions' && (
            <div className="space-y-5">
              {questions.length === 0 ? (
                <div className="rounded-2xl border border-gray-100 bg-white shadow-sm py-16 text-center">
                  <BookOpen className="mx-auto size-8 text-gray-200 mb-3" />
                  <p className="text-sm text-gray-500">No questions in this session</p>
                </div>
              ) : (
                Array.from(byQuiz.entries()).map(([qid, group]) => (
                  <div key={qid} className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
                    <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100 bg-gray-50">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-100 ring-1 ring-violet-200">
                        <BookOpen className="size-4 text-violet-600" />
                      </span>
                      <p className="text-sm font-semibold text-gray-800">{group.title}</p>
                      <span className="ml-auto text-xs text-gray-500">{group.qs.length} q</span>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {group.qs.map((q) => (
                        <div key={q.id} className="px-5 py-4 space-y-3">
                          <div className="flex items-start gap-3">
                            <span className="shrink-0 mt-0.5 flex h-6 w-8 items-center justify-center rounded-md bg-gray-100 text-xs font-bold text-gray-500">
                              {q.label}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 leading-relaxed">{q.text}</p>
                              <p className="mt-0.5 text-xs text-gray-500">
                                Answer: <span className="text-emerald-700 font-medium">{q.correct_answer}</span>
                              </p>
                            </div>
                            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                              q.pct_correct >= 75 ? 'bg-emerald-100 text-emerald-700' :
                              q.pct_correct >= 50 ? 'bg-amber-100 text-amber-700' :
                              'bg-red-100 text-red-700'
                            }`}>{q.pct_correct}%</span>
                          </div>
                          <div className="grid grid-cols-3 gap-3 pl-11">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="size-3" /> Correct</div>
                              <HorizBar value={q.correct_count} total={analytics.participant_count} cls="bg-emerald-500" />
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-center gap-1 text-xs text-red-600"><XCircle className="size-3" /> Wrong</div>
                              <HorizBar value={q.incorrect_count} total={analytics.participant_count} cls="bg-red-500" />
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-center gap-1 text-xs text-gray-500"><Minus className="size-3" /> No answer</div>
                              <HorizBar value={q.no_answer_count} total={analytics.participant_count} cls="bg-gray-300" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}

              {visItems.length > 0 && (
                <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">Charts shown</p>
                  <div className="space-y-2">
                    {visItems.map((v) => (
                      <div key={v.id} className="flex items-center gap-2.5 text-sm text-gray-600">
                        <BarChart2 className="size-3.5 text-sky-500 shrink-0" />
                        {v.title}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Students tab ──────────────────────────────────── */}
          {activeTab === 'students' && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
                {sorted.length === 0 ? (
                  <div className="py-16 text-center">
                    <Users className="mx-auto size-8 text-gray-200 mb-3" />
                    <p className="text-sm text-gray-500">No students joined</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50">
                          <th className="py-3 pl-5 pr-2 text-left text-xs font-semibold uppercase tracking-widest text-gray-500 w-10">#</th>
                          <th className="py-3 px-3 text-left text-xs font-semibold uppercase tracking-widest text-gray-500">Student</th>
                          {questions.map((q) => (
                            <th key={q.id} title={q.text}
                              className="py-3 px-2 text-center text-xs font-semibold uppercase tracking-widest text-gray-500 min-w-[2.5rem]">
                              {q.label}
                            </th>
                          ))}
                          <th className="py-3 px-3 text-right text-xs font-semibold uppercase tracking-widest text-gray-500">Score</th>
                          <th className="py-3 pl-3 pr-5 text-right text-xs font-semibold uppercase tracking-widest text-gray-500">%</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {sorted.map((p, rank) => (
                          <tr key={p.id} className="hover:bg-violet-50/40 transition">
                            <td className="py-3 pl-5 pr-2">
                              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                                rank === 0 ? 'bg-amber-100 text-amber-700' :
                                rank === 1 ? 'bg-gray-100 text-gray-500' :
                                rank === 2 ? 'bg-orange-100 text-orange-700' :
                                'bg-gray-100 text-gray-500'
                              }`}>
                                {rank < 3 ? <Trophy className="size-3" /> : rank + 1}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <p className="font-medium text-gray-800">{p.display_name}</p>
                              {p.email && <p className="text-xs text-gray-500">{p.email}</p>}
                            </td>
                            {questions.map((q) => {
                              const r = p.responses[q.id]
                              return (
                                <td key={q.id} className="py-3 px-2 text-center" title={r?.answer ?? 'No answer'}>
                                  {!r ? (
                                    <Minus className="size-3.5 text-gray-300 mx-auto" />
                                  ) : r.is_correct === true ? (
                                    <CheckCircle2 className="size-3.5 text-emerald-500 mx-auto" />
                                  ) : r.is_correct === false ? (
                                    <XCircle className="size-3.5 text-red-500 mx-auto" />
                                  ) : (
                                    <span className="text-xs text-gray-500">?</span>
                                  )}
                                </td>
                              )
                            })}
                            <td className="py-3 px-3 text-right font-mono font-bold text-gray-800">
                              {p.correct_count}/{questions.length}
                            </td>
                            <td className="py-3 pl-3 pr-5 text-right">
                              <span className={`font-bold ${p.pct_correct >= 75 ? 'text-emerald-700' : p.pct_correct >= 50 ? 'text-amber-700' : 'text-red-600'}`}>
                                {p.pct_correct}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </motion.div>

        {/* Discussion notes */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500 flex items-center gap-2">
            <MessageSquare className="size-3.5" /> Discussion Notes
          </h2>
          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5 space-y-3">
            <p className="text-xs text-gray-500">Capture talking points or follow-up actions from this session.</p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="e.g. Most students struggled with Q3 — revisit scatter plots next lesson…"
              className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:border-violet-400 focus:outline-none focus:bg-white transition"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  if (notes.trim()) {
                    localStorage.setItem(`playdata_notes_${session.id}`, notes)
                    toast.success('Notes saved locally')
                  }
                }}
                className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500"
              >
                Save notes
              </button>
              <p className="text-xs text-gray-500">Saved in your browser only.</p>
            </div>
          </div>
        </motion.div>

        {/* Footer */}
        <div className="flex items-center justify-between pb-8">
          <Link href="/teacher/sessions" className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white shadow-sm px-5 py-2.5 text-sm font-medium text-gray-600 transition hover:border-violet-300 hover:text-violet-600">
            <ArrowLeft className="size-4" /> All sessions
          </Link>
          <Link href="/teacher/analytics" className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500">
            View analytics
          </Link>
        </div>

        {analytics.computed_at && (
          <p className="text-xs text-gray-300">
            Analytics computed {new Date(analytics.computed_at).toLocaleString('en-GB')}
          </p>
        )}
      </div>
    </DashboardLayout>
  )
}
