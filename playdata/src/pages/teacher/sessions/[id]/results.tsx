import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Trophy, Users, BookOpen,
  BarChart2, ArrowLeft, Clock, Target, MessageSquare,
} from 'lucide-react'
import { toast } from 'sonner'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { TEACHER_NAV } from '@/lib/teacher-nav'
import { withAuth } from '@/lib/auth'
import { createClientFromContext } from '@/lib/supabase/server-props'
import { GetServerSidePropsResult } from 'next'

interface Profile {
  id: string
  full_name: string
  email: string
  role: string
}

interface Props {
  profile: Profile
  sessionId: string
}

interface QuizQuestion {
  id: string
  text: string
  type: string
  options: string[] | null
  correct_answer: string
  order_index: number
}

interface SessionItemResult {
  id: string
  type: string
  order_index: number
  title: string
  questions: QuizQuestion[]
}

interface Participant {
  id: string
  student_id: string
  score: number
  joined_at: string
  left_at: string | null
  profiles: { full_name: string; email: string } | { full_name: string; email: string }[] | null
}

interface Response {
  id: string
  question_id: string
  student_id: string
  answer: string
  is_correct: boolean | null
  submitted_at: string
}

interface SessionData {
  id: string
  title: string
  join_code: string
  status: string
  started_at: string | null
  ended_at: string | null
}

function profileName(p: Participant): string {
  if (!p.profiles) return 'Student'
  if (Array.isArray(p.profiles)) return p.profiles[0]?.full_name ?? 'Student'
  return (p.profiles as { full_name: string }).full_name ?? 'Student'
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
    return { props: { profile, sessionId } }
  },
  { allowedRoles: ['teacher'] }
)

// ── Bar chart for question responses ──────────────────────────────────────────
function ResponseBar({ label, correct, total }: { label: string; correct: number; total: number }) {
  const pct = total > 0 ? (correct / total) * 100 : 0
  const isGood = pct >= 70
  const isMid = pct >= 40

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[#8d8da0] truncate max-w-[70%]">{label}</span>
        <span className={`font-semibold ${isGood ? 'text-emerald-400' : isMid ? 'text-amber-400' : 'text-red-400'}`}>
          {Math.round(pct)}%
        </span>
      </div>
      <div className="h-2 rounded-full bg-[#252538] overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className={`h-full rounded-full ${isGood ? 'bg-emerald-500' : isMid ? 'bg-amber-500' : 'bg-red-500'}`}
        />
      </div>
      <p className="text-xs text-[#4a4a5a]">{correct} / {total} correct</p>
    </div>
  )
}

const NAV_ITEMS = TEACHER_NAV

export default function SessionResults({ profile, sessionId }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<SessionData | null>(null)
  const [items, setItems] = useState<SessionItemResult[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [responses, setResponses] = useState<Response[]>([])
  const [discussionNotes, setDiscussionNotes] = useState('')

  useEffect(() => {
    fetch(`/api/teacher/sessions/${sessionId}/results`)
      .then((r) => r.json())
      .then((data) => {
        setSession(data.session)
        setItems(data.items ?? [])
        setParticipants(data.participants ?? [])
        setResponses(data.responses ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [sessionId])

  if (loading) {
    return (
      <DashboardLayout navItems={NAV_ITEMS} profile={profile}>
        <div className="flex items-center justify-center h-64">
          <p className="text-[#8d8da0]">Loading results…</p>
        </div>
      </DashboardLayout>
    )
  }

  if (!session) {
    return (
      <DashboardLayout navItems={NAV_ITEMS} profile={profile}>
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <p className="text-[#8d8da0]">Session not found.</p>
          <Link href="/teacher/sessions" className="text-violet-400 hover:text-violet-300 text-sm">Back to sessions</Link>
        </div>
      </DashboardLayout>
    )
  }

  // Compute stats
  const totalParticipants = participants.length
  const avgScore = totalParticipants > 0
    ? Math.round(participants.reduce((s, p) => s + p.score, 0) / totalParticipants)
    : 0
  const totalResponses = responses.length
  const totalCorrect = responses.filter((r) => r.is_correct === true).length
  const overallAccuracy = totalResponses > 0 ? Math.round((totalCorrect / totalResponses) * 100) : 0

  const durationMs = session.started_at && session.ended_at
    ? new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()
    : null
  const durationMins = durationMs ? Math.round(durationMs / 60000) : null

  // Build question-level stats from all quiz items
  const allQuestions: (QuizQuestion & { quizTitle: string })[] = []
  items.forEach((item) => {
    if (item.type === 'quiz') {
      item.questions.forEach((q) => allQuestions.push({ ...q, quizTitle: item.title }))
    }
  })

  const questionStats = allQuestions.map((q) => {
    const qResponses = responses.filter((r) => r.question_id === q.id)
    const correct = qResponses.filter((r) => r.is_correct === true).length
    return { ...q, total: qResponses.length, correct }
  })

  return (
    <DashboardLayout navItems={NAV_ITEMS} profile={profile}>
      <div className="max-w-6xl space-y-8">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-4">
          <Link href="/teacher/sessions" className="mt-1 rounded-lg border border-[#35354a] p-1.5 text-[#6a6a80] hover:text-white transition">
            <ArrowLeft className="size-4" />
          </Link>
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#6a6a80]">Session Results</p>
            <h1 className="mt-0.5 text-2xl font-bold text-white">{session.title}</h1>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-[#6a6a80]">
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                {session.ended_at ? new Date(session.ended_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'In progress'}
              </span>
              {durationMins !== null && (
                <span className="flex items-center gap-1">
                  <Target className="size-3" />
                  {durationMins} min{durationMins !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        </motion.div>

        {/* Summary stats */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: 'Students', value: totalParticipants, icon: Users, colour: 'text-violet-400 bg-violet-500/10 ring-violet-500/20' },
              { label: 'Avg score', value: avgScore, icon: Trophy, colour: 'text-amber-400 bg-amber-500/10 ring-amber-500/20' },
              { label: 'Accuracy', value: `${overallAccuracy}%`, icon: Target, colour: 'text-emerald-400 bg-emerald-500/10 ring-emerald-500/20' },
              { label: 'Responses', value: totalResponses, icon: MessageSquare, colour: 'text-sky-400 bg-sky-500/10 ring-sky-500/20' },
            ].map(({ label, value, icon: Icon, colour }) => (
              <div key={label} className="rounded-2xl border border-[#35354a]/60 bg-[#11111f]/80 p-5">
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl ring-1 mb-4 ${colour}`}>
                  <Icon className="size-4" />
                </div>
                <p className="text-2xl font-bold text-white">{value}</p>
                <p className="text-sm text-[#6a6a80] mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </motion.div>

        <div className="grid grid-cols-5 gap-6">

          {/* Leaderboard */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }} className="col-span-2 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-[#6a6a80] flex items-center gap-2">
              <Trophy className="size-3.5 text-amber-400" /> Leaderboard
            </h2>
            <div className="rounded-2xl border border-[#35354a]/60 bg-[#11111f]/80 overflow-hidden divide-y divide-[#35354a]/30">
              {participants.length === 0 ? (
                <p className="py-8 text-center text-xs text-[#4a4a5a]">No students joined this session.</p>
              ) : (
                [...participants].sort((a, b) => b.score - a.score).map((p, rank) => (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + rank * 0.05 }}
                    className={`flex items-center gap-3 px-4 py-3 ${rank === 0 ? 'bg-amber-500/5' : ''}`}
                  >
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      rank === 0 ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30' :
                      rank === 1 ? 'bg-slate-500/20 text-slate-300 ring-1 ring-slate-500/30' :
                      rank === 2 ? 'bg-orange-700/20 text-orange-500 ring-1 ring-orange-700/30' :
                      'bg-[#252538] text-[#6a6a80]'
                    }`}>
                      {rank < 3 ? ['🥇', '🥈', '🥉'][rank] : rank + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white truncate">{profileName(p)}</p>
                    </div>
                    <span className={`text-base font-mono font-bold ${rank === 0 ? 'text-amber-400' : 'text-[#c9c9d4]'}`}>
                      {p.score}
                    </span>
                  </motion.div>
                ))
              )}
            </div>
          </motion.div>

          {/* Question breakdown */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="col-span-3 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-[#6a6a80] flex items-center gap-2">
              <BookOpen className="size-3.5" /> Question Breakdown
            </h2>
            <div className="rounded-2xl border border-[#35354a]/60 bg-[#11111f]/80 p-5 space-y-5">
              {questionStats.length === 0 ? (
                <p className="text-sm text-[#6a6a80]">No quiz questions were included in this session.</p>
              ) : (
                questionStats.map((q, i) => (
                  <div key={q.id} className="space-y-1.5">
                    <div className="flex items-start gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#252538] text-xs font-bold text-[#6a6a80] mt-0.5">
                        {i + 1}
                      </span>
                      <p className="text-xs font-medium text-[#c9c9d4] flex-1 leading-relaxed">{q.text}</p>
                    </div>
                    <div className="ml-7">
                      <ResponseBar
                        label={`${q.quizTitle}`}
                        correct={q.correct}
                        total={q.total}
                      />
                    </div>
                  </div>
                ))
              )}

              {/* Visualisation items summary */}
              {items.filter((i) => i.type === 'visualisation').length > 0 && (
                <div className="border-t border-[#35354a]/40 pt-4 mt-4">
                  <p className="text-xs text-[#6a6a80] mb-3 uppercase tracking-wider font-semibold">Charts shown</p>
                  {items.filter((i) => i.type === 'visualisation').map((item) => (
                    <div key={item.id} className="flex items-center gap-2 py-1.5">
                      <BarChart2 className="size-3.5 text-sky-400" />
                      <span className="text-xs text-[#c9c9d4]">{item.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* Discussion / Teacher notes */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-[#6a6a80] flex items-center gap-2">
            <MessageSquare className="size-3.5" /> Discussion Notes
          </h2>
          <div className="rounded-2xl border border-[#35354a]/60 bg-[#11111f]/80 p-5 space-y-3">
            <p className="text-xs text-[#6a6a80]">
              Capture talking points, student observations, or follow-up actions from this session.
            </p>
            <textarea
              value={discussionNotes}
              onChange={(e) => setDiscussionNotes(e.target.value)}
              placeholder="e.g. Most students struggled with Q3 — revisit scatter plot interpretation next lesson. Top scorer was 95 — consider enrichment tasks…"
              rows={5}
              className="w-full resize-none rounded-xl border border-[#35354a] bg-[#0d0d18] px-4 py-3 text-sm text-white placeholder-[#4a4a60] focus:border-violet-500/60 focus:outline-none"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  if (discussionNotes.trim()) {
                    const key = `playdata_discussion_${sessionId}`
                    localStorage.setItem(key, discussionNotes)
                    toast.success('Notes saved locally')
                  }
                }}
                className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500"
              >
                Save notes
              </button>
              <p className="text-xs text-[#4a4a60]">Notes are saved in your browser.</p>
            </div>
          </div>
        </motion.div>

        {/* Struggling students */}
        {participants.filter((p) => p.score === 0).length > 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-[#6a6a80]">
              Students who may need support
            </h2>
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
              <div className="flex flex-wrap gap-2">
                {participants.filter((p) => p.score === 0).map((p) => (
                  <span key={p.id} className="flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs text-amber-300">
                    {profileName(p)}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs text-[#8d8da0]">These students scored 0 — consider individual follow-up or additional practice.</p>
            </div>
          </motion.div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pb-8">
          <Link
            href="/teacher/sessions"
            className="flex items-center gap-2 rounded-xl border border-[#35354a] px-5 py-2.5 text-sm font-medium text-[#c9c9d4] transition hover:border-violet-500/40 hover:text-white"
          >
            <ArrowLeft className="size-4" /> All sessions
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/teacher/sessions/new"
              className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500"
            >
              New session
            </Link>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

