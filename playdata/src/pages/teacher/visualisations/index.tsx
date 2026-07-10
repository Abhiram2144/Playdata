import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import { GetServerSidePropsResult } from 'next';
import {
  Database, FolderPlus, BarChart3,
  BarChart2, TrendingUp, PieChart as PieIcon, Maximize2, AlignLeft,
  Plus, Trash2, ExternalLink, BookTemplate, Filter,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { type NavItem } from '@/components/layout/Sidebar';
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
  datasets: { id: string; name: string } | null;
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

// ── Nav ──────────────────────────────────────────────────────────────────────
const NAV_ITEMS: NavItem[] = [
  { href: '/teacher/dashboard', label: 'Dashboard', icon: Database },
  { href: '/teacher/datasets', label: 'Datasets', icon: FolderPlus },
  { href: '/teacher/visualisations', label: 'Visualisations', icon: BarChart3 },
];

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
  bar: 'text-violet-400 bg-violet-500/10 ring-violet-500/20',
  line: 'text-blue-400 bg-blue-500/10 ring-blue-500/20',
  pie: 'text-emerald-400 bg-emerald-500/10 ring-emerald-500/20',
  scatter: 'text-amber-400 bg-amber-500/10 ring-amber-500/20',
  histogram: 'text-rose-400 bg-rose-500/10 ring-rose-500/20',
};

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-sm rounded-2xl border border-[#35354a] bg-[#11111f] p-6 shadow-xl"
      >
        <h3 className="text-base font-semibold text-white mb-2">Delete visualisation?</h3>
        <p className="text-sm text-[#8888a0] mb-6">
          <span className="text-white font-medium">{name}</span> will be permanently deleted.
          This action cannot be undone.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="px-4 py-2 rounded-lg text-sm font-medium text-[#8888a0] hover:text-white transition-colors"
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
    <DashboardLayout profile={profile} navItems={NAV_ITEMS}>
      <AnimatePresence>
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
            <h1 className="text-2xl font-bold text-white">Visualisations</h1>
            <p className="mt-0.5 text-sm text-[#8888a0]">
              {list.length} saved {list.length === 1 ? 'visualisation' : 'visualisations'}
            </p>
          </div>
          <Link
            href="/teacher/datasets"
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors"
          >
            <Plus className="size-4" />
            New visualisation
          </Link>
        </div>

        {/* Filters */}
        {(datasets.length > 0 || list.length > 0) && (
          <div className="flex items-center gap-3 flex-wrap">
            <Filter className="size-4 text-[#6a6a80] shrink-0" />
            <select
              value={datasetFilter}
              onChange={(e) => setDatasetFilter(e.target.value)}
              className="rounded-lg border border-[#35354a] bg-[#0d0d18] px-3 py-1.5 text-sm text-[#c9c9d4] focus:outline-none focus:ring-2 focus:ring-violet-500/40 min-w-[160px]"
            >
              <option value="">All datasets</option>
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <select
              value={chartFilter}
              onChange={(e) => setChartFilter(e.target.value)}
              className="rounded-lg border border-[#35354a] bg-[#0d0d18] px-3 py-1.5 text-sm text-[#c9c9d4] focus:outline-none focus:ring-2 focus:ring-violet-500/40 min-w-[140px]"
            >
              <option value="">All chart types</option>
              {(['bar', 'line', 'pie', 'scatter', 'histogram'] as ChartType[]).map((ct) => (
                <option key={ct} value={ct}>{CHART_LABELS[ct]}</option>
              ))}
            </select>
            {hasFilters && (
              <button
                onClick={() => { setDatasetFilter(''); setChartFilter(''); }}
                className="text-sm text-[#6a6a80] hover:text-[#c9c9d4] transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 rounded-full bg-[#1a1a2e] p-4">
              <BarChart3 className="size-8 text-[#35354a]" />
            </div>
            {list.length === 0 ? (
              <>
                <p className="text-base font-medium text-[#c9c9d4]">No visualisations yet</p>
                <p className="mt-1 text-sm text-[#6a6a80]">
                  Open a dataset and click &ldquo;Create visualisation&rdquo; to get started.
                </p>
                <Link
                  href="/teacher/datasets"
                  className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[#35354a] px-4 py-2.5 text-sm font-medium text-[#c9c9d4] hover:border-violet-500/50 hover:text-white transition-colors"
                >
                  <FolderPlus className="size-4" />
                  Go to Datasets
                </Link>
              </>
            ) : (
              <>
                <p className="text-base font-medium text-[#c9c9d4]">No matches</p>
                <p className="mt-1 text-sm text-[#6a6a80]">Try adjusting the filters above.</p>
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
                className="group relative rounded-2xl border border-[#35354a] bg-[#11111f] p-5 flex flex-col gap-3 hover:border-violet-500/40 transition-colors"
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
                    <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-0.5 text-xs font-medium text-purple-300 ring-1 ring-inset ring-purple-500/20">
                      <BookTemplate className="size-3" />
                      Template
                    </span>
                  )}
                </div>

                {/* Name */}
                <p className="text-sm font-semibold text-white leading-snug line-clamp-2">
                  {vis.name}
                </p>

                {/* Dataset */}
                {vis.datasets ? (
                  <p className="text-xs text-[#6a6a80] truncate">
                    <span className="text-[#8888a0]">Dataset: </span>
                    <Link
                      href={`/teacher/datasets/${vis.datasets.id}`}
                      className="hover:text-violet-400 transition-colors"
                    >
                      {vis.datasets.name}
                    </Link>
                  </p>
                ) : (
                  <p className="text-xs text-[#6a6a80]">No dataset linked</p>
                )}

                {/* Footer */}
                <div className="mt-auto flex items-center justify-between pt-2 border-t border-[#1e1e30]">
                  <time className="text-xs text-[#6a6a80]">
                    {new Date(vis.created_at).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </time>
                  <div className="flex items-center gap-1">
                    <Link
                      href={`/teacher/visualisations/${vis.id}/edit`}
                      className="rounded-lg p-1.5 text-[#6a6a80] hover:text-violet-400 hover:bg-violet-500/10 transition-colors"
                      title="Edit visualisation"
                    >
                      <ExternalLink className="size-3.5" />
                    </Link>
                    <button
                      onClick={() => setPendingDelete(vis)}
                      className="rounded-lg p-1.5 text-[#6a6a80] hover:text-red-400 hover:bg-red-500/10 transition-colors"
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
