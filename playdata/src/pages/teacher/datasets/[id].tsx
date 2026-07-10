import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database, FolderPlus, BarChart3,
  Hash, Type, Calendar, ToggleLeft, ArrowLeft, Rows,
  Pencil, Trash2, Check, X, AlertTriangle, Eye, EyeOff,
  ChevronLeft, ChevronRight, BarChart2, BookOpen,
} from 'lucide-react';
import { GetServerSidePropsResult } from 'next';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { type NavItem } from '@/components/layout/Sidebar';
import { withAuth } from '@/lib/auth';
import { createClientFromContext } from '@/lib/supabase/server-props';
import { createAdminClient } from '@/lib/supabase/admin';

// ── Types ────────────────────────────────────────────────────────────────────
type ColumnType = 'number' | 'string' | 'boolean' | 'date';

interface ColumnSchema { name: string; type: ColumnType }

interface Dataset {
  id: string;
  name: string;
  description: string | null;
  row_count: number;
  storage_path: string | null;
  schema: { columns: ColumnSchema[] };
  provider: string | null;
  created_at: string;
  updated_at: string;
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
  initialVisibleColumns: string[];
}

interface ValidationReport {
  totalRows: number;
  missingPerColumn: Record<string, number>;
  typeErrorsPerColumn: Record<string, { expected: ColumnType; count: number; examples: string[] }>;
  duplicateRowCount: number;
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

    const [{ data: dataset }, { data: vcRows }] = await Promise.all([
      admin
        .from('datasets')
        .select('id, name, description, row_count, storage_path, schema, provider, created_at, updated_at')
        .eq('id', id)
        .eq('teacher_id', userId)
        .maybeSingle(),
      admin
        .from('dataset_visible_columns')
        .select('column_name')
        .eq('dataset_id', id),
    ]);

    if (!dataset) return { notFound: true };

    return {
      props: {
        profile,
        dataset: dataset as unknown as Dataset,
        initialVisibleColumns: (vcRows ?? []).map((r) => r.column_name),
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

const TYPE_META: Record<ColumnType, { icon: React.ElementType; label: string; colour: string }> = {
  number:  { icon: Hash,       label: 'Number',  colour: 'text-blue-400 bg-blue-500/10 ring-blue-500/20' },
  string:  { icon: Type,       label: 'Text',    colour: 'text-violet-400 bg-violet-500/10 ring-violet-500/20' },
  date:    { icon: Calendar,   label: 'Date',    colour: 'text-emerald-400 bg-emerald-500/10 ring-emerald-500/20' },
  boolean: { icon: ToggleLeft, label: 'Boolean', colour: 'text-amber-400 bg-amber-500/10 ring-amber-500/20' },
};

type Tab = 'preview' | 'validation' | 'columns';

// ── Page ─────────────────────────────────────────────────────────────────────
export default function DatasetDetail({ profile, dataset, initialVisibleColumns }: Props) {
  const router = useRouter();
  const columns: ColumnSchema[] = dataset.schema?.columns ?? [];

  // ── Name editing ──────────────────────────────────────────────────────────
  const [name, setName] = useState(dataset.name);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(dataset.name);
  const [savingName, setSavingName] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const startRename = () => { setNameInput(name); setEditingName(true); };
  const cancelRename = () => { setEditingName(false); };

  const commitRename = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === name) { cancelRename(); return; }
    setSavingName(true);
    const res = await fetch(`/api/teacher/datasets/${dataset.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    });
    setSavingName(false);
    if (res.ok) { setName(trimmed); setEditingName(false); }
  };

  useEffect(() => { if (editingName) nameRef.current?.focus(); }, [editingName]);

  // ── Delete ────────────────────────────────────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteRefs, setDeleteRefs] = useState<{
    visualisations: { id: string; name: string }[];
    quizzes: { id: string; title: string }[];
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const openDelete = async () => {
    setShowDeleteModal(true);
    const res = await fetch(`/api/teacher/datasets/${dataset.id}/references`);
    const data = await res.json();
    setDeleteRefs(res.ok ? data : { visualisations: [], quizzes: [] });
  };

  const confirmDelete = async () => {
    setDeleting(true);
    const res = await fetch(`/api/teacher/datasets/${dataset.id}`, { method: 'DELETE' });
    setDeleting(false);
    if (res.ok) router.push('/teacher/datasets');
  };

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>('preview');

  // ── Preview tab ───────────────────────────────────────────────────────────
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([]);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [previewPage, setPreviewPage] = useState(0);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const PAGE_SIZE = 50;

  const fetchPreview = useCallback(async (pg: number) => {
    setLoadingPreview(true);
    setPreviewError(null);
    const res = await fetch(
      `/api/teacher/datasets/${dataset.id}/rows?page=${pg}&pageSize=${PAGE_SIZE}`
    );
    const data = await res.json();
    setLoadingPreview(false);
    if (!res.ok) { setPreviewError(data.error ?? 'Failed to load rows'); return; }
    setPreviewRows(data.rows ?? []);
    setPreviewTotal(data.total ?? 0);
    setPreviewPage(pg);
  }, [dataset.id]);

  useEffect(() => { if (activeTab === 'preview') fetchPreview(0); }, [activeTab, fetchPreview]);

  const totalPages = Math.ceil(previewTotal / PAGE_SIZE);

  // ── Validation tab ────────────────────────────────────────────────────────
  const [validation, setValidation] = useState<ValidationReport | null>(null);
  const [loadingValidation, setLoadingValidation] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const validationLoaded = useRef(false);

  const fetchValidation = useCallback(async () => {
    if (validationLoaded.current) return;
    validationLoaded.current = true;
    setLoadingValidation(true);
    setValidationError(null);
    const res = await fetch(`/api/teacher/datasets/${dataset.id}/validate`);
    const data = await res.json();
    setLoadingValidation(false);
    if (!res.ok) { setValidationError(data.error ?? 'Failed to load validation'); return; }
    setValidation(data.report);
  }, [dataset.id]);

  useEffect(() => { if (activeTab === 'validation') fetchValidation(); }, [activeTab, fetchValidation]);

  // ── Columns tab ───────────────────────────────────────────────────────────
  const [visible, setVisible] = useState<Set<string>>(new Set(initialVisibleColumns));
  const [savingColumns, setSavingColumns] = useState(false);
  const [columnsSaved, setColumnsSaved] = useState(false);

  const toggleColumn = (colName: string) => {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(colName)) next.delete(colName);
      else next.add(colName);
      return next;
    });
    setColumnsSaved(false);
  };

  const saveColumns = async () => {
    setSavingColumns(true);
    const res = await fetch(`/api/teacher/datasets/${dataset.id}/columns`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ columns: [...visible] }),
    });
    setSavingColumns(false);
    if (res.ok) setColumnsSaved(true);
  };

  // ── Validation helpers ────────────────────────────────────────────────────
  const totalMissing = validation
    ? Object.values(validation.missingPerColumn).reduce((a, b) => a + b, 0)
    : 0;
  const totalTypeErrors = validation
    ? Object.values(validation.typeErrorsPerColumn).reduce((a, e) => a + e.count, 0)
    : 0;

  const colsWithIssues = validation
    ? columns.filter(
        (c) =>
          (validation.missingPerColumn[c.name] ?? 0) > 0 ||
          validation.typeErrorsPerColumn[c.name]
      )
    : [];

  return (
    <DashboardLayout navItems={NAV_ITEMS} profile={profile}>
      <div className="max-w-6xl space-y-6">

        {/* Back */}
        <button
          onClick={() => router.push('/teacher/datasets')}
          className="flex items-center gap-1.5 text-sm text-[#6a6a80] hover:text-violet-400 transition-colors"
        >
          <ArrowLeft className="size-3.5" /> Back to Datasets
        </button>

        {/* Header card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-[#35354a]/60 bg-[#11111f]/80 p-6"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#6a6a80]">Dataset</p>

              {editingName ? (
                <div className="mt-1 flex items-center gap-2">
                  <input
                    ref={nameRef}
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') cancelRename(); }}
                    className="flex-1 min-w-0 rounded-xl border border-violet-500/60 bg-[#0f0f1d] px-3 py-1.5 text-xl font-bold text-white focus:outline-none"
                  />
                  <button onClick={commitRename} disabled={savingName} className="rounded-lg bg-emerald-600/20 border border-emerald-500/30 p-1.5 text-emerald-400 hover:bg-emerald-600/30">
                    <Check className="size-4" />
                  </button>
                  <button onClick={cancelRename} className="rounded-lg bg-[#1a1a2e] border border-[#35354a] p-1.5 text-[#6a6a80] hover:text-white">
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <div className="mt-1 flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-white truncate">{name}</h1>
                  <button onClick={startRename} className="shrink-0 p-1 text-[#4a4a60] hover:text-violet-400 transition-colors">
                    <Pencil className="size-3.5" />
                  </button>
                </div>
              )}

              {dataset.description && (
                <p className="mt-1 text-sm text-[#8d8da0]">{dataset.description}</p>
              )}

              <p className="mt-2 text-xs text-[#4a4a60]">
                {dataset.provider
                  ? (dataset.provider === 'google_drive' ? 'Google Drive' : 'Dropbox')
                  : 'Direct upload'}
                {' · '}
                Added {new Date(dataset.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                {' · '}{columns.length} column{columns.length !== 1 ? 's' : ''}
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-2 rounded-xl border border-[#35354a]/60 bg-[#151526] px-4 py-3">
                <Rows className="size-4 text-violet-400" />
                <span className="text-sm font-semibold text-white">{dataset.row_count.toLocaleString()}</span>
                <span className="text-xs text-[#6a6a80]">rows</span>
              </div>
              <button
                onClick={openDelete}
                className="flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-600/10 px-3 py-2.5 text-sm font-semibold text-red-400 transition hover:bg-red-600/20"
              >
                <Trash2 className="size-4" /> Delete
              </button>
            </div>
          </div>
        </motion.div>

        {/* CTA strip */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="grid gap-3 sm:grid-cols-2"
        >
          <Link
            href={`/teacher/visualisations/new?dataset=${dataset.id}`}
            className="flex items-center gap-3 rounded-2xl border border-[#35354a]/60 bg-[#11111f]/80 p-5 text-left hover:border-blue-500/40 hover:bg-[#11111f] transition-colors"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 ring-1 ring-blue-500/20">
              <BarChart2 className="size-5 text-blue-400" />
            </span>
            <div>
              <p className="text-sm font-semibold text-white">Create visualisation</p>
              <p className="text-xs text-[#6a6a80]">Build a chart from this dataset</p>
            </div>
          </Link>

          <button
            disabled
            title="Quiz builder coming soon"
            className="flex items-center gap-3 rounded-2xl border border-[#35354a]/60 bg-[#11111f]/80 p-5 text-left opacity-50 cursor-not-allowed"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 ring-1 ring-violet-500/20">
              <BookOpen className="size-5 text-violet-400" />
            </span>
            <div>
              <p className="text-sm font-semibold text-white">Create quiz</p>
              <p className="text-xs text-[#6a6a80]">Generate questions from this dataset — coming soon</p>
            </div>
          </button>
        </motion.div>

        {/* Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl border border-[#35354a]/60 bg-[#11111f]/80"
        >
          {/* Tab bar */}
          <div className="flex border-b border-[#35354a]/60">
            {(['preview', 'validation', 'columns'] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`relative px-6 py-4 text-sm font-semibold capitalize transition-colors ${
                  activeTab === tab
                    ? 'text-white'
                    : 'text-[#6a6a80] hover:text-[#c9c9d4]'
                }`}
              >
                {tab}
                {activeTab === tab && (
                  <motion.span
                    layoutId="tab-underline"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-500"
                  />
                )}
              </button>
            ))}
          </div>

          {/* Preview tab */}
          {activeTab === 'preview' && (
            <div className="p-6">
              {!dataset.storage_path ? (
                <p className="text-sm text-[#6a6a80]">No data file attached to this dataset.</p>
              ) : loadingPreview ? (
                <p className="text-sm text-[#8d8da0]">Loading rows…</p>
              ) : previewError ? (
                <p className="text-sm text-red-400">{previewError}</p>
              ) : previewRows.length === 0 ? (
                <p className="text-sm text-[#6a6a80]">No rows found.</p>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-xl border border-[#35354a]/40">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#35354a]/40 bg-[#0f0f1d]">
                          <th className="px-3 py-2.5 text-left text-xs font-semibold text-[#6a6a80] w-10">#</th>
                          {columns.map((col) => {
                            const meta = TYPE_META[col.type] ?? TYPE_META.string;
                            const Icon = meta.icon;
                            return (
                              <th key={col.name} className="px-3 py-2.5 text-left">
                                <div className="flex items-center gap-1.5">
                                  <Icon className={`size-3 shrink-0 ${meta.colour.split(' ')[0]}`} />
                                  <span className="text-xs font-semibold text-[#c9c9d4] whitespace-nowrap">{col.name}</span>
                                </div>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, i) => (
                          <tr
                            key={i}
                            className="border-b border-[#35354a]/20 last:border-0 hover:bg-[#151526]/50"
                          >
                            <td className="px-3 py-2 text-xs text-[#4a4a60]">
                              {previewPage * PAGE_SIZE + i + 1}
                            </td>
                            {columns.map((col) => (
                              <td key={col.name} className="px-3 py-2 text-xs text-[#c9c9d4] max-w-[200px]">
                                <span className="block truncate">
                                  {row[col.name] === undefined || row[col.name] === null || row[col.name] === ''
                                    ? <span className="text-[#4a4a60] italic">—</span>
                                    : String(row[col.name])}
                                </span>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div className="mt-4 flex items-center justify-between">
                    <p className="text-xs text-[#6a6a80]">
                      Rows {previewPage * PAGE_SIZE + 1}–{Math.min((previewPage + 1) * PAGE_SIZE, previewTotal)} of {previewTotal.toLocaleString()}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => fetchPreview(previewPage - 1)}
                        disabled={previewPage === 0 || loadingPreview}
                        className="flex items-center gap-1 rounded-lg border border-[#35354a] px-3 py-1.5 text-xs text-[#8d8da0] transition hover:border-violet-500/40 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <ChevronLeft className="size-3.5" /> Prev
                      </button>
                      <span className="text-xs text-[#4a4a60]">
                        {previewPage + 1} / {totalPages}
                      </span>
                      <button
                        onClick={() => fetchPreview(previewPage + 1)}
                        disabled={previewPage >= totalPages - 1 || loadingPreview}
                        className="flex items-center gap-1 rounded-lg border border-[#35354a] px-3 py-1.5 text-xs text-[#8d8da0] transition hover:border-violet-500/40 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Next <ChevronRight className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Validation tab */}
          {activeTab === 'validation' && (
            <div className="p-6">
              {loadingValidation ? (
                <p className="text-sm text-[#8d8da0]">Analysing dataset…</p>
              ) : validationError ? (
                <p className="text-sm text-red-400">{validationError}</p>
              ) : !validation ? null : (
                <div className="space-y-6">
                  {/* Summary metrics */}
                  <div className="grid gap-3 sm:grid-cols-4">
                    {[
                      { label: 'Total rows', value: validation.totalRows.toLocaleString(), ok: true },
                      { label: 'Missing values', value: totalMissing.toLocaleString(), ok: totalMissing === 0 },
                      { label: 'Type errors', value: totalTypeErrors.toLocaleString(), ok: totalTypeErrors === 0 },
                      { label: 'Duplicate rows', value: validation.duplicateRowCount.toLocaleString(), ok: validation.duplicateRowCount === 0 },
                    ].map(({ label, value, ok }) => (
                      <div key={label} className={`rounded-xl border p-4 ${ok ? 'border-[#35354a]/40 bg-[#0f0f1d]' : 'border-amber-500/30 bg-amber-500/5'}`}>
                        <p className="text-xs text-[#6a6a80]">{label}</p>
                        <p className={`mt-1 text-2xl font-bold ${ok ? 'text-white' : 'text-amber-400'}`}>{value}</p>
                      </div>
                    ))}
                  </div>

                  {colsWithIssues.length === 0 ? (
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-400">
                      No issues detected — all columns look clean.
                    </div>
                  ) : (
                    <div>
                      <p className="mb-3 text-sm font-semibold text-[#c9c9d4]">Column issues</p>
                      <div className="space-y-2">
                        {colsWithIssues.map((col) => {
                          const missing = validation.missingPerColumn[col.name] ?? 0;
                          const typeErr = validation.typeErrorsPerColumn[col.name];
                          const meta = TYPE_META[col.type] ?? TYPE_META.string;
                          const Icon = meta.icon;
                          return (
                            <div key={col.name} className="rounded-xl border border-[#35354a]/40 bg-[#0f0f1d] px-4 py-3">
                              <div className="flex items-center gap-2 mb-2">
                                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ring-1 ${meta.colour}`}>
                                  <Icon className="size-3" />
                                </span>
                                <span className="text-sm font-semibold text-white">{col.name}</span>
                                <span className="text-xs text-[#6a6a80]">({meta.label})</span>
                              </div>
                              <div className="flex flex-wrap gap-3 text-xs">
                                {missing > 0 && (
                                  <span className="text-amber-400">
                                    <AlertTriangle className="size-3 inline mr-1" />
                                    {missing} missing value{missing !== 1 ? 's' : ''}
                                  </span>
                                )}
                                {typeErr && (
                                  <span className="text-red-400">
                                    <AlertTriangle className="size-3 inline mr-1" />
                                    {typeErr.count} type mismatch{typeErr.count !== 1 ? 'es' : ''}
                                    {typeErr.examples.length > 0 && (
                                      <span className="text-[#6a6a80] ml-1">
                                        (e.g. {typeErr.examples.map((e) => `"${e}"`).join(', ')})
                                      </span>
                                    )}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {validation.duplicateRowCount > 0 && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
                      <AlertTriangle className="size-4 text-amber-400 inline mr-2" />
                      <span className="text-amber-400 font-semibold">{validation.duplicateRowCount}</span>
                      <span className="text-[#8d8da0]"> duplicate row{validation.duplicateRowCount !== 1 ? 's' : ''} detected (exact matches across all columns).</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Columns tab */}
          {activeTab === 'columns' && (
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#c9c9d4]">Student-visible columns</p>
                  <p className="text-xs text-[#6a6a80] mt-0.5">
                    Toggle which columns students can see. Hidden columns remain in the dataset for your use.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {columnsSaved && (
                    <span className="text-xs text-emerald-400 flex items-center gap-1">
                      <Check className="size-3" /> Saved
                    </span>
                  )}
                  <button
                    onClick={saveColumns}
                    disabled={savingColumns}
                    className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:bg-violet-500/50 disabled:cursor-not-allowed"
                  >
                    {savingColumns ? 'Saving…' : 'Save visibility'}
                  </button>
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => { setVisible(new Set(columns.map((c) => c.name))); setColumnsSaved(false); }}
                  className="text-xs text-violet-400 hover:text-violet-300 transition"
                >
                  Show all
                </button>
                <span className="text-[#35354a]">·</span>
                <button
                  onClick={() => { setVisible(new Set()); setColumnsSaved(false); }}
                  className="text-xs text-violet-400 hover:text-violet-300 transition"
                >
                  Hide all
                </button>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {columns.map((col) => {
                  const meta = TYPE_META[col.type] ?? TYPE_META.string;
                  const Icon = meta.icon;
                  const isVisible = visible.has(col.name);
                  return (
                    <button
                      key={col.name}
                      onClick={() => toggleColumn(col.name)}
                      className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                        isVisible
                          ? 'border-violet-500/30 bg-violet-500/5 hover:bg-violet-500/10'
                          : 'border-[#35354a]/40 bg-[#0f0f1d]/50 hover:border-[#35354a]/80'
                      }`}
                    >
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ${meta.colour}`}>
                        <Icon className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white truncate">{col.name}</p>
                        <p className="text-xs text-[#6a6a80]">{meta.label}</p>
                      </div>
                      {isVisible
                        ? <Eye className="size-4 shrink-0 text-violet-400" />
                        : <EyeOff className="size-4 shrink-0 text-[#35354a]" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* Delete modal */}
      <AnimatePresence>
        {showDeleteModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-2xl border border-[#35354a]/60 bg-[#11111f] p-6 shadow-2xl"
            >
              <div className="flex items-start gap-3 mb-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/10 ring-1 ring-red-500/20">
                  <Trash2 className="size-4 text-red-400" />
                </span>
                <div>
                  <h2 className="text-base font-bold text-white">Delete "{name}"?</h2>
                  <p className="text-sm text-[#8d8da0] mt-0.5">This cannot be undone. The file will be removed from storage.</p>
                </div>
              </div>

              {deleteRefs === null ? (
                <p className="text-sm text-[#6a6a80] mb-4">Checking references…</p>
              ) : (deleteRefs.visualisations.length > 0 || deleteRefs.quizzes.length > 0) && (
                <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
                  <p className="font-semibold text-amber-400 mb-1 flex items-center gap-1.5">
                    <AlertTriangle className="size-3.5" /> Dependent items will lose their dataset
                  </p>
                  {deleteRefs.visualisations.length > 0 && (
                    <p className="text-[#8d8da0]">
                      Visualisations: {deleteRefs.visualisations.map((v) => v.name).join(', ')}
                    </p>
                  )}
                  {deleteRefs.quizzes.length > 0 && (
                    <p className="text-[#8d8da0]">
                      Quizzes: {deleteRefs.quizzes.map((q) => q.title).join(', ')}
                    </p>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="rounded-xl border border-[#35354a] px-4 py-2 text-sm text-[#8d8da0] transition hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={deleting || deleteRefs === null}
                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:bg-red-500/50 disabled:cursor-not-allowed"
                >
                  {deleting ? 'Deleting…' : 'Delete dataset'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}
