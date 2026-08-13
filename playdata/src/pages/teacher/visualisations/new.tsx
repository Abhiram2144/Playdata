import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import { GetServerSidePropsResult } from 'next';
import {
  Database, FolderPlus, BarChart3,
  BarChart2, TrendingUp, PieChart as PieIcon, Maximize2, AlignLeft,
  ArrowLeft, Save, Eye, EyeOff, Info,
} from 'lucide-react';
import Link from 'next/link';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { type NavItem } from '@/components/layout/Sidebar';
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
const NAV_ITEMS = TEACHER_NAV;

const CHART_TYPES: { type: ChartType; label: string; icon: React.ElementType }[] = [
  { type: 'bar', label: 'Bar', icon: BarChart2 },
  { type: 'line', label: 'Line', icon: TrendingUp },
  { type: 'pie', label: 'Pie', icon: PieIcon },
  { type: 'scatter', label: 'Scatter', icon: Maximize2 },
  { type: 'histogram', label: 'Histogram', icon: AlignLeft },
];

// ── Smart number parser ──────────────────────────────────────────────────────
function smartParseNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim().replace(/[$£€%,]/g, '');
  return parseFloat(s);
}

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

function buildHistBins(rows: Record<string, unknown>[], col: string): { bin: string; count: number }[] {
  const vals = rows.map((r) => smartParseNumber(r[col])).filter((v) => !isNaN(v));
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

// ── Empty chart with contextual hints ────────────────────────────────────────
function EmptyChart({ chartType, hasX, hasY }: { chartType: ChartType; hasX: boolean; hasY: boolean }) {
  let msg: string;
  if (chartType === 'scatter') {
    msg = 'Scatter needs two numeric columns — X and Y';
  } else if (chartType === 'histogram') {
    msg = 'Choose a numeric column to distribute into bins';
  } else if (chartType === 'pie' && !hasX) {
    msg = 'Choose a category column (e.g. team, game mode)';
  } else if ((chartType === 'bar' || chartType === 'line') && !hasX) {
    msg = 'Choose a category for the X axis (e.g. player name, team)';
  } else if ((chartType === 'bar' || chartType === 'line') && !hasY) {
    msg = 'Choose a numeric column for the Y axis';
  } else {
    msg = 'No data to display';
  }
  return (
    <div className="flex h-[320px] items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50">
      <p className="text-sm text-gray-500 text-center px-4">{msg}</p>
    </div>
  );
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
    if (!hasX || !hasY) return <EmptyChart chartType={chartType} hasX={hasX} hasY={hasY} />;
    const data = filtered
      .map((r) => ({
        x: smartParseNumber(r[config.xAxis]),
        y: smartParseNumber(r[config.yAxis]),
      }))
      .filter((p) => !isNaN(p.x) && !isNaN(p.y));
    if (!data.length) return <EmptyChart chartType={chartType} hasX={hasX} hasY={hasY} />;
    return (
      <ResponsiveContainer width="100%" height={320}>
        <ScatterChart>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis type="number" dataKey="x" name={config.xAxis} tick={CHART_AXIS_STYLE} />
          <YAxis type="number" dataKey="y" name={config.yAxis} tick={CHART_AXIS_STYLE} />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ strokeDasharray: '3 3' }} />
          <Scatter data={data} fill={CHART_PRIMARY} fillOpacity={0.7} />
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'histogram') {
    if (!hasX) return <EmptyChart chartType={chartType} hasX={hasX} hasY={hasY} />;
    const data = buildHistBins(filtered, config.xAxis);
    if (!data.length) return <EmptyChart chartType={chartType} hasX={hasX} hasY={hasY} />;
    return (
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} barCategoryGap="2%">
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="bin" tick={CHART_AXIS_STYLE} label={{ value: config.xAxis, position: 'insideBottom', offset: -2, fill: CHART_AXIS_STYLE.fill, fontSize: 11 }} />
          <YAxis tick={CHART_AXIS_STYLE} />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
          <Bar dataKey="count" fill={CHART_PRIMARY} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'pie') {
    if (!hasX) return <EmptyChart chartType={chartType} hasX={hasX} hasY={hasY} />;
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
    if (!data.length) return <EmptyChart chartType={chartType} hasX={hasX} hasY={hasY} />;
    return (
      <ResponsiveContainer width="100%" height={320}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110} label={({ name, percent = 0 }) => `${name} (${(percent * 100).toFixed(0)}%)`} labelLine={false}>
            {data.map((_, i) => (
              <Cell key={i} fill={categoricalColor(i)} stroke={CHART_PIE_STROKE} strokeWidth={1} />
            ))}
          </Pie>
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ color: CHART_AXIS_STYLE.fill, fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (!hasX || !hasY) return <EmptyChart chartType={chartType} hasX={hasX} hasY={hasY} />;
  const data = groupAggregate(filtered, config.xAxis, config.yAxis, config.aggregation);
  if (!data.length) return <EmptyChart chartType={chartType} hasX={hasX} hasY={hasY} />;

  if (chartType === 'line') {
    return (
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="name" tick={CHART_AXIS_STYLE} />
          <YAxis tick={CHART_AXIS_STYLE} />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
          <Line type="monotone" dataKey="value" stroke={CHART_PRIMARY} strokeWidth={2} dot={data.length < 30} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="name" tick={CHART_AXIS_STYLE} />
        <YAxis tick={CHART_AXIS_STYLE} />
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
        <Bar dataKey="value" fill={CHART_PRIMARY} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
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

// ── Col select with type prefix ───────────────────────────────────────────────
const TYPE_PREFIX: Record<ColType, string> = {
  number: '#',
  string: 'Aa',
  date: '◷',
  boolean: '✓',
};

function ColSelect({
  label,
  value,
  onChange,
  cols,
  optional,
  hint,
  coercibleNames,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  cols: ColumnSchema[];
  optional?: boolean;
  hint?: string;
  coercibleNames?: string[];
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-500">
        {label}
        {hint && <span className="ml-1 text-gray-500">({hint})</span>}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-violet-400 focus:outline-none"
      >
        <option value="">{optional ? '— none —' : '— select —'}</option>
        {cols.map((c) => {
          const prefix = TYPE_PREFIX[c.type] ?? '?';
          const coercibleSuffix = coercibleNames?.includes(c.name) ? ' (~numeric)' : '';
          return (
            <option key={c.name} value={c.name}>
              {prefix} {c.name}{coercibleSuffix}
            </option>
          );
        })}
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
  const [coercibleCols, setCoercibleCols] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const patchConfig = useCallback((patch: Partial<VizConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const availableCols = useMemo(() => {
    if (useVisibleOnly && visibleColumns.length > 0) {
      return schema.filter((c) => visibleColumns.includes(c.name));
    }
    return schema;
  }, [schema, visibleColumns, useVisibleOnly]);

  const numericCols = useMemo(() => {
    const trueNum = availableCols.filter(c => c.type === 'number');
    const coercible = availableCols.filter(c => coercibleCols.includes(c.name));
    const seen = new Set(trueNum.map(c => c.name));
    return [...trueNum, ...coercible.filter(c => !seen.has(c.name))];
  }, [availableCols, coercibleCols]);

  useEffect(() => {
    (async () => {
      setLoadingRows(true);
      setRowError(null);
      const res = await fetch(`/api/teacher/datasets/${dataset.id}/rows?page=0&pageSize=200`);
      const data = await res.json();
      setLoadingRows(false);
      if (!res.ok) { setRowError(data.error ?? 'Failed to load data'); return; }
      const newRows: Record<string, unknown>[] = data.rows ?? [];
      setRows(newRows);

      const coercible: string[] = [];
      for (const col of schema) {
        if (col.type !== 'string') continue;
        const vals = newRows.map((r: Record<string, unknown>) => r[col.name]).filter(v => v !== null && v !== '' && v !== undefined);
        if (vals.length < 3) continue;
        const parseable = vals.filter(v => !isNaN(smartParseNumber(v)));
        if (parseable.length / vals.length >= 0.7) coercible.push(col.name);
      }
      setCoercibleCols(coercible);

      setConfig(prev => {
        if (prev.xAxis !== '') return prev;

        const trueNumeric = schema.filter(c => c.type === 'number');
        const coercibleSchemas = schema.filter(c => coercible.includes(c.name));
        const seenNum = new Set(trueNumeric.map(c => c.name));
        const anyNumeric = [...trueNumeric, ...coercibleSchemas.filter(c => !seenNum.has(c.name))];
        const anyNumericNames = new Set(anyNumeric.map(c => c.name));
        const categorical = schema.filter(c => !anyNumericNames.has(c.name));

        let suggestX = '';
        let suggestY = '';

        if (prev.xAxis === '') {
          if (chartType === 'bar' || chartType === 'line') {
            suggestX = categorical[0]?.name ?? schema[0]?.name ?? '';
            suggestY = anyNumeric[0]?.name ?? '';
          } else if (chartType === 'pie') {
            let bestCat = categorical[0];
            let bestCount = Infinity;
            for (const col of categorical) {
              const unique = new Set(newRows.map(r => String(r[col.name] ?? ''))).size;
              if (unique <= 20 && unique < bestCount) { bestCat = col; bestCount = unique; }
            }
            suggestX = bestCat?.name ?? categorical[0]?.name ?? '';
            suggestY = anyNumeric[0]?.name ?? '';
          } else if (chartType === 'scatter') {
            suggestX = anyNumeric[0]?.name ?? '';
            suggestY = anyNumeric[1]?.name ?? anyNumeric[0]?.name ?? '';
          } else if (chartType === 'histogram') {
            suggestX = anyNumeric[0]?.name ?? '';
          }
        }

        if (!suggestX && !suggestY) return prev;
        return { ...prev, ...(suggestX ? { xAxis: suggestX } : {}), ...(suggestY ? { yAxis: suggestY } : {}) };
      });
    })();
  }, [dataset.id]);

  const fieldMeta = FIELD_LABELS[chartType];
  const xCols = chartType === 'scatter' || chartType === 'histogram' ? numericCols : availableCols;
  const yCols = numericCols;

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

  const xUniqueCount = useMemo(() => {
    if (!config.xAxis || rows.length === 0) return null;
    return new Set(rows.map(r => String(r[config.xAxis] ?? ''))).size;
  }, [rows, config.xAxis]);

  const filterUniqueValues = useMemo(() => {
    if (!config.filterColumn || rows.length === 0) return [];
    const vals = [...new Set(rows.map(r => String(r[config.filterColumn] ?? '')).filter(Boolean))].sort();
    return vals.slice(0, 50);
  }, [rows, config.filterColumn]);

  const showNoNumericBanner = rows.length > 0 && numericCols.length === 0 && coercibleCols.length === 0;

  return (
    <DashboardLayout navItems={NAV_ITEMS} profile={profile}>
      <div className="max-w-7xl space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push(`/teacher/datasets/${dataset.id}`)}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-violet-600 transition-colors"
          >
            <ArrowLeft className="size-3.5" /> Back to {dataset.name}
          </button>
          <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-500">
            {dataset.row_count.toLocaleString()} rows
            {rows.length < dataset.row_count && rows.length > 0 && (
              <span className="ml-1 text-gray-500">(preview: first {rows.length})</span>
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
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">Chart type</p>
              <div className="grid grid-cols-5 gap-1.5">
                {CHART_TYPES.map(({ type, label, icon: Icon }) => (
                  <button
                    key={type}
                    onClick={() => handleChartTypeChange(type)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl py-3 text-xs font-semibold transition ${
                      chartType === type
                        ? 'bg-violet-600 text-white'
                        : 'border border-gray-200 text-gray-500 hover:border-violet-300 hover:text-violet-600'
                    }`}
                  >
                    <Icon className="size-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-gray-500">
                Display title
              </label>
              <input
                value={config.title}
                onChange={(e) => patchConfig({ title: e.target.value })}
                placeholder="Enter chart title…"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-violet-400 focus:outline-none"
              />
            </div>

            {/* Column source */}
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Column source</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {useVisibleOnly
                      ? `Student-visible only (${visibleColumns.length} of ${schema.length})`
                      : `All columns (${schema.length})`}
                  </p>
                </div>
                <button
                  onClick={() => setUseVisibleOnly((v) => !v)}
                  className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 transition hover:border-violet-300 hover:text-violet-600"
                >
                  {useVisibleOnly ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                  {useVisibleOnly ? 'Visible-only' : 'All cols'}
                </button>
              </div>
            </div>

            {/* Field mapping */}
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Field mapping</p>

              <div>
                <ColSelect
                  label={fieldMeta.x}
                  value={config.xAxis}
                  onChange={(v) => patchConfig({ xAxis: v })}
                  cols={xCols}
                  coercibleNames={coercibleCols}
                />
                {config.xAxis && xUniqueCount !== null && (chartType === 'bar' || chartType === 'pie' || chartType === 'line') && (
                  <p className="mt-1 text-xs text-gray-500">→ {xUniqueCount} unique values</p>
                )}
              </div>

              {fieldMeta.y !== null && (
                <ColSelect
                  label={fieldMeta.y}
                  value={config.yAxis}
                  onChange={(v) => patchConfig({ yAxis: v })}
                  cols={yCols}
                  optional={chartType === 'pie'}
                  hint={chartType === 'pie' ? 'leave blank to count rows' : undefined}
                  coercibleNames={coercibleCols}
                />
              )}

              {fieldMeta.showAgg && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Aggregation</label>
                  <select
                    value={config.aggregation}
                    onChange={(e) => patchConfig({ aggregation: e.target.value as Aggregation })}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-violet-400 focus:outline-none"
                  >
                    <option value="mean">Mean (average)</option>
                    <option value="sum">Sum (total)</option>
                    <option value="count">Count (rows per group)</option>
                  </select>
                </div>
              )}

              {showNoNumericBanner && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                  ⚠ No numeric columns detected — bar, line, scatter and histogram charts need at least one numeric column.{' '}
                  <Link href={`/teacher/datasets/${dataset.id}?tab=clean`} className="underline hover:text-amber-800">
                    Clean dataset
                  </Link>
                </div>
              )}
            </div>

            {/* Filter */}
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Filter (optional)</p>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Column</label>
                <select
                  value={config.filterColumn}
                  onChange={(e) => patchConfig({ filterColumn: e.target.value, filterValue: '' })}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-violet-400 focus:outline-none"
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
                    <label className="mb-1 block text-xs font-medium text-gray-500">Condition</label>
                    <select
                      value={config.filterOperator}
                      onChange={(e) => patchConfig({ filterOperator: e.target.value as FilterOp })}
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-violet-400 focus:outline-none"
                    >
                      {FILTER_OPS.map(({ op, label }) => (
                        <option key={op} value={op}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">Value</label>
                    <input
                      value={config.filterValue}
                      onChange={(e) => patchConfig({ filterValue: e.target.value })}
                      list="filter-value-options"
                      placeholder="Filter value…"
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-violet-400 focus:outline-none"
                    />
                    {filterUniqueValues.length > 0 && (
                      <datalist id="filter-value-options">
                        {filterUniqueValues.map((v) => (
                          <option key={v} value={v} />
                        ))}
                      </datalist>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Save options */}
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Save</p>

              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={isTemplate}
                  onChange={(e) => setIsTemplate(e.target.checked)}
                  className="mt-0.5 accent-violet-500"
                />
                <div>
                  <p className="text-sm font-medium text-gray-800">Save as template</p>
                  <p className="text-xs text-gray-500">Reuse this chart config with other datasets of the same shape.</p>
                </div>
              </label>

              {saveError && (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
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
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900">
                  {config.title || 'Untitled chart'}
                </p>
                <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs text-gray-500 capitalize">
                  {chartType}
                </span>
              </div>

              {loadingRows ? (
                <div className="flex h-[320px] items-center justify-center">
                  <p className="text-sm text-gray-500">Loading data…</p>
                </div>
              ) : rowError ? (
                <div className="flex h-[320px] items-center justify-center">
                  <p className="text-sm text-red-500">{rowError}</p>
                </div>
              ) : mounted ? (
                <ChartPane chartType={chartType} config={config} rows={rows} />
              ) : (
                <div className="flex h-[320px] items-center justify-center">
                  <p className="text-sm text-gray-500">Rendering…</p>
                </div>
              )}

              {rows.length > 0 && (
                <div className="mt-3 flex items-center gap-1 text-xs text-gray-500">
                  <Info className="size-3 shrink-0" />
                  Preview uses first {rows.length.toLocaleString()} of {dataset.row_count.toLocaleString()} rows.
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
