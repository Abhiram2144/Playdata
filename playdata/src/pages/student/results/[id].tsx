import { GetServerSideProps } from 'next'
import { useRouter } from 'next/router'
import { motion } from 'framer-motion'
import {
  LayoutDashboard, Trophy, Users, UserCircle,
  CheckCircle2, XCircle, Minus, ArrowLeft,
  BookOpen, Zap, Calendar, Target,
} from 'lucide-react'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { createClientFromContext } from '@/lib/supabase/server-props'
import { createAdminClient } from '@/lib/supabase/admin'
import type { NavItem } from '@/components/layout/Sidebar'
import type { QuestionResult } from '@/pages/api/student/results/[id]'

interface SessionMeta {
  id: string
  title: string
  status: string
  started_at: string | null
  ended_at: string | null
}

interface Props {
  profile: { id: string; full_name: string; email: string; role: string }
  session: SessionMeta
  score: number
  total_questions: number
  correct_count: number
  questions: QuestionResult[]
}

// ── Re-use the same server-side logic as the API route ─────────────────────────

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

  const sessionId = context.params?.id as string
  const proto = context.req.headers['x-forwarded-proto'] ?? 'http'
  const host = context.req.headers.host
  const base = `${proto}://${host}`

  const res = await fetch(`${base}/api/student/results/${sessionId}`, {
    headers: { cookie: context.req.headers.cookie ?? '' },
  })

  if (res.status === 403 || res.status === 404) {
    return { redirect: { destination: '/student/results', permanent: false } }
  }
  if (!res.ok) return { redirect: { destination: '/student/results', permanent: false } }

  const data = await res.json()

  return {
    props: {
      profile,
      session: data.session,
      score: data.score,
      total_questions: data.total_questions,
      correct_count: data.correct_count,
      questions: data.questions,
    },
  }
}

const NAV_ITEMS: NavItem[] = [
  { href: '/student/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/student/join', label: 'Join Session', icon: Users },
  { href: '/student/results', label: 'My Results', icon: Trophy },
  { href: '/profile', label: 'Profile', icon: UserCircle },
]

// ── Question card ──────────────────────────────────────────────────────────────

function QuestionCard({ q, index }: { q: QuestionResult; index: number }) {
  const notAnswered = q.student_answer === null

  const statusIcon = notAnswered
    ? <Minus className="size-4 text-gray-400" />
    : q.is_correct === true
      ? <CheckCircle2 className="size-4 text-emerald-500" />
      : <XCircle className="size-4 text-red-500" />

  const statusLabel = notAnswered
    ? 'Not answered'
    : q.is_correct === true
      ? 'Correct'
      : 'Incorrect'

  const statusClasses = notAnswered
    ? 'bg-gray-100 text-gray-500 ring-gray-200'
    : q.is_correct === true
      ? 'bg-emerald-100 text-emerald-700 ring-emerald-200'
      : 'bg-red-100 text-red-700 ring-red-200'

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.02 * index }}
      className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-400">Q{index + 1}</span>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${
            q.type === 'mcq' ? 'bg-violet-100 text-violet-700 ring-violet-200' :
            q.type === 'numerical' ? 'bg-sky-100 text-sky-700 ring-sky-200' :
            'bg-amber-100 text-amber-700 ring-amber-200'
          }`}>
            {q.type === 'mcq' ? 'MCQ' : q.type === 'numerical' ? 'Numerical' : 'Short answer'}
          </span>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusClasses}`}>
          {statusIcon}
          {statusLabel}
        </span>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Question text */}
        <p className="text-sm font-semibold text-gray-800 leading-relaxed">{q.text}</p>

        {/* MCQ options */}
        {q.type === 'mcq' && Array.isArray(q.options) && (
          <div className="grid grid-cols-1 gap-2">
            {q.options.map((opt) => {
              const isStudentChoice = opt === q.student_answer
              const isCorrectOpt = opt === q.correct_answer

              let classes = 'rounded-xl border px-4 py-2.5 text-sm font-medium flex items-center justify-between gap-3 '
              if (isCorrectOpt && isStudentChoice) {
                // student chose the right answer
                classes += 'border-emerald-300 bg-emerald-50 text-emerald-800'
              } else if (isCorrectOpt && !isStudentChoice) {
                // correct answer student didn't pick
                classes += 'border-emerald-200 bg-emerald-50/60 text-emerald-700'
              } else if (isStudentChoice && !isCorrectOpt) {
                // student's wrong choice
                classes += 'border-red-300 bg-red-50 text-red-800'
              } else {
                // neutral
                classes += 'border-gray-100 bg-gray-50 text-gray-400'
              }

              return (
                <div key={opt} className={classes}>
                  <span>{opt}</span>
                  <span className="shrink-0 flex items-center gap-1">
                    {isCorrectOpt && (
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 rounded-full px-2 py-0.5">
                        correct
                      </span>
                    )}
                    {isStudentChoice && !isCorrectOpt && (
                      <span className="text-[10px] font-bold text-red-600 bg-red-100 rounded-full px-2 py-0.5">
                        your answer
                      </span>
                    )}
                    {isStudentChoice && isCorrectOpt && (
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 rounded-full px-2 py-0.5">
                        your answer ✓
                      </span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* Short answer / Numerical */}
        {(q.type === 'short_answer' || q.type === 'numerical') && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className={`rounded-xl border px-4 py-3 ${
              notAnswered ? 'border-gray-100 bg-gray-50' :
              q.is_correct === true ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
            }`}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Your answer</p>
              <p className={`text-sm font-semibold ${
                notAnswered ? 'text-gray-400 italic' :
                q.is_correct === true ? 'text-emerald-700' : 'text-red-700'
              }`}>
                {q.student_answer ?? 'Not answered'}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Correct answer</p>
              <p className="text-sm font-semibold text-emerald-700">{q.correct_answer}</p>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SessionResultDetail({
  profile, session, score, total_questions, correct_count, questions,
}: Props) {
  const router = useRouter()

  const accuracy = total_questions > 0
    ? Math.round((correct_count / total_questions) * 100)
    : null

  const dateStr = (session.ended_at ?? session.started_at)
    ? new Date((session.ended_at ?? session.started_at)!).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    : '—'

  const incorrectCount = questions.filter((q) => q.is_correct === false).length
  const skippedCount = questions.filter((q) => q.student_answer === null).length

  // Group questions by their group (quiz or standalone)
  const groups: { title: string; order: number; questions: QuestionResult[] }[] = []
  const groupMap = new Map<string, typeof groups[0]>()

  for (const q of questions) {
    const key = `${q.group_order}-${q.group_title}`
    if (!groupMap.has(key)) {
      const g = { title: q.group_title, order: q.group_order, questions: [] as QuestionResult[] }
      groupMap.set(key, g)
      groups.push(g)
    }
    groupMap.get(key)!.questions.push(q)
  }

  groups.sort((a, b) => a.order - b.order)

  return (
    <DashboardLayout navItems={NAV_ITEMS} profile={profile}>
      <div className="max-w-3xl space-y-8">

        {/* Back */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={() => router.push('/student/results')}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-violet-600 transition-colors"
        >
          <ArrowLeft className="size-3.5" /> Back to Results
        </motion.button>

        {/* Session header */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="relative overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-purple-50 to-indigo-50 p-7 shadow-sm"
        >
          <div className="absolute -right-8 -top-8 h-48 w-48 rounded-full bg-violet-200/40 blur-3xl pointer-events-none" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="size-3.5 text-violet-600" />
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-violet-600">Session Review</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">{session.title}</h1>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Calendar className="size-3.5" />
              <span>{dateStr}</span>
            </div>
          </div>
        </motion.div>

        {/* Stats row */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 gap-4 sm:grid-cols-4"
        >
          {[
            { label: 'Score', value: score.toString(), icon: Trophy, bg: 'bg-amber-100 ring-amber-200', color: 'text-amber-600', text: 'text-amber-700' },
            { label: 'Correct', value: correct_count.toString(), icon: CheckCircle2, bg: 'bg-emerald-100 ring-emerald-200', color: 'text-emerald-600', text: 'text-emerald-700' },
            { label: 'Incorrect', value: incorrectCount.toString(), icon: XCircle, bg: 'bg-red-100 ring-red-200', color: 'text-red-500', text: 'text-red-600' },
            { label: 'Accuracy', value: accuracy !== null ? `${accuracy}%` : '—', icon: Target, bg: 'bg-violet-100 ring-violet-200', color: 'text-violet-600', text: 'text-violet-700' },
          ].map(({ label, value, icon: Icon, bg, color }) => (
            <div key={label} className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ring-1 ${bg} mb-3`}>
                <Icon className={`size-4 ${color}`} />
              </div>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              <p className="mt-1 text-xs text-gray-400">{label}</p>
            </div>
          ))}
        </motion.div>

        {/* Skipped notice */}
        {skippedCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14 }}
            className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3"
          >
            <Minus className="size-4 text-gray-400 shrink-0" />
            <p className="text-sm text-gray-500">
              <span className="font-semibold text-gray-700">{skippedCount}</span> question{skippedCount !== 1 ? 's' : ''} not answered
            </p>
          </motion.div>
        )}

        {/* Question groups */}
        {total_questions === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 py-16 gap-4"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 ring-1 ring-gray-200">
              <Zap className="size-6 text-gray-400" />
            </div>
            <p className="text-sm text-gray-500">This session had no questions to review.</p>
          </motion.div>
        ) : (
          groups.map((group, gi) => {
            let globalIdx = groups.slice(0, gi).reduce((sum, g) => sum + g.questions.length, 0)
            return (
              <motion.div
                key={`${group.order}-${group.title}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + gi * 0.04 }}
              >
                {/* Group header */}
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 ring-1 ring-violet-200">
                    <BookOpen className="size-3.5 text-violet-600" />
                  </div>
                  <h2 className="text-sm font-bold text-gray-800">{group.title}</h2>
                  <span className="text-xs text-gray-400">
                    ({group.questions.filter(q => q.is_correct === true).length}/{group.questions.length} correct)
                  </span>
                </div>

                <div className="space-y-3">
                  {group.questions.map((q) => {
                    const cardIdx = globalIdx++
                    return <QuestionCard key={q.id} q={q} index={cardIdx} />
                  })}
                </div>
              </motion.div>
            )
          })
        )}

      </div>
    </DashboardLayout>
  )
}
