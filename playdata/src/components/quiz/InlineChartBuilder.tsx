'use client';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  X, BarChart2, TrendingUp, PieChart as PieIcon,
  Maximize2, AlignLeft, Check, Loader2,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  categoricalColor, CHART_PIE_STROKE, CHART_PRIMARY,
  CHART_TOOLTIP_STYLE, CHART_AXIS_STYLE,
} from '@/lib/chart-colors';

// ── Types ─────────────────────────────────────────────────────────────────────
type ChartType = 'bar' | 'line' | 'pie' | 'scatter' | 'histogram';
type Aggregation = 'mean' | 'sum' | 'count';
type FilterOp = '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains';

interface ColumnSchema { name: string; type: string }

interface VizConfig {
  title: string;
  xAxis: string;
  yAxis: string;
  aggregation: Aggregation;
  filterColumn: string;
  filterOperator: FilterOp;
  filterValue: string;
}

export interface CreatedVis { id: string; name: string; chart_type: string }

export interface InlineChartBuilderProps {
  columns: ColumnSchema[];
  rows: Record<string, unknown>[];
  loadingRows: boolean;
  datasetId: string;
  onCreated: (vis: CreatedVis) => void;
  onClose: () => void;
}

// ── Data helpers ──────────────────────────────────────────────────────────────
function smartNum(v: unknown): number {
  if (typeof v === 'number') return v;
  return parseFloat(String(v ?? '').trim().replace(/[$£€%,]/g, ''));
}

function applyFilter(
  rows: Record<string, unknown>[],
  col: string, op: FilterOp, val: string,
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

function groupAgg(
  rows: Record<string, unknown>[],
  xCol: string, yCol: string, agg: Aggregation,
): { name: string; value: number }[] {
  const groups = new Map<string, number[]>();
  const order: string[] = [];
  for (const r of rows) {
    const k = String(r[xCol] ?? '—');
    if (!groups.has(k)) { groups.set(k, []); order.push(k); }
    const n = smartNum(r[yCol]);
    if (!isNaN(n)) groups.get(k)!.push(n);
  }
  return order.map((k) => {
    const vals = groups.get(k)!;
    const value =
      agg === 'count' ? vals.length
      : agg === 'sum'  ? vals.reduce((a, b) => a + b, 0)
      : vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    return { name: k, value: parseFloat(value.toFixed(4)) };
  }).slice(0, 50);
}

function histBins(rows: Record<string, unknown>[], col: string): { bin: string; count: number }[] {
  const vals = rows.map((r) => smartNum(r[col])).filter((v) => !isNaN(v));
  if (!vals.length) return [];
  const min = Math.min(...vals), max = Math.max(...vals);
  const w = (max - min) / 10 || 1;
  const bins = Array.from({ length: 10 }, (_, i) => ({
    bin: (min + i * w).toFixed(2), count: 0,
  }));
  for (const v of vals) bins[Math.min(Math.floor((v - min) / w), 9)].count++;
  return bins;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const CHART_TYPES: { type: ChartType; label: string; icon: React.ElementType }[] = [
  { type: 'bar',       label: 'Bar',       icon: BarChart2  },
  { type: 'line',      label: 'Line',      icon: TrendingUp },
  { type: 'pie',       label: 'Pie',       icon: PieIcon    },
  { type: 'scatter',   label: 'Scatter',   icon: Maximize2  },
  { type: 'histogram', label: 'Histogram', icon: AlignLeft  },
];

const FIELD_META: Record<ChartType, { x: string; y: string | null; showAgg: boolean }> = {
  bar:       { x: 'X axis (category)',      y: 'Y axis (numeric)',   showAgg: true  },
  line:      { x: 'X axis',                 y: 'Y axis (numeric)',   showAgg: true  },
  pie:       { x: 'Category column',        y: 'Value column (opt)', showAgg: true  },
  scatter:   { x: 'X axis (numeric)',        y: 'Y axis (numeric)',   showAgg: false },
  histogram: { x: 'Value column (numeric)', y: null,                 showAgg: false },
};

const FILTER_OPS: { op: FilterOp; label: string }[] = [
  { op: '==',       label: '= equals'       },
  { op: '!=',       label: '≠ not equals'   },
  { op: '>',        label: '> greater than' },
  { op: '<',        label: '< less than'    },
  { op: '>=',       label: '≥ ≥'            },
  { op: '<=',       label: '≤ ≤'            },
  { op: 'contains', label: 'contains (text)'},
];

// ── Sub-components ────────────────────────────────────────────────────────────
function EmptyHint({ chartType, hasX, hasY }: { chartType: ChartType; hasX: boolean; hasY: boolean }) {
  const msg =
    chartType === 'scatter'   ? 'Scatter needs two numeric columns — X and Y'
    : chartType === 'histogram' ? 'Choose a numeric column'
    : chartType === 'pie' && !hasX ? 'Choose a category column'
    : !hasX ? 'Choose an X axis column'
    : 'Choose a Y axis column';
  return (
    <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50">
      <p className="px-6 text-center text-sm text-gray-500">{msg}</p>
    </div>
  );
}

function ChartPreview({
  chartType, config, rows,
}: { chartType: ChartType; config: VizConfig; rows: Record<string, unknown>[] }) {
  const filtered = config.filterColumn && config.filterValue
    ? applyFilter(rows, config.filterColumn, config.filterOperator, config.filterValue)
    : rows;
  const hasX = !!config.xAxis, hasY = !!config.yAxis;

  if (chartType === 'scatter') {
    if (!hasX || !hasY) return <EmptyHint chartType={chartType} hasX={hasX} hasY={hasY} />;
    const data = filtered
      .map((r) => ({ x: smartNum(r[config.xAxis]), y: smartNum(r[config.yAxis]) }))
      .filter((p) => !isNaN(p.x) && !isNaN(p.y));
    if (!data.length) return <EmptyHint chartType={chartType} hasX={hasX} hasY={hasY} />;
    return (
      <ResponsiveContainer width="100%" height={264}>
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
    if (!hasX) return <EmptyHint chartType={chartType} hasX={hasX} hasY={hasY} />;
    const data = histBins(filtered, config.xAxis);
    if (!data.length) return <EmptyHint chartType={chartType} hasX={hasX} hasY={hasY} />;
    return (
      <ResponsiveContainer width="100%" height={264}>
        <BarChart data={data} barCategoryGap="2%">
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="bin" tick={CHART_AXIS_STYLE} />
          <YAxis tick={CHART_AXIS_STYLE} />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
          <Bar dataKey="count" fill={CHART_PRIMARY} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'pie') {
    if (!hasX) return <EmptyHint chartType={chartType} hasX={hasX} hasY={hasY} />;
    const data = hasY
      ? groupAgg(filtered, config.xAxis, config.yAxis, config.aggregation).slice(0, 12)
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
    if (!data.length) return <EmptyHint chartType={chartType} hasX={hasX} hasY={hasY} />;
    return (
      <ResponsiveContainer width="100%" height={264}>
        <PieChart>
          <Pie
            data={data} dataKey="value" nameKey="name"
            cx="50%" cy="50%" outerRadius={90}
            label={({ name, percent = 0 }) => `${name} (${(percent * 100).toFixed(0)}%)`}
            labelLine={false}
          >
            {data.map((_, i) => <Cell key={i} fill={categoricalColor(i)} stroke={CHART_PIE_STROKE} strokeWidth={1} />)}
          </Pie>
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ color: CHART_AXIS_STYLE.fill, fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (!hasX || !hasY) return <EmptyHint chartType={chartType} hasX={hasX} hasY={hasY} />;
  const data = groupAgg(filtered, config.xAxis, config.yAxis, config.aggregation);
  if (!data.length) return <EmptyHint chartType={chartType} hasX={hasX} hasY={hasY} />;

  if (chartType === 'line') {
    return (
      <ResponsiveContainer width="100%" height={264}>
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
    <ResponsiveContainer width="100%" height={264}>
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

// ── Main component ────────────────────────────────────────────────────────────
export function InlineChartBuilder({
  columns, rows, loadingRows, datasetId, onCreated, onClose,
}: InlineChartBuilderProps) {
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [config, setConfig] = useState<VizConfig>({
    title: '', xAxis: '', yAxis: '',
    aggregation: 'mean',
    filterColumn: '', filterOperator: '==', filterValue: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const patch = (p: Partial<VizConfig>) => setConfig((prev) => ({ ...prev, ...p }));

  const numericCols = columns.filter((c) => c.type === 'number');
  const fm = FIELD_META[chartType];
  const xCols = (chartType === 'scatter' || chartType === 'histogram') ? numericCols : columns;
  const yCols = numericCols;

  const filterValues = useMemo(() => {
    if (!config.filterColumn || !rows.length) return [];
    return [...new Set(
      rows.map((r) => String(r[config.filterColumn] ?? '')).filter(Boolean),
    )].sort().slice(0, 50);
  }, [rows, config.filterColumn]);

  async function handleCreate() {
    if (!config.title.trim()) { setErr('Please enter a chart name.'); return; }
    setSaving(true); setErr('');
    const res = await fetch('/api/teacher/visualisations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dataset_id: datasetId,
        name: config.title.trim(),
        chart_type: chartType,
        config,
        is_template: false,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setErr(data.error ?? 'Failed to create chart'); return; }
    onCreated(data.visualisation as CreatedVis);
    onClose();
  }

  const SEL = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100';
  const INP = 'w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 transition focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.18 }}
        className="relative z-10 flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Create chart</p>
            <h2 className="mt-0.5 text-base font-semibold text-gray-900">Configure and link a chart to this question</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Settings panel */}
          <div className="w-72 shrink-0 space-y-5 overflow-y-auto border-r border-gray-100 p-5">

            {/* Chart type */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">Chart type</p>
              <div className="grid grid-cols-5 gap-1">
                {CHART_TYPES.map(({ type, label, icon: Icon }) => (
                  <button
                    key={type}
                    onClick={() => { setChartType(type); patch({ xAxis: '', yAxis: '' }); }}
                    className={`flex flex-col items-center gap-1 rounded-xl py-2.5 text-xs font-medium transition ${
                      chartType === type
                        ? 'bg-violet-600 text-white'
                        : 'border border-gray-200 text-gray-500 hover:border-violet-300 hover:text-violet-600'
                    }`}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-gray-500">
                Chart name <span className="text-red-400">*</span>
              </label>
              <input
                value={config.title}
                onChange={(e) => { patch({ title: e.target.value }); setErr(''); }}
                placeholder="e.g. Score distribution"
                className={INP}
              />
            </div>

            {/* Field mapping */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Field mapping</p>

              <div>
                <label className="mb-1 block text-xs text-gray-500">{fm.x}</label>
                <select value={config.xAxis} onChange={(e) => patch({ xAxis: e.target.value })} className={SEL}>
                  <option value="">— select —</option>
                  {xCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </div>

              {fm.y !== null && (
                <div>
                  <label className="mb-1 block text-xs text-gray-500">{fm.y}</label>
                  <select value={config.yAxis} onChange={(e) => patch({ yAxis: e.target.value })} className={SEL}>
                    <option value="">{chartType === 'pie' ? '— count rows —' : '— select —'}</option>
                    {yCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
              )}

              {fm.showAgg && (
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Aggregation</label>
                  <select
                    value={config.aggregation}
                    onChange={(e) => patch({ aggregation: e.target.value as Aggregation })}
                    className={SEL}
                  >
                    <option value="mean">Mean (average)</option>
                    <option value="sum">Sum (total)</option>
                    <option value="count">Count (rows per group)</option>
                  </select>
                </div>
              )}
            </div>

            {/* Filter */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Filter (optional)</p>
              <select
                value={config.filterColumn}
                onChange={(e) => patch({ filterColumn: e.target.value, filterValue: '' })}
                className={SEL}
              >
                <option value="">— no filter —</option>
                {columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>

              {config.filterColumn && (
                <>
                  <select
                    value={config.filterOperator}
                    onChange={(e) => patch({ filterOperator: e.target.value as FilterOp })}
                    className={SEL}
                  >
                    {FILTER_OPS.map(({ op, label }) => <option key={op} value={op}>{label}</option>)}
                  </select>
                  <input
                    value={config.filterValue}
                    onChange={(e) => patch({ filterValue: e.target.value })}
                    list="icb-filter-vals"
                    placeholder="Filter value…"
                    className={INP}
                  />
                  {filterValues.length > 0 && (
                    <datalist id="icb-filter-vals">
                      {filterValues.map((v) => <option key={v} value={v} />)}
                    </datalist>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Preview panel */}
          <div className="flex flex-1 flex-col overflow-y-auto p-6">
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-500">Live preview</p>
            {loadingRows ? (
              <div className="flex flex-1 items-center justify-center">
                <Loader2 className="size-5 animate-spin text-gray-300" />
              </div>
            ) : rows.length === 0 ? (
              <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50">
                <p className="px-6 text-center text-sm text-gray-500">No dataset rows available.</p>
              </div>
            ) : (
              <>
                {config.title && (
                  <p className="mb-3 text-sm font-semibold text-gray-800">{config.title}</p>
                )}
                <ChartPreview chartType={chartType} config={config} rows={rows} />
                <p className="mt-3 text-xs text-gray-500">Preview uses first {rows.length.toLocaleString()} rows.</p>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-gray-100 px-6 py-4">
          <div>
            {err && <p className="text-xs text-red-500">{err}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              Create &amp; Link
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
