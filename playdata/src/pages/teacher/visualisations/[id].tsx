import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import { GetServerSidePropsResult } from 'next';
import {
  BarChart2, TrendingUp, PieChart as PieIcon, Maximize2, AlignLeft,
  ArrowLeft, Pencil, Save, Check, Database, Calendar,
} from 'lucide-react';
import Link from 'next/link';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { TEACHER_NAV } from '@/lib/teacher-nav';
import { withAuth } from '@/lib/auth';
import { createClientFromContext } from '@/lib/supabase/server-props';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  categoricalColor, CHART_PIE_STROKE, CHART_PRIMARY,
  CHART_TOOLTIP_STYLE, CHART_AXIS_STYLE,
} from '@/lib/chart-colors';

// ── Types ────────────────────────────────────────────────────────────────────
type ChartType = 'bar' | 'line' | 'pie' | 'scatter' | 'histogram';

interface ColumnSchema { name: string; type: string }

interface Dataset {
  id: string;
  name: string;
  row_count: number;
  schema: { columns: ColumnSchema[] };
}

interface VizConfig {
  title?: string;
  xAxis?: string;
  yAxis?: string;
  aggregation?: string;
  filterColumn?: string;
  filterOperator?: string;
  filterValue?: string;
}

interface Visualisation {
  id: string;
  name: string;
  chart_type: ChartType;
  config: VizConfig;
  is_template: boolean;
  created_at: string;
  updated_at: string;
  dataset_id: string | null;
  datasets: Dataset | null;
}

interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: string;
  subject_taught: string | null;
  institution_role: string | null;
  created_at: string;
}

interface Props {
  profile: Profile;
  visualisation: Visualisation;
}

// ── Server-side ──────────────────────────────────────────────────────────────
export const getServerSideProps = withAuth(
  async (context, userId): Promise<GetServerSidePropsResult<Props>> => {
    const { id } = context.params as { id: string };

    const supabase = createClientFromContext(context);
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, subject_taught, institution_role, created_at')
      .eq('id', userId)
      .single();

    if (!profile) return { redirect: { destination: '/auth/login', permanent: false } };

    const admin = createAdminClient();

    const { data: vis } = await admin
      .from('visualisations')
      .select('id, name, chart_type, config, is_template, dataset_id, created_at, updated_at, datasets(id, name, row_count, schema)')
      .eq('id', id)
      .eq('teacher_id', userId)
      .maybeSingle();

    if (!vis) return { notFound: true };

    return {
      props: {
        profile,
        visualisation: vis as unknown as Visualisation,
      },
    };
  },
  { allowedRoles: ['teacher'] }
);

// ── Helpers ───────────────────────────────────────────────────────────────────
function smartParseNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim().replace(/[$£€%,]/g, '');
  return parseFloat(s);
}

type FilterOp = '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains';

function applyFilter(rows: Record<string, unknown>[], col: string, op: FilterOp, val: string) {
  if (!col || !val) return rows;
  return rows.filter((r) => {
    const v = String(r[col] ?? '');
    switch (op) {
      case '==': return v === val;
      case '!=': return v !== val;
      case '>': return Number(v) > Number(val);
      case '<': return Number(v) < Number(val);
      case '>=': return Number(v) >= Number(val);
      case '<=': return Number(v) <= Number(val);
      case 'contains': return v.toLowerCase().includes(val.toLowerCase());
      default: return true;
    }
  });
}

function groupAggregate(rows: Record<string, unknown>[], xCol: string, yCol: string, agg: string) {
  const groups = new Map<string, number[]>();
  const order: string[] = [];
  for (const r of rows) {
    const key = String(r[xCol] ?? '—');
    if (!groups.has(key)) { groups.set(key, []); order.push(key); }
    const n = smartParseNumber(r[yCol]);
    if (!isNaN(n)) groups.get(key)!.push(n);
  }
  return order.map((k) => {
    const vals = groups.get(k)!;
    let value: number;
    if (agg === 'count') value = vals.length;
    else if (agg === 'sum') value = vals.reduce((a, b) => a + b, 0);
    else value = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    return { name: k, value: parseFloat(value.toFixed(4)) };
  }).slice(0, 50);
}

function buildHistBins(rows: Record<string, unknown>[], col: string) {
  const vals = rows.map((r) => smartParseNumber(r[col])).filter((v) => !isNaN(v));
  if (vals.length === 0) return [];
  const min = Math.min(...vals), max = Math.max(...vals);
  const numBins = 10, width = (max - min) / numBins || 1;
  const bins = Array.from({ length: numBins }, (_, i) => ({ bin: `${(min + i * width).toFixed(2)}`, count: 0 }));
  for (const v of vals) {
    const idx = Math.min(Math.floor((v - min) / width), numBins - 1);
    bins[idx].count++;
  }
  return bins;
}

const CHART_LABELS: Record<ChartType, string> = {
  bar: 'Bar', line: 'Line', pie: 'Pie', scatter: 'Scatter', histogram: 'Histogram',
};

const CHART_COLORS: Record<ChartType, string> = {
  bar: 'text-violet-700 bg-violet-100 ring-violet-200',
  line: 'text-blue-700 bg-blue-100 ring-blue-200',
  pie: 'text-emerald-700 bg-emerald-100 ring-emerald-200',
  scatter: 'text-amber-700 bg-amber-100 ring-amber-200',
  histogram: 'text-rose-700 bg-rose-100 ring-rose-200',
};

const CHART_ICONS: Record<ChartType, React.ReactNode> = {
  bar: <BarChart2 className="size-4" />,
  line: <TrendingUp className="size-4" />,
  pie: <PieIcon className="size-4" />,
  scatter: <Maximize2 className="size-4" />,
  histogram: <AlignLeft className="size-4" />,
};

// ── Chart Renderer ────────────────────────────────────────────────────────────
function ChartRenderer({ chartType, config, rows }: {
  chartType: ChartType;
  config: VizConfig;
  rows: Record<string, unknown>[];
}) {
  const xAxis = config.xAxis ?? '';
  const yAxis = config.yAxis ?? '';
  const agg = config.aggregation ?? 'mean';
  const filterCol = config.filterColumn ?? '';
  const filterOp = (config.filterOperator ?? '==') as FilterOp;
  const filterVal = config.filterValue ?? '';

  const filtered = useMemo(() => {
    return filterCol && filterVal ? applyFilter(rows, filterCol, filterOp, filterVal) : rows;
  }, [rows, filterCol, filterOp, filterVal]);

  if (!xAxis) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50">
        <p className="text-sm text-gray-500">No axis configured for this chart</p>
      </div>
    );
  }

  if (chartType === 'scatter') {
    if (!yAxis) return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50">
        <p className="text-sm text-gray-500">Scatter requires both X and Y axes</p>
      </div>
    );
    const data = filtered
      .map((r) => ({ x: smartParseNumber(r[xAxis]), y: smartParseNumber(r[yAxis]) }))
      .filter((p) => !isNaN(p.x) && !isNaN(p.y));
    return (
      <ResponsiveContainer width="100%" height={360}>
        <ScatterChart>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f0ff" />
          <XAxis type="number" dataKey="x" name={xAxis} tick={CHART_AXIS_STYLE} />
          <YAxis type="number" dataKey="y" name={yAxis} tick={CHART_AXIS_STYLE} />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ strokeDasharray: '3 3' }} />
          <Scatter data={data} fill={CHART_PRIMARY} fillOpacity={0.7} />
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'histogram') {
    const data = buildHistBins(filtered, xAxis);
    return (
      <ResponsiveContainer width="100%" height={360}>
        <BarChart data={data} barCategoryGap="2%">
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f0ff" />
          <XAxis dataKey="bin" tick={CHART_AXIS_STYLE} label={{ value: xAxis, position: 'insideBottom', offset: -2, fill: CHART_AXIS_STYLE.fill, fontSize: 11 }} />
          <YAxis tick={CHART_AXIS_STYLE} />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
          <Bar dataKey="count" fill={CHART_PRIMARY} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'pie') {
    const data = yAxis
      ? groupAggregate(filtered, xAxis, yAxis, agg).slice(0, 12)
      : (() => {
          const counts = new Map<string, number>();
          for (const r of filtered) {
            const k = String(r[xAxis] ?? '—');
            counts.set(k, (counts.get(k) ?? 0) + 1);
          }
          return [...counts.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 12);
        })();
    return (
      <ResponsiveContainer width="100%" height={360}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={130}
            label={({ name, percent = 0 }) => `${name} (${(percent * 100).toFixed(0)}%)`} labelLine={false}>
            {data.map((_, i) => <Cell key={i} fill={categoricalColor(i)} stroke={CHART_PIE_STROKE} strokeWidth={1} />)}
          </Pie>
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ color: '#6b7280', fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (!yAxis) return (
    <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50">
      <p className="text-sm text-gray-500">Y axis not configured</p>
    </div>
  );

  const data = groupAggregate(filtered, xAxis, yAxis, agg);

  if (chartType === 'line') {
    return (
      <ResponsiveContainer width="100%" height={360}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f0ff" />
          <XAxis dataKey="name" tick={CHART_AXIS_STYLE} />
          <YAxis tick={CHART_AXIS_STYLE} />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
          <Line type="monotone" dataKey="value" stroke={CHART_PRIMARY} strokeWidth={2.5} dot={data.length < 30} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={360}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f0ff" />
        <XAxis dataKey="name" tick={CHART_AXIS_STYLE} />
        <YAxis tick={CHART_AXIS_STYLE} />
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
        <Bar dataKey="value" fill={CHART_PRIMARY} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function VisualisationView({ profile, visualisation }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Editable name
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(visualisation.name);
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const loadRows = useCallback(async () => {
    if (!visualisation.dataset_id) return;
    setLoadingRows(true);
    setRowError(null);
    const res = await fetch(`/api/teacher/datasets/${visualisation.dataset_id}/rows?page=0&pageSize=500`);
    const data = await res.json();
    setLoadingRows(false);
    if (!res.ok) { setRowError(data.error ?? 'Failed to load data'); return; }
    setRows(data.rows ?? []);
  }, [visualisation.dataset_id]);

  useEffect(() => { loadRows(); }, [loadRows]);

  const saveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === visualisation.name) { setEditingName(false); return; }
    setSavingName(true);
    const res = await fetch(`/api/teacher/visualisations/${visualisation.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    });
    setSavingName(false);
    if (res.ok) { setNameSaved(true); setEditingName(false); setTimeout(() => setNameSaved(false), 2000); }
  };

  const dataset = visualisation.datasets;
  const cfg = visualisation.config ?? {};

  return (
    <DashboardLayout navItems={TEACHER_NAV} profile={profile}>
      <div className="max-w-5xl space-y-6">

        {/* Back */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push('/teacher/visualisations')}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-violet-600 transition-colors"
          >
            <ArrowLeft className="size-3.5" /> Back to Visualisations
          </button>
          {nameSaved && (
            <span className="flex items-center gap-1 text-xs text-emerald-600">
              <Check className="size-3" /> Saved
            </span>
          )}
        </div>

        {/* Header card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-gray-100 bg-white shadow-sm p-6"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${CHART_COLORS[visualisation.chart_type]}`}>
                  {CHART_ICONS[visualisation.chart_type]}
                  {CHART_LABELS[visualisation.chart_type]}
                </span>
                {visualisation.is_template && (
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 ring-1 ring-inset ring-purple-200">
                    Template
                  </span>
                )}
              </div>

              {editingName ? (
                <div className="flex items-center gap-2 mt-1">
                  <input
                    autoFocus
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false); }}
                    className="flex-1 min-w-0 rounded-xl border border-violet-300 bg-white px-3 py-1.5 text-xl font-bold text-gray-900 focus:outline-none focus:border-violet-500"
                  />
                  <button onClick={saveName} disabled={savingName} className="rounded-lg bg-emerald-50 border border-emerald-200 p-1.5 text-emerald-600 hover:bg-emerald-100">
                    <Save className="size-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-1">
                  <h1 className="text-2xl font-bold text-gray-900 truncate">{nameInput}</h1>
                  <button onClick={() => setEditingName(true)} className="shrink-0 p-1 text-gray-300 hover:text-violet-500 transition-colors">
                    <Pencil className="size-3.5" />
                  </button>
                </div>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                {dataset && (
                  <span className="flex items-center gap-1">
                    <Database className="size-3" />
                    <Link href={`/teacher/datasets/${dataset.id}`} className="hover:text-violet-600 transition-colors">
                      {dataset.name}
                    </Link>
                    <span className="text-gray-300">({dataset.row_count.toLocaleString()} rows)</span>
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Calendar className="size-3" />
                  {new Date(visualisation.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {dataset && (
                <Link
                  href={`/teacher/visualisations/new?dataset=${dataset.id}`}
                  className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition hover:border-violet-300 hover:text-violet-600"
                >
                  <Pencil className="size-3.5" /> Edit in builder
                </Link>
              )}
            </div>
          </div>
        </motion.div>

        {/* Chart */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}
          className="rounded-2xl border border-gray-100 bg-white shadow-sm p-6"
        >
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-800">{cfg.title || nameInput}</p>
            {cfg.filterColumn && cfg.filterValue && (
              <span className="text-xs text-gray-500 bg-gray-100 rounded-full px-2.5 py-1">
                Filter: {cfg.filterColumn} {cfg.filterOperator} {cfg.filterValue}
              </span>
            )}
          </div>

          {!dataset ? (
            <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50">
              <p className="text-sm text-gray-500">No dataset linked to this visualisation</p>
            </div>
          ) : loadingRows ? (
            <div className="flex h-64 items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
                <p className="text-sm text-gray-500">Loading data…</p>
              </div>
            </div>
          ) : rowError ? (
            <div className="flex h-64 items-center justify-center">
              <p className="text-sm text-red-500">{rowError}</p>
            </div>
          ) : mounted ? (
            <ChartRenderer chartType={visualisation.chart_type} config={cfg} rows={rows} />
          ) : (
            <div className="flex h-64 items-center justify-center">
              <p className="text-sm text-gray-500">Rendering…</p>
            </div>
          )}

          {rows.length > 0 && (
            <p className="mt-3 text-xs text-gray-300">
              Showing first {rows.length.toLocaleString()} of {dataset?.row_count.toLocaleString()} rows
            </p>
          )}
        </motion.div>

        {/* Config summary */}
        {(cfg.xAxis || cfg.yAxis) && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5"
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">Configuration</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {cfg.xAxis && (
                <div className="rounded-xl bg-gray-50 px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500">X Axis</p>
                  <p className="mt-0.5 text-sm font-semibold text-gray-800 truncate">{cfg.xAxis}</p>
                </div>
              )}
              {cfg.yAxis && (
                <div className="rounded-xl bg-gray-50 px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500">Y Axis</p>
                  <p className="mt-0.5 text-sm font-semibold text-gray-800 truncate">{cfg.yAxis}</p>
                </div>
              )}
              {cfg.aggregation && (
                <div className="rounded-xl bg-gray-50 px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500">Aggregation</p>
                  <p className="mt-0.5 text-sm font-semibold text-gray-800 capitalize">{cfg.aggregation}</p>
                </div>
              )}
              {cfg.filterColumn && (
                <div className="rounded-xl bg-gray-50 px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500">Filter</p>
                  <p className="mt-0.5 text-sm font-semibold text-gray-800 truncate">{cfg.filterColumn}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </DashboardLayout>
  );
}
