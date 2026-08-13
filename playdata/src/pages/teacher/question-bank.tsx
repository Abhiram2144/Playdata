import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2, Pencil, Tag, X, BookOpen } from 'lucide-react';
import { GetServerSidePropsResult } from 'next';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { TEACHER_NAV } from '@/lib/teacher-nav';
import { withAuth } from '@/lib/auth';
import { createClientFromContext } from '@/lib/supabase/server-props';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: string;
  subject_taught: string | null;
  institution_role: string | null;
  created_at: string;
}

interface TagEntry { tag: string; count: number }
interface Props { profile: Profile }

// ── Server-side ───────────────────────────────────────────────────────────────
export const getServerSideProps = withAuth(
  async (context, userId): Promise<GetServerSidePropsResult<Props>> => {
    const supabase = createClientFromContext(context);
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, subject_taught, institution_role, created_at')
      .eq('id', userId)
      .single();
    if (!profile || profile.role !== 'teacher') {
      return { redirect: { destination: '/auth/login', permanent: false } };
    }
    return { props: { profile: profile as Profile } };
  },
  { allowedRoles: ['teacher'] }
);

const NAV_ITEMS = TEACHER_NAV;

// ── Rename modal ──────────────────────────────────────────────────────────────
function RenameModal({
  tag,
  existingTags,
  onConfirm,
  onClose,
}: {
  tag: TagEntry;
  existingTags: string[];
  onConfirm: (from: string, to: string) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(tag.tag);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.select(); }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const conflict = value.trim() !== tag.tag &&
    existingTags.some((t) => t.toLowerCase() === value.trim().toLowerCase() && t !== tag.tag);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const to = value.trim();
    if (!to || to === tag.tag) { onClose(); return; }
    if (conflict) { setErr('A tag with this name already exists.'); return; }
    setSaving(true);
    setErr('');
    await onConfirm(tag.tag, to);
    setSaving(false);
  }

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
        transition={{ duration: 0.15 }}
        className="relative z-10 w-full max-w-sm rounded-2xl border border-gray-100 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-gray-600 transition hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="size-4" />
        </button>

        <div className="mb-5">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 ring-1 ring-violet-200">
            <Tag className="size-5 text-violet-600" />
          </div>
          <h3 className="text-base font-semibold text-gray-900">Rename tag</h3>
          <p className="mt-0.5 text-sm text-gray-500">
            Renames <span className="font-medium text-gray-700">&ldquo;{tag.tag}&rdquo;</span> across all{' '}
            {tag.count} question{tag.count !== 1 ? 's' : ''}.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => { setValue(e.target.value); setErr(''); }}
            placeholder="New tag name"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 transition focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100"
          />
          {(err || conflict) && (
            <p className="text-xs text-red-500">{err || 'A tag with this name already exists.'}</p>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !value.trim() || !!conflict}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              Rename
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ── Tag card ──────────────────────────────────────────────────────────────────
function TagCard({ entry, onRename }: { entry: TagEntry; onRename: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="group relative rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition hover:border-violet-200 hover:shadow-md"
    >
      {/* Rename button — appears on hover */}
      <button
        onClick={onRename}
        className="absolute right-3 top-3 flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-600 opacity-0 transition hover:bg-violet-50 hover:text-violet-600 group-hover:opacity-100"
      >
        <Pencil className="size-3" /> Rename
      </button>

      {/* Tag icon + name */}
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 ring-1 ring-violet-200">
        <Tag className="size-4 text-violet-600" />
      </div>

      <p className="truncate pr-16 text-sm font-semibold text-gray-900">{entry.tag}</p>

      <p className="mt-1 text-xs text-gray-600">
        {entry.count} question{entry.count !== 1 ? 's' : ''}
      </p>

      {/* Coloured bottom accent */}
      <div className="absolute bottom-0 left-5 right-5 h-0.5 rounded-full bg-violet-200 opacity-0 transition group-hover:opacity-100" />
    </motion.div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function TagsPage({ profile }: Props) {
  const [tags, setTags] = useState<TagEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [renaming, setRenaming] = useState<TagEntry | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function loadTags() {
    const r = await fetch('/api/questions/tags');
    if (r.ok) { const d = await r.json(); setTags(d.tags ?? []); }
    setLoading(false);
  }

  useEffect(() => { loadTags(); }, []);

  async function handleRename(from: string, to: string) {
    const r = await fetch('/api/questions/tags', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to }),
    });
    if (r.ok) {
      const d = await r.json();
      setRenaming(null);
      await loadTags();
      setToast(`"${from}" → "${d.tag}" · ${d.updated} question${d.updated !== 1 ? 's' : ''} updated`);
      setTimeout(() => setToast(null), 3500);
    }
  }

  const totalQuestions = tags.reduce((sum, t) => sum + t.count, 0);

  return (
    <DashboardLayout navItems={NAV_ITEMS} profile={profile} title="Question Bank">
      <div className="max-w-4xl space-y-8">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-600">Question tags</p>
          <h1 className="mt-0.5 text-2xl font-bold text-gray-900">Topic Tags</h1>
          <p className="mt-1 text-sm text-gray-500">
            Tags drive per-topic analytics after each session — use them to spot where students
            struggle. Rename a tag here to merge fragmented variants across all your questions.
          </p>
        </motion.div>

        {/* Stats row */}
        {!loading && tags.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 }}
            className="flex flex-wrap gap-3"
          >
            <div className="flex items-center gap-2.5 rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-100 ring-1 ring-violet-200">
                <Tag className="size-4 text-violet-600" />
              </span>
              <div>
                <p className="text-lg font-bold leading-none text-gray-900">{tags.length}</p>
                <p className="mt-0.5 text-xs text-gray-600">distinct tags</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-100 ring-1 ring-violet-200">
                <BookOpen className="size-4 text-violet-600" />
              </span>
              <div>
                <p className="text-lg font-bold leading-none text-gray-900">{totalQuestions}</p>
                <p className="mt-0.5 text-xs text-gray-600">tagged questions</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Tag grid */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}
        >
          <h2 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-gray-600">
            <Tag className="size-3.5" /> All tags
          </h2>

          {loading ? (
            <div className="flex h-32 items-center justify-center rounded-2xl border border-gray-100 bg-white shadow-sm">
              <Loader2 className="size-5 animate-spin text-gray-600" />
            </div>
          ) : tags.length === 0 ? (
            <div className="rounded-2xl border border-gray-100 bg-white px-8 py-16 text-center shadow-sm">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 ring-1 ring-violet-200">
                <Tag className="size-7 text-violet-600" />
              </span>
              <p className="mt-4 text-sm font-semibold text-gray-800">No tags yet</p>
              <p className="mt-1 text-xs text-gray-600 max-w-xs mx-auto">
                Open a quiz, expand <span className="font-medium text-gray-600">Advanced options</span> on
                any question, and set a Topic tag to get started.
              </p>
              <Link
                href="/teacher/quizzes"
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500"
              >
                Go to Quizzes
              </Link>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tags.map((t, i) => (
                <motion.div
                  key={t.tag}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.06 + i * 0.04 }}
                >
                  <TagCard entry={t} onRename={() => setRenaming(t)} />
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Rename modal */}
      <AnimatePresence>
        {renaming && (
          <RenameModal
            key="rename"
            tag={renaming}
            existingTags={tags.map((t) => t.tag)}
            onConfirm={handleRename}
            onClose={() => setRenaming(null)}
          />
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm font-medium text-emerald-700 shadow-lg"
          >
            <Check className="size-3.5 text-emerald-600" /> {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}
