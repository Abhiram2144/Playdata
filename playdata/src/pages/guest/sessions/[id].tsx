import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Radio, Trophy, Clock, ChevronLeft, ChevronRight,
  CheckCircle2, XCircle, BarChart2, BookOpen, Zap,
  Send, Loader2, PieChart as PieIcon, TrendingUp,
  Maximize2, AlignLeft, ChevronDown, ChevronUp, UserCircle,
} from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { io as ioClient, Socket } from 'socket.io-client'
import { toast } from 'sonner'

// ── Types ────────────────────────────────────────────────────────────────────

type ChartType = 'bar' | 'line' | 'pie' | 'scatter' | 'histogram'

interface VizConfig {
  title?: string
  xAxis?: string
  yAxis?: string
  aggregation?: string
  filterColumn?: string
  filterOperator?: string
  filterValue?: string
}

interface QuizQuestionVis {
  id: string
  name: string
  chart_type: ChartType
  config: VizConfig
  dataset_id: string | null
}

interface QuizQuestion {
  id: string
  text: string
  type: 'mcq' | 'short_answer' | 'numerical'
  options: string[] | null
  correct_answer: string
  time_limit_secs: number
  order_index: number
  visualisation_ids: string[]
  visualisations: QuizQuestionVis[]
}

interface SessionItem {
  id: string
  type: 'visualisation' | 'quiz' | 'question'
  reference_id: string
  order_index: number
  title: string
  chart_type?: ChartType
  config?: VizConfig
  dataset_id?: string | null
  quizQuestions?: QuizQuestion[]
  allow_student_charts?: boolean
  question_type?: string
  options?: string[] | null
  correct_answer?: string
  time_limit_secs?: number
}

interface MyResponse {
  id: string
  question_id: string
  answer: string
  is_correct: boolean | null
  submitted_at: string
}

interface Session {
  id: string
  title: string
  join_code: string
  status: 'waiting' | 'active' | 'ended'
  current_item: number | null
}

// ── Chart constants ───────────────────────────────────────────────────────────

const VIZ_COLORS = ['#7c3aed', '#a78bfa', '#6d28d9', '#c4b5fd', '#8b5cf6', '#4c1d95', '#ddd6fe']
const TOOLTIP_STYLE = {
  backgroundColor: '#ffffff', border: '1px solid #e4e0f8', borderRadius: '12px',
  color: '#374151', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
}
const AXIS_STYLE = { fill: '#9ca3af', fontSize: 11 }
const CHART_TYPES: ChartType[] = ['bar', 'line', 'pie', 'scatter', 'histogram']
const CHART_LABELS: Record<ChartType, string> = { bar: 'Bar', line: 'Line', pie: 'Pie', scatter: 'Scatter', histogram: 'Histogram' }
const CHART_ICONS: Record<ChartType, React.ReactNode> = {
  bar: <BarChart2 className="size-3.5" />,
  line: <TrendingUp className="size-3.5" />,
  pie: <PieIcon className="size-3.5" />,
  scatter: <Maximize2 className="size-3.5" />,
  histogram: <AlignLeft className="size-3.5" />,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function smartParseNumber(v: unknown): number {
  if (typeof v === 'number') return v
  return parseFloat(String(v ?? '').trim().replace(/[$£€%,]/g, ''))
}

type FilterOp = '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains'

function applyFilter(rows: Record<string, unknown>[], col: string, op: FilterOp, val: string) {
  if (!col || !val) return rows
  return rows.filter((r) => {
    const v = String(r[col] ?? '')
    switch (op) {
      case '==': return v === val
      case '!=': return v !== val
      case '>': return smartParseNumber(v) > smartParseNumber(val)
      case '<': return smartParseNumber(v) < smartParseNumber(val)
      case '>=': return smartParseNumber(v) >= smartParseNumber(val)
      case '<=': return smartParseNumber(v) <= smartParseNumber(val)
      case 'contains': return v.toLowerCase().includes(val.toLowerCase())
      default: return true
    }
  })
}

function aggregate(rows: Record<string, unknown>[], xKey: string, yKey: string, method: string) {
  const groups = new Map<string, number[]>()
  rows.forEach((r) => {
    const xVal = String(r[xKey] ?? '')
    const yNum = smartParseNumber(r[yKey])
    if (!isNaN(yNum)) {
      const arr = groups.get(xVal) ?? []
      arr.push(yNum)
      groups.set(xVal, arr)
    }
  })
  return [...groups.entries()].map(([name, vals]) => {
    let value: number
    if (method === 'sum') value = vals.reduce((a, b) => a + b, 0)
    else if (method === 'count') value = vals.length
    else value = vals.reduce((a, b) => a + b, 0) / vals.length
    return { name, value: parseFloat(value.toFixed(3)) }
  })
}

// ── ChartRenderer ─────────────────────────────────────────────────────────────

function ChartRenderer({ chartType, config, rows }: { chartType: ChartType; config: VizConfig; rows: Record<string, unknown>[] }) {
  const { xAxis = '', yAxis = '', aggregation = 'mean', filterColumn = '', filterOperator = '==', filterValue = '' } = config
  const filtered = filterColumn ? applyFilter(rows, filterColumn, filterOperator as FilterOp, filterValue) : rows

  if (chartType === 'scatter') {
    const pts = filtered.map((r) => ({ x: smartParseNumber(r[xAxis]), y: smartParseNumber(r[yAxis]) })).filter((p) => !isNaN(p.x) && !isNaN(p.y))
    return (
      <ResponsiveContainer width="100%" height={240}>
        <ScatterChart>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f0ff" />
          <XAxis dataKey="x" name={xAxis} tick={AXIS_STYLE} axisLine={false} tickLine={false} />
          <YAxis dataKey="y" name={yAxis} tick={AXIS_STYLE} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ strokeDasharray: '3 3' }} />
          <Scatter data={pts} fill="#7c3aed" />
        </ScatterChart>
      </ResponsiveContainer>
    )
  }

  if (chartType === 'histogram') {
    const vals = filtered.map((r) => smartParseNumber(r[xAxis])).filter((v) => !isNaN(v))
    if (vals.length === 0) return <div className="flex h-48 items-center justify-center text-xs text-gray-400">No numeric data</div>
    const min = Math.min(...vals), max = Math.max(...vals), bins = 10, binW = (max - min) / bins || 1
    const counts = Array.from({ length: bins }, (_, i) => ({
      name: `${(min + i * binW).toFixed(1)}`,
      count: vals.filter((v) => v >= min + i * binW && (i === bins - 1 ? v <= min + (i + 1) * binW : v < min + (i + 1) * binW)).length,
    }))
    return (
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={counts}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f0ff" vertical={false} />
          <XAxis dataKey="name" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="count" fill="#7c3aed" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    )
  }

  if (chartType === 'pie') {
    const pieData = yAxis
      ? aggregate(filtered, xAxis, yAxis, aggregation)
      : [...filtered.reduce((m, r) => { const k = String(r[xAxis] ?? ''); m.set(k, (m.get(k) ?? 0) + 1); return m }, new Map<string, number>()).entries()].map(([name, value]) => ({ name, value }))
    return (
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
            {pieData.map((_, i) => <Cell key={i} fill={VIZ_COLORS[i % VIZ_COLORS.length]} />)}
          </Pie>
          <Tooltip contentStyle={TOOLTIP_STYLE} />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  const aggData = xAxis && yAxis ? aggregate(filtered, xAxis, yAxis, aggregation) : []
  if (chartType === 'line') {
    return (
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={aggData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f0ff" vertical={false} />
          <XAxis dataKey="name" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Line type="monotone" dataKey="value" stroke="#7c3aed" strokeWidth={2} dot={{ fill: '#7c3aed', r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={aggData} barCategoryGap="30%">
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f0ff" vertical={false} />
        <XAxis dataKey="name" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend />
        <Bar dataKey="value" fill="#7c3aed" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── VisPanel ──────────────────────────────────────────────────────────────────

function VisPanel({ item, sessionId, guestToken }: { item: SessionItem; sessionId: string; guestToken: string }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [selectedType, setSelectedType] = useState<ChartType>(item.chart_type ?? 'bar')
  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!item.dataset_id) return
    setLoading(true); setError(null)
    fetch(`/api/guest/sessions/${sessionId}/vis-rows?vis_id=${item.reference_id}&guest_token=${guestToken}`)
      .then((r) => r.json())
      .then((data) => { if (data.rows) setRows(data.rows); else setError('Failed to load chart data') })
      .catch(() => setError('Failed to load chart data'))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.reference_id, sessionId])

  const config = item.config ?? {}
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {CHART_TYPES.map((ct) => (
          <button key={ct} onClick={() => setSelectedType(ct)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition border ${selectedType === ct ? 'bg-violet-600 text-white border-violet-600 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-violet-300 hover:text-violet-600'}`}>
            {CHART_ICONS[ct]}{CHART_LABELS[ct]}
          </button>
        ))}
      </div>
      {!item.dataset_id ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50">
          <p className="text-sm text-gray-400">No dataset linked to this visualisation</p>
        </div>
      ) : loading ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-gray-100 bg-gray-50">
          <Loader2 className="size-5 animate-spin text-violet-500" />
        </div>
      ) : error ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-red-100 bg-red-50">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50">
          <p className="text-sm text-gray-400">No data available</p>
        </div>
      ) : mounted ? (
        <div className="rounded-xl border border-gray-100 bg-white p-4">
          {config.title && <p className="text-sm font-semibold text-gray-800 mb-3">{config.title}</p>}
          <ChartRenderer chartType={selectedType} config={config} rows={rows} />
        </div>
      ) : <div className="flex h-48 items-center justify-center"><Loader2 className="size-5 animate-spin text-violet-500" /></div>}
    </div>
  )
}

// ── QuizQuestionChart ─────────────────────────────────────────────────────────

function QuizQuestionChart({ vis, sessionId, guestToken }: { vis: QuizQuestionVis; sessionId: string; guestToken: string }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [selectedType, setSelectedType] = useState<ChartType>(vis.chart_type)
  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!vis.dataset_id) return
    setLoading(true); setError(null)
    fetch(`/api/guest/sessions/${sessionId}/vis-rows?vis_id=${vis.id}&guest_token=${guestToken}`)
      .then((r) => r.json())
      .then((data) => { if (data.rows) setRows(data.rows); else setError('Failed to load chart data') })
      .catch(() => setError('Failed to load chart data'))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vis.id, sessionId])

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-2">
          <BarChart2 className="size-3.5 text-sky-500" />
          <span className="text-xs font-semibold text-gray-700">{vis.name}</span>
        </div>
        <button onClick={() => setExpanded((v) => !v)} className="rounded-md p-1 text-gray-400 hover:text-gray-600 transition">
          {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>
      </div>
      {expanded && (
        <div className="p-4 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {CHART_TYPES.map((ct) => (
              <button key={ct} onClick={() => setSelectedType(ct)}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition border ${selectedType === ct ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-gray-500 border-gray-200 hover:border-violet-300 hover:text-violet-600'}`}>
                {CHART_ICONS[ct]}{CHART_LABELS[ct]}
              </button>
            ))}
          </div>
          {!vis.dataset_id ? (
            <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50">
              <p className="text-xs text-gray-400">No dataset linked</p>
            </div>
          ) : loading ? (
            <div className="flex h-48 items-center justify-center"><Loader2 className="size-5 animate-spin text-violet-500" /></div>
          ) : error ? (
            <div className="flex h-48 items-center justify-center rounded-xl border border-red-100 bg-red-50">
              <p className="text-xs text-red-500">{error}</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50">
              <p className="text-xs text-gray-400">No data available</p>
            </div>
          ) : mounted ? (
            <div className="rounded-xl border border-gray-100 bg-white p-3">
              <ChartRenderer chartType={selectedType} config={vis.config} rows={rows} />
            </div>
          ) : <div className="flex h-48 items-center justify-center"><Loader2 className="size-5 animate-spin text-violet-500" /></div>}
        </div>
      )}
    </div>
  )
}

// ── TimerBar ──────────────────────────────────────────────────────────────────

function TimerBar({ timeLeft, total }: { timeLeft: number; total: number }) {
  const pct = total > 0 ? Math.max(0, timeLeft / total) : 0
  const isLow = pct < 0.25, isMid = pct < 0.5
  return (
    <div className="flex items-center gap-3">
      <Clock className={`size-4 shrink-0 ${isLow ? 'text-red-400 animate-pulse' : isMid ? 'text-amber-400' : 'text-emerald-400'}`} />
      <div className="flex-1">
        <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden ring-1 ring-gray-200">
          <motion.div
            className={`h-full rounded-full transition-colors duration-300 ${isLow ? 'bg-red-500' : isMid ? 'bg-amber-500' : 'bg-emerald-500'}`}
            style={{ width: `${pct * 100}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </div>
      <span className={`text-sm font-mono font-bold w-8 text-right ${isLow ? 'text-red-400' : isMid ? 'text-amber-400' : 'text-emerald-400'}`}>
        {timeLeft}s
      </span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function GuestSession() {
  const router = useRouter()
  const sessionId = router.query.id as string | undefined
  const socketRef = useRef<Socket | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const guestTokenRef = useRef<string | null>(null)

  const [guestToken, setGuestToken] = useState<string | null>(null)
  const [guestName, setGuestName] = useState('')
  const [session, setSession] = useState<Session | null>(null)
  const [items, setItems] = useState<SessionItem[]>([])
  const [currentItemIdx, setCurrentItemIdx] = useState(0)
  const [myResponses, setMyResponses] = useState<MyResponse[]>([])
  const [score, setScore] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [quizQIdx, setQuizQIdx] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState('')
  const [textAnswer, setTextAnswer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  const [quizDismissed, setQuizDismissed] = useState(false)

  const sortedItems = [...items].sort((a, b) => a.order_index - b.order_index)
  const activeItem = sortedItems[currentItemIdx] ?? null
  const activeQuizQuestion: QuizQuestion | null =
    activeItem?.type === 'quiz' && activeItem.quizQuestions
      ? activeItem.quizQuestions[quizQIdx] ?? null
      : null
  const activeQuestionId =
    activeItem?.type === 'question' ? activeItem.reference_id : activeQuizQuestion?.id ?? null
  const myResponseForActive = activeQuestionId
    ? myResponses.find((r) => r.question_id === activeQuestionId) ?? null
    : null
  const alreadyAnswered = !!myResponseForActive

  const quizComplete =
    activeItem?.type === 'quiz' &&
    (activeItem.quizQuestions?.length ?? 0) > 0 &&
    (activeItem.quizQuestions ?? []).every((q) => myResponses.some((r) => r.question_id === q.id))

  // ── Load from localStorage + API ─────────────────────────────────────────────

  const loadSession = useCallback(async (sid: string, token: string) => {
    const res = await fetch(`/api/guest/sessions/${sid}?guest_token=${token}`)
    if (!res.ok) {
      const d = await res.json()
      setLoadError(d.error ?? 'Failed to load session')
      setLoading(false)
      return
    }
    const data = await res.json()
    setSession(data.session)
    setItems(data.items ?? [])
    setCurrentItemIdx(data.session.current_item ?? 0)
    setMyResponses(data.myResponses ?? [])
    setScore(data.participant?.score ?? 0)
    setGuestName(data.guestName ?? '')
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!sessionId) return
    const token = localStorage.getItem(`pd_guest_${sessionId}`)
    if (!token) {
      router.replace('/guest/join')
      return
    }
    guestTokenRef.current = token
    setGuestToken(token)
    loadSession(sessionId, token)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  // ── Timer ────────────────────────────────────────────────────────────────────

  const startTimer = useCallback((secs: number) => {
    if (timerRef.current) clearInterval(timerRef.current)
    setTimedOut(false)
    if (secs <= 0) { setTimeLeft(null); return }
    setTimeLeft(secs)
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 1) { clearInterval(timerRef.current!); setTimedOut(true); return 0 }
        return prev - 1
      })
    }, 1000)
  }, [])

  useEffect(() => {
    setQuizQIdx(0); setSelectedAnswer(''); setTextAnswer(''); setTimedOut(false); setQuizDismissed(false)
    if (timerRef.current) clearInterval(timerRef.current)
    setTimeLeft(null)
    if (activeItem?.type === 'quiz' && activeItem.quizQuestions?.[0]) startTimer(activeItem.quizQuestions[0].time_limit_secs)
    else if (activeItem?.type === 'question' && (activeItem.time_limit_secs ?? 0) > 0) startTimer(activeItem.time_limit_secs!)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentItemIdx])

  useEffect(() => {
    if (activeQuizQuestion) { setSelectedAnswer(''); setTextAnswer(''); setTimedOut(false); startTimer(activeQuizQuestion.time_limit_secs) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizQIdx, currentItemIdx])

  // ── Socket ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!sessionId) return
    fetch('/api/socket').then(() => {
      const socket = ioClient({ path: '/api/socket', transports: ['websocket', 'polling'] })
      socketRef.current = socket
      socket.on('connect', () => { socket.emit('join-session', sessionId) })
      socket.on('session:start', ({ currentItem }: { currentItem: number }) => {
        setCurrentItemIdx(currentItem)
        setSession((prev) => prev ? { ...prev, status: 'active', current_item: currentItem } : prev)
      })
      socket.on('session:advance', ({ currentItem }: { currentItem: number }) => {
        setCurrentItemIdx(currentItem)
        setSession((prev) => prev ? { ...prev, current_item: currentItem } : prev)
      })
      socket.on('session:end', () => {
        setSession((prev) => prev ? { ...prev, status: 'ended' } : prev)
        toast.success('Session ended by teacher')
      })
    })

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (socketRef.current) { socketRef.current.emit('leave-session', sessionId); socketRef.current.disconnect(); socketRef.current = null }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  // Polling fallback for session:start
  useEffect(() => {
    if (!sessionId || !guestToken || session?.status !== 'waiting') return
    const pollId = setInterval(async () => {
      const res = await fetch(`/api/guest/sessions/${sessionId}?guest_token=${guestToken}`)
      if (!res.ok) return
      const data = await res.json()
      if (data.session?.status === 'active') {
        setCurrentItemIdx(data.session.current_item ?? 0)
        setSession((prev) => prev ? { ...prev, status: 'active', current_item: data.session.current_item ?? 0 } : prev)
      }
    }, 3000)
    return () => clearInterval(pollId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.status, sessionId, guestToken])

  // ── Answer submission ────────────────────────────────────────────────────────

  const submitAnswer = async (questionId: string, answer: string) => {
    if (!answer.trim() || submitting || alreadyAnswered || !guestToken || !sessionId) return
    setSubmitting(true)
    const res = await fetch(`/api/guest/sessions/${sessionId}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guest_token: guestToken, question_id: questionId, answer }),
    })
    const data = await res.json()
    setSubmitting(false)
    if (res.ok || res.status === 409) {
      setMyResponses((prev) => [
        ...prev.filter((r) => r.question_id !== questionId),
        { id: data.id ?? questionId, question_id: questionId, answer, is_correct: data.is_correct ?? null, submitted_at: new Date().toISOString() },
      ])
      if (res.ok && typeof data.score === 'number') setScore(data.score)
    } else {
      toast.error(data.error ?? 'Failed to submit answer')
    }
  }

  const handleMcqSelect = (option: string) => {
    if (alreadyAnswered || timedOut) return
    setSelectedAnswer(option)
  }

  const handleTextSubmit = (questionId: string) => {
    const ans = textAnswer.trim()
    if (!ans || alreadyAnswered || timedOut) return
    submitAnswer(questionId, ans)
  }

  // ── Render helpers ───────────────────────────────────────────────────────────

  const renderQuestion = (
    questionId: string, questionText: string, questionType: string,
    options: string[] | null, timeLimitSecs: number,
    visualisations?: QuizQuestionVis[]
  ) => {
    const response = myResponses.find((r) => r.question_id === questionId) ?? null
    const submitted = !!response
    const isTimedOut = timedOut && !submitted
    return (
      <div className="space-y-4">
        {visualisations && visualisations.length > 0 && (
          <div className="space-y-3">
            {visualisations.map((vis) => (
              <QuizQuestionChart key={vis.id} vis={vis} sessionId={sessionId!} guestToken={guestToken!} />
            ))}
          </div>
        )}
        <p className="text-base font-semibold text-gray-900 leading-relaxed">{questionText}</p>
        {timeLimitSecs > 0 && timeLeft !== null && !submitted && <TimerBar timeLeft={timeLeft} total={timeLimitSecs} />}
        {timeLimitSecs <= 0 && <div className="flex items-center gap-1.5 text-xs text-gray-400"><Clock className="size-3" /> Untimed</div>}
        {isTimedOut && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">Time&apos;s up! No answer submitted.</div>}
        {submitted && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${response.is_correct === true ? 'border-emerald-200 bg-emerald-50' : response.is_correct === false ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
            {response.is_correct === true ? <CheckCircle2 className="size-5 text-emerald-500 shrink-0 mt-0.5" /> : response.is_correct === false ? <XCircle className="size-5 text-red-500 shrink-0 mt-0.5" /> : null}
            <div>
              <p className={`text-sm font-semibold ${response.is_correct === true ? 'text-emerald-700' : response.is_correct === false ? 'text-red-700' : 'text-gray-700'}`}>
                {response.is_correct === true ? 'Correct!' : response.is_correct === false ? 'Incorrect' : 'Submitted'}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Your answer: {response.answer}</p>
            </div>
          </motion.div>
        )}
        {!submitted && !isTimedOut && questionType === 'mcq' && Array.isArray(options) && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2.5">
              {options.map((opt) => (
                <button key={opt} onClick={() => handleMcqSelect(opt)} disabled={submitting}
                  className={`w-full rounded-xl border px-4 py-3 text-left text-sm font-medium transition shadow-sm disabled:opacity-50 ${selectedAnswer === opt ? 'border-violet-400 bg-violet-50 text-violet-700 ring-1 ring-violet-200' : 'border-gray-200 bg-white text-gray-700 hover:border-violet-300 hover:bg-violet-50'}`}>
                  {opt}
                </button>
              ))}
            </div>
            {selectedAnswer && (
              <button
                onClick={() => submitAnswer(questionId, selectedAnswer)}
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50 shadow-sm"
              >
                {submitting ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                Confirm Answer
              </button>
            )}
          </div>
        )}
        {submitted && questionType === 'mcq' && Array.isArray(options) && (
          <div className="grid grid-cols-1 gap-2">
            {options.map((opt) => (
              <div key={opt} className={`rounded-xl border px-4 py-2.5 text-sm font-medium ${opt === response?.answer && response?.is_correct === true ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : opt === response?.answer && response?.is_correct === false ? 'border-red-200 bg-red-50 text-red-700' : 'border-gray-100 bg-gray-50 text-gray-400'}`}>
                {opt}
              </div>
            ))}
          </div>
        )}
        {!submitted && !isTimedOut && (questionType === 'short_answer' || questionType === 'numerical') && (
          <div className="flex gap-2">
            <input type={questionType === 'numerical' ? 'number' : 'text'} value={textAnswer}
              onChange={(e) => setTextAnswer(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleTextSubmit(questionId)}
              placeholder={questionType === 'numerical' ? 'Enter a number…' : 'Type your answer…'}
              disabled={submitting}
              className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100 disabled:opacity-50 shadow-sm transition" />
            <button onClick={() => handleTextSubmit(questionId)} disabled={!textAnswer.trim() || submitting}
              className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-40 shadow-sm">
              <Send className="size-3.5" /> Submit
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── Skeleton / error states ───────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f5f3ff] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-violet-500" />
          <p className="text-sm text-gray-400">Loading session…</p>
        </div>
      </main>
    )
  }

  if (loadError || !session) {
    return (
      <main className="min-h-screen bg-[#f5f3ff] flex items-center justify-center px-4">
        <div className="text-center space-y-3">
          <p className="text-gray-600">{loadError || 'Session not found.'}</p>
          <button onClick={() => router.push('/guest/join')} className="text-sm text-violet-600 hover:underline">
            Back to join page
          </button>
        </div>
      </main>
    )
  }

  // ── Waiting room ─────────────────────────────────────────────────────────────

  if (session.status === 'waiting') {
    return (
      <main className="min-h-screen bg-[#f5f3ff]">
        <GuestTopBar sessionTitle={session.title} guestName={guestName} score={score} />
        <div className="flex flex-col items-center justify-center min-h-[80vh] gap-6 px-4">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-100 ring-1 ring-violet-200">
                <Radio className="size-8 text-violet-600" />
              </div>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">You&rsquo;re in the waiting room</h1>
              <p className="text-sm text-gray-500 mt-1">Session will start when your teacher is ready.</p>
            </div>
            <div className="flex items-center justify-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <motion.div key={i} className="h-2 w-2 rounded-full bg-violet-400"
                  animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.4 }} />
              ))}
            </div>
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm px-5 py-3">
              <p className="text-xs text-gray-400">Session</p>
              <p className="text-base font-semibold text-gray-900">{session.title}</p>
            </div>
          </motion.div>
        </div>
      </main>
    )
  }

  // ── Ended ─────────────────────────────────────────────────────────────────────

  if (session.status === 'ended') {
    return (
      <main className="min-h-screen bg-[#f5f3ff]">
        <GuestTopBar sessionTitle={session.title} guestName={guestName} score={score} />
        <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-5 max-w-sm">
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 ring-1 ring-amber-200">
                <Trophy className="size-8 text-amber-600" />
              </div>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Session ended</h1>
              <p className="text-sm text-gray-500 mt-1">Thanks for participating, {guestName}!</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-4">
              <p className="text-xs text-amber-600 uppercase tracking-widest font-semibold mb-1">Your score</p>
              <p className="text-4xl font-black text-amber-600">{score}</p>
            </div>
            <button onClick={() => router.push('/guest/join')}
              className="rounded-xl border border-gray-200 bg-white shadow-sm px-5 py-2.5 text-sm font-medium text-gray-600 transition hover:border-violet-300 hover:text-violet-700">
              Join another session
            </button>
          </motion.div>
        </div>
      </main>
    )
  }

  // ── Active session ────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-[#f5f3ff]">
      <GuestTopBar sessionTitle={session.title} guestName={guestName} score={score} />

      <div className="px-4 py-6 max-w-2xl mx-auto space-y-5">

        {/* Progress dots */}
        {sortedItems.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1.5 px-1">
            {sortedItems.map((_, i) => (
              <div key={i} className={`rounded-full transition-all duration-300 ${i === currentItemIdx ? 'h-2 w-6 bg-violet-500' : i < currentItemIdx ? 'h-2 w-2 bg-violet-300' : 'h-2 w-2 bg-gray-200'}`} />
            ))}
            <span className="ml-2 text-xs text-gray-400">{currentItemIdx + 1} / {sortedItems.length}</span>
          </motion.div>
        )}

        {/* Main content card */}
        <AnimatePresence mode="wait">
          <motion.div key={`${currentItemIdx}-${quizQIdx}`}
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            {/* Item type header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center gap-2">
                {activeItem?.type === 'quiz' && <BookOpen className="size-4 text-violet-500" />}
                {activeItem?.type === 'visualisation' && <BarChart2 className="size-4 text-sky-500" />}
                {activeItem?.type === 'question' && <Zap className="size-4 text-amber-500" />}
                <span className="text-sm font-semibold text-gray-700">
                  {activeItem?.type === 'quiz' ? activeItem.title : activeItem?.type === 'visualisation' ? activeItem.title : 'Question'}
                </span>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${activeItem?.type === 'quiz' ? 'bg-violet-100 text-violet-700' : activeItem?.type === 'visualisation' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>
                {activeItem?.type}
              </span>
            </div>

            <div className="p-5 md:p-6">
              {!activeItem ? (
                <p className="py-8 text-center text-sm text-gray-400">No items in this session.</p>
              ) : activeItem.type === 'visualisation' ? (
                <VisPanel item={activeItem} sessionId={session.id} guestToken={guestToken!} />
              ) : activeItem.type === 'quiz' ? (
                <div className="space-y-5">
                  {activeItem.quizQuestions && activeItem.quizQuestions.length > 0 ? (
                    quizComplete && !quizDismissed ? (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="py-4 space-y-5 text-center"
                      >
                        <div className="flex justify-center">
                          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 ring-1 ring-emerald-200">
                            <CheckCircle2 className="size-7 text-emerald-600" />
                          </div>
                        </div>
                        <div>
                          <h2 className="text-lg font-bold text-gray-900">Quiz Complete!</h2>
                          <p className="text-sm text-gray-500 mt-1">
                            You answered all {activeItem.quizQuestions.length} question{activeItem.quizQuestions.length !== 1 ? 's' : ''}.
                          </p>
                        </div>
                        <div className="flex items-center justify-center gap-6">
                          <div className="text-center">
                            <p className="text-2xl font-black text-emerald-600">
                              {activeItem.quizQuestions.filter((q) =>
                                myResponses.find((r) => r.question_id === q.id)?.is_correct === true
                              ).length}
                            </p>
                            <p className="text-xs text-gray-400">Correct</p>
                          </div>
                          <div className="h-8 w-px bg-gray-200" />
                          <div className="text-center">
                            <p className="text-2xl font-black text-red-500">
                              {activeItem.quizQuestions.filter((q) =>
                                myResponses.find((r) => r.question_id === q.id)?.is_correct === false
                              ).length}
                            </p>
                            <p className="text-xs text-gray-400">Incorrect</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-center gap-3 pt-2">
                          <button
                            onClick={() => setQuizDismissed(true)}
                            className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 shadow-sm transition hover:border-violet-300 hover:text-violet-700"
                          >
                            Stay &amp; view session
                          </button>
                          <button
                            onClick={() => router.push('/guest/join')}
                            className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-500"
                          >
                            Exit session
                          </button>
                        </div>
                      </motion.div>
                    ) : (
                    <>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {activeItem.quizQuestions.map((q, i) => {
                          const answered = myResponses.some((r) => r.question_id === q.id)
                          return (
                            <button key={i} onClick={() => setQuizQIdx(i)}
                              className={`rounded-full transition-all duration-200 ${i === quizQIdx ? 'h-2.5 w-6 bg-violet-500' : answered ? 'h-2 w-2 bg-emerald-400' : 'h-2 w-2 bg-gray-200'}`} />
                          )
                        })}
                        <span className="ml-2 text-xs text-gray-400">Q{quizQIdx + 1} / {activeItem.quizQuestions.length}</span>
                      </div>
                      {activeQuizQuestion && renderQuestion(
                        activeQuizQuestion.id, activeQuizQuestion.text, activeQuizQuestion.type,
                        activeQuizQuestion.options, activeQuizQuestion.time_limit_secs, activeQuizQuestion.visualisations
                      )}
                      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                        <button onClick={() => setQuizQIdx((i) => Math.max(0, i - 1))} disabled={quizQIdx === 0}
                          className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500 transition hover:border-violet-300 hover:text-violet-600 disabled:opacity-30 shadow-sm">
                          <ChevronLeft className="size-3" /> Prev
                        </button>
                        <button onClick={() => setQuizQIdx((i) => Math.min((activeItem.quizQuestions?.length ?? 1) - 1, i + 1))}
                          disabled={quizQIdx >= (activeItem.quizQuestions?.length ?? 1) - 1}
                          className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500 transition hover:border-violet-300 hover:text-violet-600 disabled:opacity-30 shadow-sm">
                          Next <ChevronRight className="size-3" />
                        </button>
                      </div>
                    </>
                    )
                  ) : (
                    <p className="text-sm text-gray-400">This quiz has no questions.</p>
                  )}
                </div>
              ) : (
                renderQuestion(
                  activeItem.reference_id, activeItem.title,
                  activeItem.question_type ?? 'short_answer',
                  activeItem.options ?? null,
                  activeItem.time_limit_secs ?? 0,
                )
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </main>
  )
}

// ── Shared guest top bar ──────────────────────────────────────────────────────

function GuestTopBar({ sessionTitle, guestName, score }: { sessionTitle: string; guestName: string; score: number }) {
  return (
    <div className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-[#e4e0f8] bg-white px-4 shadow-sm">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-violet-100 ring-1 ring-violet-200">
          <Zap className="size-3 text-violet-600" />
        </div>
        <span className="truncate text-sm font-bold text-gray-900 max-w-[140px] sm:max-w-xs">{sessionTitle}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {guestName && (
          <div className="hidden items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 sm:flex">
            <UserCircle className="size-3.5 text-gray-400" />
            <span className="text-xs text-gray-600 max-w-[100px] truncate">{guestName}</span>
            <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-600">Guest</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 shadow-sm">
          <Trophy className="size-3.5 text-amber-500" />
          <span className="text-sm font-bold text-amber-700 tabular-nums">{score}</span>
        </div>
      </div>
    </div>
  )
}
