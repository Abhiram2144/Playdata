import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import { GetServerSidePropsResult } from 'next';
import {
  Database, FolderPlus, BarChart3,
  BarChart2, TrendingUp, PieChart as PieIcon, Maximize2, AlignLeft,
  ArrowLeft, Save, Eye, EyeOff, Info,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { type NavItem } from '@/components/layout/Sidebar';
import { withAuth } from '@/lib/auth';
import { createClientFromContext } from '@/lib/supabase/server-props';
import { createAdminClient } from '@/lib/supabase/admin';

// ── Types ────────────────────────────────────────────────────────────────────
type ChartType = 'bar' | 'line' | 'pie' | 'scatter' | 'histogram';
type ColType = 'number' | 'string' | 'boolean' | 'date';
type Aggregation = 'mean' | 'sum' | 'count';
type FilterOp = '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains';

interface ColumnSchema { name: string; type: ColType }

interface Dataset {
  id: string;
  name: string;
  row_count: number;
  schema: { columns: ColumnSchema[] };
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
  dataset: Dataset;
  visibleColumns: string[];
}

// Config stored verbatim in visualisations.config JSONB
interface VizConfig {
  title: string;
  xAxis: string;
  yAxis: string;
  aggregation: Aggregation;
  filterColumn: string;
  filterOperator: FilterOp;
  filterValue: string;
}

// ── Server-side ──────────────────────────────────────────────────────────────
export const getServerSideProps = withAuth(
  async (context, userId): Promise<GetServerSidePropsResult<Props>> => {
    const datasetId = context.query.dataset as string | undefined;
    if (!datasetId) {
      return { redirect: { destination: '/teacher/datasets', permanent: false } };
    }

    const supabase = createClientFromContext(context);
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, subject_taught, institution_role, created_at')
      .eq('id', userId)
      .single();

    if (!profile) return { redirect: { destination: '/auth/login', permanent: false } };

    const admin = createAdminClient();

    const [{ data: dataset }, { data: vcRows }] = await Promise.all([
      admin
        .from('datasets')
        .select('id, name, row_count, schema')
        .eq('id', datasetId)
        .eq('teacher_id', userId)
        .maybeSingle(),
      admin
        .from('dataset_visible_columns')
        .select('column_name')
        .eq('dataset_id', datasetId),
    ]);

    if (!dataset) return { notFound: true };

    return {
      props: {
        profile,
        dataset: dataset as unknown as Dataset,
        visibleColumns: (vcRows ?? []).map((r) => r.column_name),
      },
    };
  },
  { allowedRoles: ['teacher'] }
);

// ── Constants ────────────────────────────────────────────────────────────────
const NAV_ITEMS: NavItem[] = [
  { href: '/teacher/dashboard', label: 'Dashboard', icon: Database },
  { href: '/teacher/datasets', label: 'Datasets', icon: FolderPlus },
  { href: '/teacher/visualisations', label: 'Visualisations', icon: BarChart3 },
];

const CHART_TYPES: { type: ChartType; label: string; icon: React.ElementType }[] = [
  { type: 'bar', label: 'Bar', icon: BarChart2 },
  { type: 'line', label: 'Line', icon: TrendingUp },
  { type: 'pie', label: 'Pie', icon: PieIcon },
  { type: 'scatter', label: 'Scatter', icon: Maximize2 },
  { type: 'histogram', label: 'Histogram', icon: AlignLeft },
];

const VIZ_COLORS = ['#8b5cf6', '#a78bfa', '#6d28d9', '#c4b5fd', '#7c3aed', '#ede9fe', '#4c1d95'];

const TOOLTIP_STYLE = {
  backgroundColor: '#11111f',
  border: '1px solid #35354a',
  borderRadius: '12px',
  color: '#c9c9d4',
  fontSize: 12,
};

const AXIS_STYLE = { fill: '#6a6a80', fontSize: 11 };

// ── Data helpers ─────────────────────────────────────────────────────────────
function applyFilter(
  rows: Record<string, unknown>[],
  col: string,
  op: FilterOp,
  val: string,
): Record<string, unknown>[] {
  if (!col || !val) return rows;
  return rows.filter((r) => {
    const v = String(r[col] ?? '');
    switch (op) {
      case '==': return v === val;
      case '!=': return v !== val;
      case '>':  return Number(v) > Number(val);
      case '<':  return Number(v) < Number(val);
      case '>=': return Number(v) >= Number(val);
      case '<=': return Number(v) <= Number(val);
      case 'contains': return v.toLowerCase().includes(val.toLowerCase());
      default: return true;
    }
  });
}

function groupAggregate(
  rows: Record<string, unknown>[],
  xCol: string,
  yCol: string,
  agg: Aggregation,
): { name: string; value: number }[] {
  const groups = new Map<string, number[]>();
  const order: string[] = [];
  for (const r of rows) {
    const key = String(r[xCol] ?? '—');
    if (!groups.has(key)) { groups.set(key, []); order.push(key); }
    const n = parseFloat(String(r[yCol] ?? ''));
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

function buildHistBins(rows: Record<string, unknown>[], col: string): { bin: string; count: number }[] {
  const vals = rows.map((r) => parseFloat(String(r[col] ?? ''))).filter((v) => !isNaN(v));
  if (vals.length === 0) return [];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const numBins = 10;
  const width = (max - min) / numBins || 1;
  const bins = Array.from({ length: numBins }, (_, i) => ({
    bin: `${(min + i * width).toFixed(2)}`,
    count: 0,
  }));
  for (const v of vals) {
    const idx = Math.min(Math.floor((v - min) / width), numBins - 1);
    bins[idx].count++;
  }
  return bins;
}

// ── Chart renderer ───────────────────────────────────────────────────────────
function ChartPane({
  chartType,
  config,
  rows,
}: {
  chartType: ChartType;
  config: VizConfig;
  rows: Record<string, unknown>[];
}) {
  const filtered = useMemo(() => {
    return config.filterColumn && config.filterValue
      ? applyFilter(rows, config.filterColumn, config.filterOperator, config.filterValue)
      : rows;
  }, [rows, config.filterColumn, config.filterOperator, config.filterValue]);

  const hasX = !!config.xAxis;
  const hasY = !!config.yAxis;

  if (chartType === 'scatter') {
    if (!hasX || !hasY) return <EmptyChart msg="Select X and Y columns" />;
    const data = filtered
      .map((r) => ({
        x: parseFloat(String(r[config.xAxis] ?? '')),
        y: parseFloat(String(r[config.yAxis] ?? '')),
      }))
      .filter((p) => !isNaN(p.x) && !isNaN(p.y));
    if (!data.length) return <EmptyChart msg="No valid numeric pairs found" />;
    return (
      <ResponsiveContainer width="100%" height={320}>
        <ScatterChart>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3d" />
          <XAxis type="number" dataKey="x" name={config.xAxis} tick={AXIS_STYLE} />
          <YAxis type="number" dataKey="y" name={config.yAxis} tick={AXIS_STYLE} />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ strokeDasharray: '3 3' }} />
          <Scatter data={data} fill="#8b5cf6" fillOpacity={0.7} />
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'histogram') {
    if (!hasX) return <EmptyChart msg="Select a value column" />;
    const data = buildHistBins(filtered, config.xAxis);
    if (!data.length) return <EmptyChart msg="No numeric values found" />;
    return (
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} barCategoryGap="2%">
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3d" />
          <XAxis dataKey="bin" tick={AXIS_STYLE} label={{ value: config.xAxis, position: 'insideBottom', offset: -2, fill: '#6a6a80', fontSize: 11 }} />
          <YAxis tick={AXIS_STYLE} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="count" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'pie') {
    if (!hasX) return <EmptyChart msg="Select a category column" />;
    const data = hasY
      ? groupAggregate(filtered, config.xAxis, config.yAxis, config.aggregation).slice(0, 12)
      : (() => {
          const counts = new Map<string, number>();
          for (const r of filtered) {
            const k = String(r[config.xAxis] ?? '—');
            counts.set(k, (counts.get(k) ?? 0) + 1);
          }
          return [...counts.entries()]
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 12);
        })();
    if (!data.length) return <EmptyChart msg="No data to display" />;
    return (
      <ResponsiveContainer width="100%" height={320}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} labelLine={false}>
            {data.map((_, i) => (
              <Cell key={i} fill={VIZ_COLORS[i % VIZ_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ color: '#8d8da0', fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  // bar and line
  if (!hasX || !hasY) return <EmptyChart msg="Select X and Y columns" />;
  const data = groupAggregate(filtered, config.xAxis, config.yAxis, config.aggregation);
  if (!data.length) return <EmptyChart msg="No data to display" />;

  if (chartType === 'line') {
    return (
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3d" />
          <XAxis dataKey="name" tick={AXIS_STYLE} />
          <YAxis tick={AXIS_STYLE} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Line type="monotone" dataKey="value" stroke="#8b5cf6" strokeWidth={2} dot={data.length < 30} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3d" />
        <XAxis dataKey="name" tick={AXIS_STYLE} />
        <YAxis tick={AXIS_STYLE} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Bar dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function EmptyChart({ msg }: { msg: string }) {
  return (
    <div className="flex h-[320px] items-center justify-center rounded-xl border border-dashed border-[#35354a]/50">
      <p className="text-sm text-[#4a4a60]">{msg}</p>
    </div>
  );
}

// ── Field-mapping helpers ─────────────────────────────────────────────────────
const FIELD_LABELS: Record<ChartType, { x: string; y: string | null; showAgg: boolean }> = {
  bar:       { x: 'X axis (category)',      y: 'Y axis (numeric)',   showAgg: true  },
  line:      { x: 'X axis',                 y: 'Y axis (numeric)',   showAgg: true  },
  pie:       { x: 'Category column',        y: 'Value column (opt)', showAgg: true  },
  scatter:   { x: 'X axis (numeric)',        y: 'Y axis (numeric)',   showAgg: false },
  histogram: { x: 'Value column (numeric)', y: null,                 showAgg: false },
};

const FILTER_OPS: { op: FilterOp; label: string }[] = [
  { op: '==', label: '= equals' },
  { op: '!=', label: '≠ not equals' },
  { op: '>',  label: '> greater than' },
  { op: '<',  label: '< less than' },
  { op: '>=', label: '≥ ≥' },
  { op: '<=', label: '≤ ≤' },
  { op: 'contains', label: 'contains (text)' },
];

// ── Select component ─────────────────────────────────────────────────────────
function ColSelect({
  label,
  value,
  onChange,
  cols,
  optional,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  cols: ColumnSchema[];
  optional?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[#8d8da0]">
        {label}
        {hint && <span className="ml-1 text-[#4a4a60]">({hint})</span>}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-[#35354a] bg-[#0f0f1d] px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
      >
        <option value="">{optional ? '— none —' : '— select —'}</option>
        {cols.map((c) => (
          <option key={c.name} value={c.name}>
            {c.name} ({c.type})
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function NewVisualisation({ profile, dataset, visibleColumns }: Props) {
  const router = useRouter();
  const schema: ColumnSchema[] = dataset.schema?.columns ?? [];

  const [chartType, setChartType] = useState<ChartType>('bar');
  const [config, setConfig] = useState<VizConfig>({
    title: dataset.name,
    xAxis: '',
    yAxis: '',
    aggregation: 'mean',
    filterColumn: '',
    filterOperator: '==',
    filterValue: '',
  });
  const [useVisibleOnly, setUseVisibleOnly] = useState(true);
  const [isTemplate, setIsTemplate] = useState(false);

  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [rowError, setRowError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    (async () => {
      setLoadingRows(true);
      setRowError(null);
      const res = await fetch(`/api/teacher/datasets/${dataset.id}/rows?page=0&pageSize=200`);
      const data = await res.json();
      setLoadingRows(false);
      if (!res.ok) { setRowError(data.error ?? 'Failed to load data'); return; }
      setRows(data.rows ?? []);
    })();
  }, [dataset.id]);

  const patchConfig = useCallback((patch: Partial<VizConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  // Columns available for the current "visible only" toggle
  const availableCols = useMemo(() => {
    if (useVisibleOnly && visibleColumns.length > 0) {
      return schema.filter((c) => visibleColumns.includes(c.name));
    }
    return schema;
  }, [schema, visibleColumns, useVisibleOnly]);

  const numericCols = useMemo(() => availableCols.filter((c) => c.type === 'number'), [availableCols]);

  const fieldMeta = FIELD_LABELS[chartType];

  const xCols = chartType === 'scatter' || chartType === 'histogram' ? numericCols : availableCols;
  const yCols = numericCols;

  // Reset axis picks when chart type changes (so stale picks don't confuse charts)
  const handleChartTypeChange = (ct: ChartType) => {
    setChartType(ct);
    patchConfig({ xAxis: '', yAxis: '' });
  };

  const handleSave = async () => {
    if (!config.title.trim()) { setSaveError('Please enter a title.'); return; }
    setSaving(true);
    setSaveError(null);
    const payload = {
      dataset_id: dataset.id,
      name: config.title.trim(),
      chart_type: chartType,
      config: { ...config, useVisibleColumnsOnly: useVisibleOnly },
      is_template: isTemplate,
    };
    const res = await fetch('/api/teacher/visualisations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setSaveError(data.error ?? 'Save failed'); return; }
    router.push('/teacher/visualisations');
  };

  return (
    <DashboardLayout navItems={NAV_ITEMS} profile={profile}>
      <div className="max-w-7xl space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push(`/teacher/datasets/${dataset.id}`)}
            className="flex items-center gap-1.5 text-sm text-[#6a6a80] hover:text-violet-400 transition-colors"
          >
            <ArrowLeft className="size-3.5" /> Back to {dataset.name}
          </button>
          <span className="rounded-full border border-[#35354a]/60 bg-[#151526] px-3 py-1 text-xs text-[#6a6a80]">
            {dataset.row_count.toLocaleString()} rows
            {rows.length < dataset.row_count && rows.length > 0 && (
              <span className="ml-1 text-[#4a4a60]">(preview: first {rows.length})</span>
            )}
          </span>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]"
        >
          {/* ── Settings pane ───────────────────────────────── */}
          <div className="space-y-4 lg:max-h-[calc(100vh-140px)] lg:overflow-y-auto lg:pr-1">

            {/* Chart type */}
            <div className="rounded-2xl border border-[#35354a]/60 bg-[#11111f]/80 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[#6a6a80]">Chart type</p>
              <div className="grid grid-cols-5 gap-1.5">
                {CHART_TYPES.map(({ type, label, icon: Icon }) => (
                  <button
                    key={type}
                    onClick={() => handleChartTypeChange(type)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl py-3 text-xs font-semibold transition ${
                      chartType === type
                        ? 'bg-violet-600 text-white'
                        : 'border border-[#35354a] text-[#6a6a80] hover:border-violet-500/40 hover:text-violet-300'
                    }`}
                  >
                    <Icon className="size-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div className="rounded-2xl border border-[#35354a]/60 bg-[#11111f]/80 p-4">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-[#6a6a80]">
                Display title
              </label>
              <input
                value={config.title}
                onChange={(e) => patchConfig({ title: e.target.value })}
                placeholder="Enter chart title…"
                className="w-full rounded-xl border border-[#35354a] bg-[#0f0f1d] px-3 py-2 text-sm text-white placeholder-[#4a4a60] focus:border-violet-500 focus:outline-none"
              />
            </div>

            {/* Column source */}
            <div className="rounded-2xl border border-[#35354a]/60 bg-[#11111f]/80 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-[#6a6a80]">Column source</p>
                  <p className="mt-0.5 text-xs text-[#4a4a60]">
                    {useVisibleOnly
                      ? `Student-visible only (${visibleColumns.length} of ${schema.length})`
                      : `All columns (${schema.length})`}
                  </p>
                </div>
                <button
                  onClick={() => setUseVisibleOnly((v) => !v)}
                  className="flex items-center gap-1.5 rounded-xl border border-[#35354a] px-3 py-1.5 text-xs font-semibold text-[#8d8da0] transition hover:border-violet-500/40 hover:text-violet-300"
                >
                  {useVisibleOnly ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                  {useVisibleOnly ? 'Visible-only' : 'All cols'}
                </button>
              </div>
            </div>

            {/* Field mapping */}
            <div className="rounded-2xl border border-[#35354a]/60 bg-[#11111f]/80 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#6a6a80]">Field mapping</p>

              <ColSelect
                label={fieldMeta.x}
                value={config.xAxis}
                onChange={(v) => patchConfig({ xAxis: v })}
                cols={xCols}
              />

              {fieldMeta.y !== null && (
                <ColSelect
                  label={fieldMeta.y}
                  value={config.yAxis}
                  onChange={(v) => patchConfig({ yAxis: v })}
                  cols={yCols}
                  optional={chartType === 'pie'}
                  hint={chartType === 'pie' ? 'leave blank to count rows' : undefined}
                />
              )}

              {fieldMeta.showAgg && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#8d8da0]">Aggregation</label>
                  <select
                    value={config.aggregation}
                    onChange={(e) => patchConfig({ aggregation: e.target.value as Aggregation })}
                    className="w-full rounded-xl border border-[#35354a] bg-[#0f0f1d] px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                  >
                    <option value="mean">Mean (average)</option>
                    <option value="sum">Sum (total)</option>
                    <option value="count">Count (rows per group)</option>
                  </select>
                </div>
              )}
            </div>

            {/* Filter */}
            <div className="rounded-2xl border border-[#35354a]/60 bg-[#11111f]/80 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#6a6a80]">Filter (optional)</p>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#8d8da0]">Column</label>
                <select
                  value={config.filterColumn}
                  onChange={(e) => patchConfig({ filterColumn: e.target.value, filterValue: '' })}
                  className="w-full rounded-xl border border-[#35354a] bg-[#0f0f1d] px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                >
                  <option value="">— no filter —</option>
                  {availableCols.map((c) => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>

              {config.filterColumn && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#8d8da0]">Condition</label>
                    <select
                      value={config.filterOperator}
                      onChange={(e) => patchConfig({ filterOperator: e.target.value as FilterOp })}
                      className="w-full rounded-xl border border-[#35354a] bg-[#0f0f1d] px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                    >
                      {FILTER_OPS.map(({ op, label }) => (
                        <option key={op} value={op}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#8d8da0]">Value</label>
                    <input
                      value={config.filterValue}
                      onChange={(e) => patchConfig({ filterValue: e.target.value })}
                      placeholder="Filter value…"
                      className="w-full rounded-xl border border-[#35354a] bg-[#0f0f1d] px-3 py-2 text-sm text-white placeholder-[#4a4a60] focus:border-violet-500 focus:outline-none"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Save options */}
            <div className="rounded-2xl border border-[#35354a]/60 bg-[#11111f]/80 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#6a6a80]">Save</p>

              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={isTemplate}
                  onChange={(e) => setIsTemplate(e.target.checked)}
                  className="mt-0.5 accent-violet-500"
                />
                <div>
                  <p className="text-sm font-medium text-white">Save as template</p>
                  <p className="text-xs text-[#6a6a80]">Reuse this chart config with other datasets of the same shape.</p>
                </div>
              </label>

              {saveError && (
                <p className="rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-400">
                  {saveError}
                </p>
              )}

              <button
                onClick={handleSave}
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:bg-violet-500/50 disabled:cursor-not-allowed"
              >
                <Save className="size-4" />
                {saving ? 'Saving…' : 'Save visualisation'}
              </button>
            </div>
          </div>

          {/* ── Preview pane ────────────────────────────────── */}
          <div className="lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-2xl border border-[#35354a]/60 bg-[#11111f]/80 p-6">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-semibold text-white">
                  {config.title || 'Untitled chart'}
                </p>
                <span className="rounded-full border border-[#35354a]/60 bg-[#151526] px-2.5 py-0.5 text-xs text-[#6a6a80] capitalize">
                  {chartType}
                </span>
              </div>

              {loadingRows ? (
                <div className="flex h-[320px] items-center justify-center">
                  <p className="text-sm text-[#6a6a80]">Loading data…</p>
                </div>
              ) : rowError ? (
                <div className="flex h-[320px] items-center justify-center">
                  <p className="text-sm text-red-400">{rowError}</p>
                </div>
              ) : mounted ? (
                <ChartPane chartType={chartType} config={config} rows={rows} />
              ) : (
                <div className="flex h-[320px] items-center justify-center">
                  <p className="text-sm text-[#4a4a60]">Rendering…</p>
                </div>
              )}

              {rows.length > 0 && (
                <div className="mt-3 flex items-center gap-1 text-xs text-[#4a4a60]">
                  <Info className="size-3 shrink-0" />
                  Preview uses first {rows.length} rows. Full dataset at save time.
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
