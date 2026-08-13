import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import { GetServerSidePropsResult } from 'next';
import {
  FolderPlus, BarChart3,
  BarChart2, TrendingUp, PieChart as PieIcon, Maximize2, AlignLeft,
  Plus, Trash2, Eye, BookTemplate, Filter, Database, X,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { TEACHER_NAV } from '@/lib/teacher-nav';
import { withAuth } from '@/lib/auth';
import { createClientFromContext } from '@/lib/supabase/server-props';
import { createAdminClient } from '@/lib/supabase/admin';

// ── Types ────────────────────────────────────────────────────────────────────
type ChartType = 'bar' | 'line' | 'pie' | 'scatter' | 'histogram';

interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: string;
  subject_taught: string | null;
  institution_role: string | null;
  created_at: string;
}

interface DatasetSummary {
  id: string;
  name: string;
}

interface Visualisation {
  id: string;
  name: string;
  chart_type: ChartType;
  is_template: boolean;
  created_at: string;
  dataset_id: string | null;
  datasets: { id: string; name: string }[] | null;
}

interface Props {
  profile: Profile;
  visualisations: Visualisation[];
  datasets: DatasetSummary[];
}

// ── Server-side ──────────────────────────────────────────────────────────────
export const getServerSideProps = withAuth(
  async (context, userId): Promise<GetServerSidePropsResult<Props>> => {
    const supabase = createClientFromContext(context);
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, subject_taught, institution_role, created_at')
      .eq('id', userId)
      .single();

    if (!profile) return { redirect: { destination: '/auth/login', permanent: false } };

    const admin = createAdminClient();

    const [{ data: visualisations }, { data: datasets }] = await Promise.all([
      admin
        .from('visualisations')
        .select('id, name, chart_type, is_template, created_at, dataset_id, datasets(id, name)')
        .eq('teacher_id', userId)
        .order('created_at', { ascending: false }),
      admin
        .from('datasets')
        .select('id, name')
        .eq('teacher_id', userId)
        .order('name'),
    ]);

    return {
      props: {
        profile,
        visualisations: (visualisations ?? []) as Visualisation[],
        datasets: datasets ?? [],
      },
    };
  },
  { allowedRoles: ['teacher'] }
);

// ── Chart type helpers ───────────────────────────────────────────────────────
const CHART_ICONS: Record<ChartType, React.ReactNode> = {
  bar: <BarChart2 className="size-4" />,
  line: <TrendingUp className="size-4" />,
  pie: <PieIcon className="size-4" />,
  scatter: <Maximize2 className="size-4" />,
  histogram: <AlignLeft className="size-4" />,
};

const CHART_LABELS: Record<ChartType, string> = {
  bar: 'Bar',
  line: 'Line',
  pie: 'Pie',
  scatter: 'Scatter',
  histogram: 'Histogram',
};

const CHART_COLORS: Record<ChartType, string> = {
  bar: 'text-violet-700 bg-violet-100 ring-violet-200',
  line: 'text-blue-700 bg-blue-100 ring-blue-200',
  pie: 'text-emerald-700 bg-emerald-100 ring-emerald-200',
  scatter: 'text-amber-700 bg-amber-100 ring-amber-200',
  histogram: 'text-rose-700 bg-rose-100 ring-rose-200',
};

// ── Dataset picker modal ──────────────────────────────────────────────────────
function DatasetPickerModal({
  datasets,
  onPick,
  onClose,
}: {
  datasets: DatasetSummary[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">Select a dataset</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-600 hover:text-gray-600 transition-colors">
            <X className="size-4" />
          </button>
        </div>

        {datasets.length === 0 ? (
          <div className="py-6 text-center">
            <Database className="size-8 text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-500 mb-3">No datasets yet.</p>
            <Link
              href="/teacher/datasets"
              className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 px-4 py-2 text-sm font-semibold text-white transition-colors"
            >
              <Plus className="size-4" />
              Upload a dataset
            </Link>
          </div>
        ) : (
          <ul className="space-y-1 max-h-72 overflow-y-auto">
            {datasets.map((d) => (
              <li key={d.id}>
                <button
                  onClick={() => onPick(d.id)}
                  className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-violet-50 hover:text-violet-700 transition-colors"
                >
                  <Database className="size-4 text-gray-600 shrink-0" />
                  {d.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </motion.div>
    </div>
  );
}

// ── Delete confirmation modal ─────────────────────────────────────────────────
function DeleteModal({
  name,
  onConfirm,
  onCancel,
  deleting,
}: {
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-xl"
      >
        <h3 className="text-base font-semibold text-gray-900 mb-2">Delete visualisation?</h3>
        <p className="text-sm text-gray-500 mb-6">
          <span className="text-gray-800 font-medium">{name}</span> will be permanently deleted.
          This action cannot be undone.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-60"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function VisualisationsPage({ profile, visualisations: initial, datasets }: Props) {
  const router = useRouter();
  const [list, setList] = useState<Visualisation[]>(initial);
  const [datasetFilter, setDatasetFilter] = useState('');
  const [chartFilter, setChartFilter] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Visualisation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showDatasetPicker, setShowDatasetPicker] = useState(false);

  function handlePickDataset(datasetId: string) {
    void router.push(`/teacher/visualisations/new?dataset=${datasetId}`);
  }

  const filtered = list.filter((v) => {
    if (datasetFilter && v.dataset_id !== datasetFilter) return false;
    if (chartFilter && v.chart_type !== chartFilter) return false;
    return true;
  });

  async function handleDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/teacher/visualisations/${pendingDelete.id}`, { method: 'DELETE' });
      if (res.ok) {
        setList((prev) => prev.filter((v) => v.id !== pendingDelete.id));
        setPendingDelete(null);
      }
    } finally {
      setDeleting(false);
    }
  }

  const hasFilters = datasetFilter !== '' || chartFilter !== '';

  return (
    <DashboardLayout profile={profile} navItems={TEACHER_NAV} title="Visualisations">
      <AnimatePresence>
        {showDatasetPicker && (
          <DatasetPickerModal
            datasets={datasets}
            onPick={handlePickDataset}
            onClose={() => setShowDatasetPicker(false)}
          />
        )}
        {pendingDelete && (
          <DeleteModal
            name={pendingDelete.name}
            onConfirm={handleDelete}
            onCancel={() => setPendingDelete(null)}
            deleting={deleting}
          />
        )}
      </AnimatePresence>

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-600">Visualisations</p>
            <h1 className="mt-0.5 text-2xl font-bold text-gray-900">Visualisations</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              {list.length} saved {list.length === 1 ? 'visualisation' : 'visualisations'}
            </p>
          </div>
          <button
            onClick={() => setShowDatasetPicker(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors"
          >
            <Plus className="size-4" />
            New visualisation
          </button>
        </div>

        {/* Filters */}
        {(datasets.length > 0 || list.length > 0) && (
          <div className="flex items-center gap-3 flex-wrap">
            <Filter className="size-4 text-gray-600 shrink-0" aria-hidden="true" />
            <select
              aria-label="Filter by dataset"
              value={datasetFilter}
              onChange={(e) => setDatasetFilter(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-violet-400/40 min-w-[160px]"
            >
              <option value="">All datasets</option>
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <select
              aria-label="Filter by chart type"
              value={chartFilter}
              onChange={(e) => setChartFilter(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-violet-400/40 min-w-[140px]"
            >
              <option value="">All chart types</option>
              {(['bar', 'line', 'pie', 'scatter', 'histogram'] as ChartType[]).map((ct) => (
                <option key={ct} value={ct}>{CHART_LABELS[ct]}</option>
              ))}
            </select>
            {hasFilters && (
              <button
                onClick={() => { setDatasetFilter(''); setChartFilter(''); }}
                className="text-sm text-gray-600 hover:text-gray-700 transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 rounded-full bg-gray-100 p-4">
              <BarChart3 className="size-8 text-gray-600" />
            </div>
            {list.length === 0 ? (
              <>
                <p className="text-base font-medium text-gray-700">No visualisations yet</p>
                <p className="mt-1 text-sm text-gray-600">
                  Open a dataset and click &ldquo;Create visualisation&rdquo; to get started.
                </p>
                <Link
                  href="/teacher/datasets"
                  className="mt-4 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:border-violet-300 hover:text-violet-600 transition-colors"
                >
                  <FolderPlus className="size-4" />
                  Go to Datasets
                </Link>
              </>
            ) : (
              <>
                <p className="text-base font-medium text-gray-700">No matches</p>
                <p className="mt-1 text-sm text-gray-600">Try adjusting the filters above.</p>
              </>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((vis, i) => (
              <motion.div
                key={vis.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="group relative rounded-2xl border border-gray-100 bg-white shadow-sm p-5 flex flex-col gap-3 hover:border-violet-200 hover:shadow-md transition-all"
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${CHART_COLORS[vis.chart_type]}`}
                  >
                    {CHART_ICONS[vis.chart_type]}
                    {CHART_LABELS[vis.chart_type]}
                  </span>
                  {vis.is_template && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 ring-1 ring-inset ring-purple-200">
                      <BookTemplate className="size-3" />
                      Template
                    </span>
                  )}
                </div>

                {/* Name */}
                <p className="text-sm font-semibold text-gray-800 leading-snug line-clamp-2">
                  {vis.name}
                </p>

                {/* Dataset */}
                {vis.datasets ? (
                  (() => {
                    const dataset = Array.isArray(vis.datasets) ? vis.datasets[0] : vis.datasets
                    if (!dataset) return <p className="text-xs text-gray-600">No dataset linked</p>
                    return (
                  <p className="text-xs text-gray-600 truncate">
                    <span className="text-gray-600">Dataset: </span>
                    <Link
                      href={`/teacher/datasets/${dataset.id}`}
                      className="text-gray-600 hover:text-violet-600 transition-colors"
                    >
                      {dataset.name}
                    </Link>
                  </p>
                    )
                  })()
                ) : (
                  <p className="text-xs text-gray-600">No dataset linked</p>
                )}

                {/* Footer */}
                <div className="mt-auto flex items-center justify-between pt-2 border-t border-gray-100">
                  <time className="text-xs text-gray-600">
                    {new Date(vis.created_at).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </time>
                  <div className="flex items-center gap-1">
                    <Link
                      href={`/teacher/visualisations/${vis.id}`}
                      className="rounded-lg p-1.5 text-gray-600 hover:text-violet-600 hover:bg-violet-50 transition-colors"
                      title="View visualisation"
                    >
                      <Eye className="size-3.5" />
                    </Link>
                    <button
                      onClick={() => setPendingDelete(vis)}
                      className="rounded-lg p-1.5 text-gray-600 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Delete visualisation"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
