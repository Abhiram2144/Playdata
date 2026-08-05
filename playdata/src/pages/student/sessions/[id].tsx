import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/router'
import { GetServerSideProps } from 'next'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Radio, Trophy, Clock, ChevronLeft, ChevronRight,
  CheckCircle2, XCircle, BarChart2, BookOpen, Zap,
  Users, Send, LayoutDashboard, UserCircle,
  TrendingUp, PieChart as PieIcon, Maximize2, AlignLeft,
  Loader2, PenLine, ChevronDown, ChevronUp, Plus,
} from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { io as ioClient, Socket } from 'socket.io-client'
import { toast } from 'sonner'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { createClientFromContext } from '@/lib/supabase/server-props'
import type { NavItem } from '@/components/layout/Sidebar'

// ── Types ──────────────────────────────────────────────────────────────────────

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
  // Visualisation
  chart_type?: ChartType
  config?: VizConfig
  dataset_id?: string | null
  // Quiz
  quizQuestions?: QuizQuestion[]
  allow_student_charts?: boolean
  // Question
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
  started_at: string | null
  ended_at: string | null
}

interface Participant {
  id: string
  score: number
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
  participant: Participant
  myResponses: MyResponse[]
}

// ── Server-side auth ───────────────────────────────────────────────────────────

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

  const res = await fetch(`${base}/api/student/sessions/${sessionId}`, {
    headers: { cookie: context.req.headers.cookie ?? '' },
  })

  if (!res.ok) return { redirect: { destination: '/student/join', permanent: false } }

  const data = await res.json()

  return {
    props: {
      profile,
      session: data.session,
      items: data.items,
      participant: data.participant,
      myResponses: data.myResponses,
    },
  }
}

// ── Chart constants ────────────────────────────────────────────────────────────

const VIZ_COLORS = ['#7c3aed', '#a78bfa', '#6d28d9', '#c4b5fd', '#8b5cf6', '#4c1d95', '#ddd6fe']

const TOOLTIP_STYLE = {
  backgroundColor: '#ffffff',
  border: '1px solid #e4e0f8',
  borderRadius: '12px',
  color: '#374151',
  fontSize: 12,
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
}

const AXIS_STYLE = { fill: '#9ca3af', fontSize: 11 }

const CHART_TYPES: ChartType[] = ['bar', 'line', 'pie', 'scatter', 'histogram']

const CHART_LABELS: Record<ChartType, string> = {
  bar: 'Bar', line: 'Line', pie: 'Pie', scatter: 'Scatter', histogram: 'Histogram',
}

const CHART_ICONS: Record<ChartType, React.ReactNode> = {
  bar: <BarChart2 className="size-3.5" />,
  line: <TrendingUp className="size-3.5" />,
  pie: <PieIcon className="size-3.5" />,
  scatter: <Maximize2 className="size-3.5" />,
  histogram: <AlignLeft className="size-3.5" />,
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function smartParseNumber(v: unknown): number {
  if (typeof v === 'number') return v
  const s = String(v ?? '').trim().replace(/[$£€%,]/g, '')
  return parseFloat(s)
}

type FilterOp = '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains'

function applyFilter(rows: Record<string, unknown>[], col: string, op: FilterOp, val: string) {
  if (!col || !val) return rows
  return rows.filter((r) => {
    const v = String(r[col] ?? '')
    switch (op) {
      case '==': return v === val
      case '!=': return v !== val
      case '>': return Number(v) > Number(val)
      case '<': return Number(v) < Number(val)
      case '>=': return Number(v) >= Number(val)
      case '<=': return Number(v) <= Number(val)
      case 'contains': return v.toLowerCase().includes(val.toLowerCase())
      default: return true
    }
  })
}

function groupAggregate(rows: Record<string, unknown>[], xCol: string, yCol: string, agg: string) {
  const groups = new Map<string, number[]>()
  const order: string[] = []
  for (const r of rows) {
    const key = String(r[xCol] ?? '—')
    if (!groups.has(key)) { groups.set(key, []); order.push(key) }
    const n = smartParseNumber(r[yCol])
    if (!isNaN(n)) groups.get(key)!.push(n)
  }
  return order.map((k) => {
    const vals = groups.get(k)!
    let value: number
    if (agg === 'count') value = vals.length
    else if (agg === 'sum') value = vals.reduce((a, b) => a + b, 0)
    else value = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
    return { name: k, value: parseFloat(value.toFixed(4)) }
  }).slice(0, 50)
}

function buildHistBins(rows: Record<string, unknown>[], col: string) {
  const vals = rows.map((r) => smartParseNumber(r[col])).filter((v) => !isNaN(v))
  if (vals.length === 0) return []
  const min = Math.min(...vals), max = Math.max(...vals)
  const numBins = 10, width = (max - min) / numBins || 1
  const bins = Array.from({ length: numBins }, (_, i) => ({
    bin: `${(min + i * width).toFixed(2)}`,
    count: 0,
  }))
  for (const v of vals) {
    const idx = Math.min(Math.floor((v - min) / width), numBins - 1)
    bins[idx].count++
  }
  return bins
}

// ── Chart Renderer ────────────────────────────────────────────────────────────

function ChartRenderer({ chartType, config, rows }: {
  chartType: ChartType
  config: VizConfig
  rows: Record<string, unknown>[]
}) {
  const xAxis = config.xAxis ?? ''
  const yAxis = config.yAxis ?? ''
  const agg = config.aggregation ?? 'mean'
  const filterCol = config.filterColumn ?? ''
  const filterOp = (config.filterOperator ?? '==') as FilterOp
  const filterVal = config.filterValue ?? ''

  const filtered = useMemo(() => {
    return filterCol && filterVal ? applyFilter(rows, filterCol, filterOp, filterVal) : rows
  }, [rows, filterCol, filterOp, filterVal])

  if (!xAxis) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50">
        <p className="text-sm text-gray-400">No axis configured for this chart</p>
      </div>
    )
  }

  if (chartType === 'scatter') {
    if (!yAxis) return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50">
        <p className="text-sm text-gray-400">Scatter requires both X and Y axes</p>
      </div>
    )
    const data = filtered
      .map((r) => ({ x: smartParseNumber(r[xAxis]), y: smartParseNumber(r[yAxis]) }))
      .filter((p) => !isNaN(p.x) && !isNaN(p.y))
    return (
      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f0ff" />
          <XAxis type="number" dataKey="x" name={xAxis} tick={AXIS_STYLE} />
          <YAxis type="number" dataKey="y" name={yAxis} tick={AXIS_STYLE} />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ strokeDasharray: '3 3' }} />
          <Scatter data={data} fill="#7c3aed" fillOpacity={0.7} />
        </ScatterChart>
      </ResponsiveContainer>
    )
  }

  if (chartType === 'histogram') {
    const data = buildHistBins(filtered, xAxis)
    return (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} barCategoryGap="2%">
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f0ff" />
          <XAxis dataKey="bin" tick={AXIS_STYLE} label={{ value: xAxis, position: 'insideBottom', offset: -2, fill: '#9ca3af', fontSize: 11 }} />
          <YAxis tick={AXIS_STYLE} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="count" fill="#7c3aed" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    )
  }

  if (chartType === 'pie') {
    const data = yAxis
      ? groupAggregate(filtered, xAxis, yAxis, agg).slice(0, 12)
      : (() => {
          const counts = new Map<string, number>()
          for (const r of filtered) {
            const k = String(r[xAxis] ?? '—')
            counts.set(k, (counts.get(k) ?? 0) + 1)
          }
          return [...counts.entries()]
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 12)
        })()
    return (
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110}
            label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`} labelLine={false}>
            {data.map((_, i) => <Cell key={i} fill={VIZ_COLORS[i % VIZ_COLORS.length]} />)}
          </Pie>
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ color: '#6b7280', fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  if (!yAxis) return (
    <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50">
      <p className="text-sm text-gray-400">Y axis not configured for this chart</p>
    </div>
  )

  const data = groupAggregate(filtered, xAxis, yAxis, agg)

  if (chartType === 'line') {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f0ff" />
          <XAxis dataKey="name" tick={AXIS_STYLE} />
          <YAxis tick={AXIS_STYLE} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Line type="monotone" dataKey="value" stroke="#7c3aed" strokeWidth={2.5} dot={data.length < 30} />
        </LineChart>
      </ResponsiveContainer>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f0ff" />
        <XAxis dataKey="name" tick={AXIS_STYLE} />
        <YAxis tick={AXIS_STYLE} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Bar dataKey="value" fill="#7c3aed" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Timer bar ─────────────────────────────────────────────────────────────────

function TimerBar({ timeLeft, total }: { timeLeft: number; total: number }) {
  const pct = total > 0 ? Math.max(0, timeLeft / total) : 0
  const isLow = pct < 0.25
  const isMid = pct < 0.5

  return (
    <div className="flex items-center gap-3">
      <Clock className={`size-4 shrink-0 ${isLow ? 'text-red-500 animate-pulse' : isMid ? 'text-amber-500' : 'text-emerald-500'}`} />
      <div className="flex-1">
        <div className="h-2 rounded-full bg-gray-100 overflow-hidden ring-1 ring-gray-200">
          <motion.div
            className={`h-full rounded-full transition-colors duration-300 ${
              isLow ? 'bg-red-500' : isMid ? 'bg-amber-500' : 'bg-emerald-500'
            }`}
            style={{ width: `${pct * 100}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </div>
      <span className={`text-sm font-mono font-bold w-8 text-right tabular-nums ${isLow ? 'text-red-500' : isMid ? 'text-amber-500' : 'text-emerald-500'}`}>
        {timeLeft}s
      </span>
    </div>
  )
}

// ── Nav ───────────────────────────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  { href: '/student/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/student/join', label: 'Join Session', icon: Users },
  { href: '/student/results', label: 'My Results', icon: Trophy },
  { href: '/profile', label: 'Profile', icon: UserCircle },
]

// ── Vis panel (chart) ─────────────────────────────────────────────────────────

function VisPanel({ item, sessionId }: { item: SessionItem; sessionId: string }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [selectedType, setSelectedType] = useState<ChartType>(item.chart_type ?? 'bar')

  useEffect(() => { setMounted(true) }, [])

  const teacherType = item.chart_type ?? 'bar'
  const config = item.config ?? {}

  useEffect(() => {
    if (!item.dataset_id) return
    setLoading(true)
    setError(null)
    fetch(`/api/student/sessions/${sessionId}/vis-rows?vis_id=${item.reference_id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.rows) setRows(data.rows)
        else setError('Failed to load chart data')
      })
      .catch(() => setError('Failed to load chart data'))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.reference_id, sessionId])

  return (
    <div className="space-y-4">
      {/* Chart type selector */}
      <div className="space-y-2">
        <p className="text-xs text-gray-400 font-medium">Chart type</p>
        <div className="flex flex-wrap gap-2">
          {CHART_TYPES.map((ct) => (
            <button
              key={ct}
              onClick={() => setSelectedType(ct)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition border ${
                selectedType === ct
                  ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-violet-300 hover:text-violet-600'
              }`}
            >
              {CHART_ICONS[ct]}
              {CHART_LABELS[ct]}
              {ct === teacherType && (
                <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  selectedType === ct ? 'bg-violet-500 text-white' : 'bg-violet-100 text-violet-600'
                }`}>
                  Teacher
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Chart area */}
      {!item.dataset_id ? (
        <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50">
          <p className="text-sm text-gray-400">No dataset linked to this visualisation</p>
        </div>
      ) : loading ? (
        <div className="flex h-64 items-center justify-center rounded-xl border border-gray-100 bg-gray-50">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="size-6 animate-spin text-violet-500" />
            <p className="text-sm text-gray-400">Loading chart data…</p>
          </div>
        </div>
      ) : error ? (
        <div className="flex h-64 items-center justify-center rounded-xl border border-red-100 bg-red-50">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50">
          <p className="text-sm text-gray-400">No data available</p>
        </div>
      ) : mounted ? (
        <div className="rounded-xl border border-gray-100 bg-white p-4">
          {config.title && <p className="text-sm font-semibold text-gray-800 mb-3">{config.title}</p>}
          <ChartRenderer chartType={selectedType} config={config} rows={rows} />
          <p className="mt-2 text-[11px] text-gray-300">Showing {rows.length} data points</p>
        </div>
      ) : (
        <div className="flex h-64 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
        </div>
      )}
    </div>
  )
}

// ── Quiz question chart (teacher vis + optional student builder) ──────────────

function QuizQuestionChart({
  vis,
  sessionId,
  allowStudentCharts,
}: {
  vis: QuizQuestionVis
  sessionId: string
  allowStudentCharts: boolean
}) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [selectedType, setSelectedType] = useState<ChartType>(vis.chart_type)
  const [builderOpen, setBuilderOpen] = useState(false)
  const [studentChartType, setStudentChartType] = useState<ChartType>('bar')
  const [studentConfig, setStudentConfig] = useState<VizConfig>({})

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!vis.dataset_id) return
    setLoading(true)
    setError(null)
    fetch(`/api/student/sessions/${sessionId}/vis-rows?vis_id=${vis.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.rows) setRows(data.rows)
        else setError('Failed to load chart data')
      })
      .catch(() => setError('Failed to load chart data'))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vis.id, sessionId])

  const columns = rows.length > 0 ? Object.keys(rows[0]) : []

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Teacher chart header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-2">
          <BarChart2 className="size-3.5 text-sky-500" />
          <span className="text-xs font-semibold text-gray-700">{vis.name}</span>
          <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-600">Teacher</span>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="rounded-md p-1 text-gray-400 hover:text-gray-600 transition"
        >
          {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>
      </div>

      {expanded && (
        <div className="p-4 space-y-3">
          {/* Chart type switcher */}
          <div className="flex flex-wrap gap-1.5">
            {CHART_TYPES.map((ct) => (
              <button
                key={ct}
                onClick={() => setSelectedType(ct)}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition border ${
                  selectedType === ct
                    ? 'bg-violet-600 text-white border-violet-600'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-violet-300 hover:text-violet-600'
                }`}
              >
                {CHART_ICONS[ct]}
                {CHART_LABELS[ct]}
                {ct === vis.chart_type && selectedType !== ct && (
                  <span className="ml-0.5 rounded-full bg-violet-100 px-1 text-[9px] font-bold text-violet-600">T</span>
                )}
              </button>
            ))}
          </div>

          {/* Chart area */}
          {!vis.dataset_id ? (
            <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50">
              <p className="text-xs text-gray-400">No dataset linked</p>
            </div>
          ) : loading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-violet-500" />
            </div>
          ) : error ? (
            <div className="flex h-48 items-center justify-center rounded-xl border border-red-100 bg-red-50">
              <p className="text-xs text-red-500">{error}</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50">
              <p className="text-xs text-gray-400">No data available</p>
            </div>
          ) : mounted ? (
            <div>
              {vis.config.title && (
                <p className="mb-2 text-xs font-semibold text-gray-700">{vis.config.title}</p>
              )}
              <ChartRenderer chartType={selectedType} config={vis.config} rows={rows} />
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
            </div>
          )}
        </div>
      )}

      {/* Student chart builder */}
      {allowStudentCharts && rows.length > 0 && (
        <div className="border-t border-gray-100">
          <button
            onClick={() => setBuilderOpen((v) => !v)}
            className={`flex w-full items-center gap-2 px-4 py-2.5 text-xs font-semibold transition ${
              builderOpen
                ? 'bg-violet-50 text-violet-700'
                : 'bg-gray-50 text-gray-500 hover:bg-violet-50 hover:text-violet-700'
            }`}
          >
            <PenLine className="size-3.5" />
            {builderOpen ? 'Close my chart' : 'Build my own chart'}
            {builderOpen ? <ChevronUp className="size-3 ml-auto" /> : <ChevronDown className="size-3 ml-auto" />}
          </button>

          <AnimatePresence>
            {builderOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                <div className="p-4 space-y-3 bg-violet-50/50 border-t border-violet-100">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-500">My chart</p>

                  {/* Chart type */}
                  <div className="flex flex-wrap gap-1.5">
                    {CHART_TYPES.map((ct) => (
                      <button
                        key={ct}
                        onClick={() => setStudentChartType(ct)}
                        className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition border ${
                          studentChartType === ct
                            ? 'bg-violet-600 text-white border-violet-600'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-violet-300 hover:text-violet-600'
                        }`}
                      >
                        {CHART_ICONS[ct]} {CHART_LABELS[ct]}
                      </button>
                    ))}
                  </div>

                  {/* Axis selectors */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-violet-500">
                        X Axis
                      </label>
                      <select
                        value={studentConfig.xAxis ?? ''}
                        onChange={(e) => setStudentConfig((c) => ({ ...c, xAxis: e.target.value }))}
                        className="w-full rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-xs text-gray-700 focus:border-violet-400 focus:outline-none"
                      >
                        <option value="">— pick column —</option>
                        {columns.map((col) => <option key={col} value={col}>{col}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-violet-500">
                        Y Axis <span className="font-normal normal-case text-violet-400">(optional)</span>
                      </label>
                      <select
                        value={studentConfig.yAxis ?? ''}
                        onChange={(e) => setStudentConfig((c) => ({ ...c, yAxis: e.target.value || undefined }))}
                        className="w-full rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-xs text-gray-700 focus:border-violet-400 focus:outline-none"
                      >
                        <option value="">— none —</option>
                        {columns.map((col) => <option key={col} value={col}>{col}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Aggregation (only for bar/line/pie with Y axis) */}
                  {studentConfig.yAxis && ['bar', 'line', 'pie'].includes(studentChartType) && (
                    <div>
                      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-violet-500">
                        Aggregation
                      </label>
                      <div className="flex gap-1.5">
                        {(['mean', 'sum', 'count'] as const).map((agg) => (
                          <button
                            key={agg}
                            onClick={() => setStudentConfig((c) => ({ ...c, aggregation: agg }))}
                            className={`rounded-lg px-3 py-1 text-xs font-medium transition border capitalize ${
                              (studentConfig.aggregation ?? 'mean') === agg
                                ? 'bg-violet-600 text-white border-violet-600'
                                : 'bg-white text-gray-500 border-gray-200 hover:border-violet-300 hover:text-violet-600'
                            }`}
                          >
                            {agg}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Preview */}
                  {studentConfig.xAxis ? (
                    <div className="rounded-xl border border-violet-200 bg-white p-3">
                      <ChartRenderer chartType={studentChartType} config={studentConfig} rows={rows} />
                    </div>
                  ) : (
                    <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-violet-200 bg-white">
                      <p className="text-xs text-violet-400">Pick an X axis to preview your chart</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function StudentSession({
  profile,
  session: initialSession,
  items,
  participant: initialParticipant,
  myResponses: initialResponses,
}: Props) {
  const router = useRouter()
  const socketRef = useRef<Socket | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [session, setSession] = useState(initialSession)
  const [currentItemIdx, setCurrentItemIdx] = useState<number>(initialSession.current_item ?? 0)
  const [myResponses, setMyResponses] = useState<MyResponse[]>(initialResponses)
  const [score, setScore] = useState(initialParticipant.score)

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
    activeItem?.type === 'question'
      ? activeItem.reference_id
      : activeQuizQuestion?.id ?? null

  const myResponseForActive = activeQuestionId
    ? myResponses.find((r) => r.question_id === activeQuestionId) ?? null
    : null

  const alreadyAnswered = !!myResponseForActive

  const quizComplete =
    activeItem?.type === 'quiz' &&
    (activeItem.quizQuestions?.length ?? 0) > 0 &&
    (activeItem.quizQuestions ?? []).every((q) => myResponses.some((r) => r.question_id === q.id))

  // ── Timer ──────────────────────────────────────────────────────────────────

  const startTimer = useCallback((secs: number) => {
    if (timerRef.current) clearInterval(timerRef.current)
    setTimedOut(false)
    if (secs <= 0) { setTimeLeft(null); return }
    setTimeLeft(secs)
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timerRef.current!)
          setTimedOut(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  useEffect(() => {
    setQuizQIdx(0)
    setSelectedAnswer('')
    setTextAnswer('')
    setTimedOut(false)
    setQuizDismissed(false)
    if (timerRef.current) clearInterval(timerRef.current)
    setTimeLeft(null)

    if (activeItem?.type === 'quiz' && activeItem.quizQuestions?.[0]) {
      startTimer(activeItem.quizQuestions[0].time_limit_secs)
    } else if (activeItem?.type === 'question' && (activeItem.time_limit_secs ?? 0) > 0) {
      startTimer(activeItem.time_limit_secs!)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentItemIdx])

  useEffect(() => {
    if (activeQuizQuestion) {
      setSelectedAnswer('')
      setTextAnswer('')
      setTimedOut(false)
      startTimer(activeQuizQuestion.time_limit_secs)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizQIdx, currentItemIdx])

  // ── Socket ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/socket').then(() => {
      const socket = ioClient({ path: '/api/socket', transports: ['websocket', 'polling'] })
      socketRef.current = socket

      // Emit join-session once the transport is established to avoid the race
      // where the server broadcasts session:start before the socket has joined the room.
      socket.on('connect', () => {
        socket.emit('join-session', session.id)
      })

      socket.on('session:start', ({ currentItem }: { currentItem: number }) => {
        setCurrentItemIdx(currentItem)
        setSession((prev) => ({ ...prev, status: 'active', current_item: currentItem }))
      })
      socket.on('session:advance', ({ currentItem }: { currentItem: number }) => {
        setCurrentItemIdx(currentItem)
        setSession((prev) => ({ ...prev, current_item: currentItem }))
      })
      socket.on('session:end', () => {
        setSession((prev) => ({ ...prev, status: 'ended' }))
        toast.success('Session ended by teacher')
      })
    })

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (socketRef.current) {
        socketRef.current.emit('leave-session', session.id)
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id])

  // Polling fallback: if the socket misses session:start (race condition between
  // socket connect and teacher starting the session), poll until active.
  useEffect(() => {
    if (session.status !== 'waiting') return

    const pollId = setInterval(async () => {
      const res = await fetch(`/api/student/sessions/${session.id}`)
      if (!res.ok) return
      const data = await res.json()
      if (data.session?.status === 'active') {
        setCurrentItemIdx(data.session.current_item ?? 0)
        setSession((prev) => ({ ...prev, status: 'active', current_item: data.session.current_item ?? 0 }))
      }
    }, 3000)

    return () => clearInterval(pollId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.status, session.id])

  // ── Answer submission ──────────────────────────────────────────────────────

  const submitAnswer = async (questionId: string, answer: string) => {
    if (!answer.trim() || submitting || alreadyAnswered) return
    setSubmitting(true)

    const res = await fetch(`/api/student/sessions/${session.id}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question_id: questionId, answer }),
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

  // ── Status screens ─────────────────────────────────────────────────────────

  if (session.status === 'waiting') {
    return (
      <DashboardLayout navItems={NAV_ITEMS} profile={profile}>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center space-y-4"
          >
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
                <motion.div
                  key={i}
                  className="h-2 w-2 rounded-full bg-violet-400"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.4 }}
                />
              ))}
            </div>
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm px-5 py-3">
              <p className="text-xs text-gray-400">Session</p>
              <p className="text-base font-semibold text-gray-900">{session.title}</p>
            </div>
          </motion.div>
        </div>
      </DashboardLayout>
    )
  }

  if (session.status === 'ended') {
    return (
      <DashboardLayout navItems={NAV_ITEMS} profile={profile}>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center space-y-5 max-w-sm"
          >
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 ring-1 ring-amber-200">
                <Trophy className="size-8 text-amber-600" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Session Complete!</h1>
              <p className="text-sm text-gray-500 mt-1">{session.title}</p>
            </div>
            <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 px-8 py-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-violet-600 mb-1">Your Score</p>
              <p className="text-5xl font-black text-gray-900">{score}</p>
              <p className="text-sm text-gray-500 mt-1">correct answers</p>
            </div>
            <div className="flex items-center gap-3 justify-center">
              <button
                onClick={() => router.push('/student/results')}
                className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 shadow-sm px-5 py-2.5 text-sm font-medium text-violet-700 transition hover:bg-violet-100"
              >
                View results
              </button>
              <button
                onClick={() => router.push('/student/dashboard')}
                className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white shadow-sm px-5 py-2.5 text-sm font-medium text-gray-600 transition hover:border-violet-300 hover:text-violet-700"
              >
                Dashboard
              </button>
            </div>
          </motion.div>
        </div>
      </DashboardLayout>
    )
  }

  // ── Active session ─────────────────────────────────────────────────────────

  const renderQuestion = (
    questionId: string,
    questionText: string,
    questionType: string,
    options: string[] | null,
    timeLimitSecs: number,
    visualisations?: QuizQuestionVis[],
    allowStudentCharts?: boolean
  ) => {
    const response = myResponses.find((r) => r.question_id === questionId) ?? null
    const submitted = !!response
    const isTimedOut = timedOut && !submitted

    return (
      <div className="space-y-4">
        {/* Teacher-linked charts */}
        {visualisations && visualisations.length > 0 && (
          <div className="space-y-3">
            {visualisations.map((vis) => (
              <QuizQuestionChart
                key={vis.id}
                vis={vis}
                sessionId={session.id}
                allowStudentCharts={allowStudentCharts ?? false}
              />
            ))}
          </div>
        )}

        {/* If no teacher chart but student builder is allowed, show a standalone builder */}
        {allowStudentCharts && (!visualisations || visualisations.length === 0) && (
          <div className="rounded-xl border border-violet-200 bg-violet-50/50 px-4 py-3 text-xs text-violet-500">
            <div className="flex items-center gap-1.5">
              <PenLine className="size-3.5" />
              <span>Chart builder is enabled — link a visualisation to this question to use it.</span>
            </div>
          </div>
        )}

        <p className="text-base font-semibold text-gray-900 leading-relaxed">{questionText}</p>

        {timeLimitSecs > 0 && timeLeft !== null && !submitted && (
          <TimerBar timeLeft={timeLeft} total={timeLimitSecs} />
        )}
        {timeLimitSecs <= 0 && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Clock className="size-3" /> Untimed
          </div>
        )}

        {isTimedOut && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            Time&apos;s up! No answer submitted.
          </div>
        )}

        {submitted && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
              response.is_correct === true
                ? 'border-emerald-200 bg-emerald-50'
                : response.is_correct === false
                  ? 'border-red-200 bg-red-50'
                  : 'border-gray-200 bg-gray-50'
            }`}
          >
            {response.is_correct === true ? (
              <CheckCircle2 className="size-5 text-emerald-500 shrink-0 mt-0.5" />
            ) : response.is_correct === false ? (
              <XCircle className="size-5 text-red-500 shrink-0 mt-0.5" />
            ) : null}
            <div>
              <p className={`text-sm font-semibold ${
                response.is_correct === true ? 'text-emerald-700' :
                response.is_correct === false ? 'text-red-700' :
                'text-gray-700'
              }`}>
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
                <button
                  key={opt}
                  onClick={() => handleMcqSelect(opt)}
                  disabled={submitting}
                  className={`w-full rounded-xl border px-4 py-3 text-left text-sm font-medium transition ${
                    selectedAnswer === opt
                      ? 'border-violet-400 bg-violet-50 text-violet-700 ring-1 ring-violet-200'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-violet-300 hover:bg-violet-50'
                  } disabled:opacity-50 shadow-sm`}
                >
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
              <div
                key={opt}
                className={`rounded-xl border px-4 py-2.5 text-sm font-medium ${
                  opt === response?.answer && response?.is_correct === true
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : opt === response?.answer && response?.is_correct === false
                      ? 'border-red-200 bg-red-50 text-red-700'
                      : 'border-gray-100 bg-gray-50 text-gray-400'
                }`}
              >
                {opt}
              </div>
            ))}
          </div>
        )}

        {!submitted && !isTimedOut && (questionType === 'short_answer' || questionType === 'numerical') && (
          <div className="flex gap-2">
            <input
              type={questionType === 'numerical' ? 'number' : 'text'}
              value={textAnswer}
              onChange={(e) => setTextAnswer(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleTextSubmit(questionId)}
              placeholder={questionType === 'numerical' ? 'Enter a number…' : 'Type your answer…'}
              disabled={submitting}
              className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100 disabled:opacity-50 shadow-sm transition"
            />
            <button
              onClick={() => handleTextSubmit(questionId)}
              disabled={!textAnswer.trim() || submitting}
              className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-40 shadow-sm"
            >
              <Send className="size-3.5" />
              Submit
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <DashboardLayout navItems={NAV_ITEMS} profile={profile}>
      <div className="max-w-2xl space-y-5">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between gap-3"
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold tracking-wider text-emerald-700 ring-1 ring-emerald-200 sm:gap-1.5 sm:px-3">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <Radio className="size-3" /> <span className="hidden sm:inline">LIVE</span>
            </span>
            <h1 className="truncate text-base font-bold text-gray-900 sm:text-lg">{session.title}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 shadow-sm">
            <Trophy className="size-4 text-amber-500" />
            <span className="text-sm font-bold text-amber-700 tabular-nums">{score}</span>
          </div>
        </motion.div>

        {/* Item progress dots */}
        {sortedItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.05 }}
            className="flex items-center gap-1.5 px-1"
          >
            {sortedItems.map((_, i) => (
              <div
                key={i}
                className={`rounded-full transition-all duration-300 ${
                  i === currentItemIdx
                    ? 'h-2 w-6 bg-violet-500'
                    : i < currentItemIdx
                      ? 'h-2 w-2 bg-violet-300'
                      : 'h-2 w-2 bg-gray-200'
                }`}
              />
            ))}
            <span className="ml-2 text-xs text-gray-400">
              {currentItemIdx + 1} / {sortedItems.length}
            </span>
          </motion.div>
        )}

        {/* Main content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`${currentItemIdx}-${quizQIdx}`}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden"
          >
            {/* Item type header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center gap-2">
                {activeItem?.type === 'quiz' && <BookOpen className="size-4 text-violet-500" />}
                {activeItem?.type === 'visualisation' && <BarChart2 className="size-4 text-sky-500" />}
                {activeItem?.type === 'question' && <Zap className="size-4 text-amber-500" />}
                <span className="text-sm font-semibold text-gray-700">
                  {activeItem?.type === 'quiz' ? activeItem.title :
                   activeItem?.type === 'visualisation' ? activeItem.title :
                   'Question'}
                </span>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                activeItem?.type === 'quiz' ? 'bg-violet-100 text-violet-700' :
                activeItem?.type === 'visualisation' ? 'bg-sky-100 text-sky-700' :
                'bg-amber-100 text-amber-700'
              }`}>
                {activeItem?.type}
              </span>
            </div>

            <div className="p-6">
              {!activeItem ? (
                <p className="py-8 text-center text-sm text-gray-400">No items in this session.</p>
              ) : activeItem.type === 'visualisation' ? (
                <VisPanel item={activeItem} sessionId={session.id} />
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
                            onClick={() => router.push('/student/dashboard')}
                            className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-500"
                          >
                            Go to dashboard
                          </button>
                        </div>
                      </motion.div>
                    ) : (
                    <>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {activeItem.quizQuestions.map((q, i) => {
                          const answered = myResponses.some((r) => r.question_id === q.id)
                          return (
                            <button
                              key={i}
                              onClick={() => setQuizQIdx(i)}
                              className={`rounded-full transition-all duration-200 ${
                                i === quizQIdx
                                  ? 'h-2.5 w-6 bg-violet-500'
                                  : answered
                                    ? 'h-2 w-2 bg-emerald-400'
                                    : 'h-2 w-2 bg-gray-200'
                              }`}
                            />
                          )
                        })}
                        <span className="ml-2 text-xs text-gray-400">
                          Q{quizQIdx + 1} / {activeItem.quizQuestions.length}
                        </span>
                      </div>

                      {activeQuizQuestion && renderQuestion(
                        activeQuizQuestion.id,
                        activeQuizQuestion.text,
                        activeQuizQuestion.type,
                        activeQuizQuestion.options,
                        activeQuizQuestion.time_limit_secs,
                        activeQuizQuestion.visualisations,
                        activeItem.allow_student_charts,
                      )}

                      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                        <button
                          onClick={() => setQuizQIdx((i) => Math.max(0, i - 1))}
                          disabled={quizQIdx === 0}
                          className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500 transition hover:border-violet-300 hover:text-violet-600 disabled:opacity-30 shadow-sm"
                        >
                          <ChevronLeft className="size-3" /> Prev
                        </button>
                        <button
                          onClick={() => setQuizQIdx((i) => Math.min((activeItem.quizQuestions?.length ?? 1) - 1, i + 1))}
                          disabled={quizQIdx >= (activeItem.quizQuestions?.length ?? 1) - 1}
                          className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500 transition hover:border-violet-300 hover:text-violet-600 disabled:opacity-30 shadow-sm"
                        >
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
                  activeItem.reference_id,
                  activeItem.title,
                  activeItem.question_type ?? 'short_answer',
                  activeItem.options ?? null,
                  activeItem.time_limit_secs ?? 0,
                )
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Answer summary footer */}
        {myResponses.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white shadow-sm px-5 py-3"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-500" />
              <span className="text-sm text-gray-600">
                <span className="font-bold text-emerald-600">{myResponses.filter((r) => r.is_correct).length}</span> correct
              </span>
            </div>
            <div className="h-4 w-px bg-gray-200" />
            <div className="flex items-center gap-2">
              <XCircle className="size-4 text-red-400" />
              <span className="text-sm text-gray-600">
                <span className="font-bold text-red-500">{myResponses.filter((r) => r.is_correct === false).length}</span> wrong
              </span>
            </div>
            <div className="h-4 w-px bg-gray-200" />
            <span className="text-sm text-gray-400">{myResponses.length} answered</span>
          </motion.div>
        )}
      </div>
    </DashboardLayout>
  )
}
