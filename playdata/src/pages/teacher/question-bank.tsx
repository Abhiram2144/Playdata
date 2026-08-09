import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check, Loader2, Pencil, Tag, X,
} from 'lucide-react';
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
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
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
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.15 }}
        className="relative z-10 w-full max-w-sm rounded-2xl border border-[#35354a]/60 bg-[#0d0d18] p-5 shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">Rename tag</h3>
            <p className="text-xs text-[#6a6a80]">
              Updates all {tag.count} question{tag.count !== 1 ? 's' : ''} using this tag.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-[#4a4a60] hover:text-white transition">
            <X className="size-3.5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => { setValue(e.target.value); setErr(''); }}
            placeholder="New tag name"
            className="w-full rounded-xl border border-[#35354a] bg-[#11111f] px-3 py-2 text-sm text-white placeholder-[#4a4a60] focus:border-violet-500/60 focus:outline-none"
          />
          {(err || conflict) && (
            <p className="text-xs text-red-400">{err || 'A tag with this name already exists.'}</p>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-[#35354a] py-2 text-sm text-[#8d8da0] transition hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !value.trim() || !!conflict}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-violet-600 py-2 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed"
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
      setToast(`"${from}" renamed to "${d.tag}" across ${d.updated} question${d.updated !== 1 ? 's' : ''}`);
      setTimeout(() => setToast(null), 3500);
    }
  }

  return (
    <DashboardLayout navItems={NAV_ITEMS} profile={profile}>
      <div className="max-w-2xl space-y-6">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
          <div className="flex items-center gap-2">
            <Tag className="size-5 text-violet-400" />
            <h1 className="text-xl font-bold text-white">Topic Tags</h1>
          </div>
          <p className="text-sm text-[#6a6a80]">
            Tags are applied per-question in your quizzes and drive topic-breakdown analytics after each session.
            Rename a tag here to merge fragmented variants across all your questions at once.
          </p>
        </motion.div>

        {/* Tag list */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04 }}
          className="rounded-2xl border border-[#35354a]/60 bg-[#11111f]/80"
        >
          <div className="flex items-center justify-between border-b border-[#35354a]/40 px-5 py-3.5">
            <span className="text-sm font-semibold text-[#c9c9d4]">Your tags</span>
            {!loading && (
              <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-xs text-violet-400">
                {tags.length}
              </span>
            )}
          </div>

          {loading ? (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="size-4 animate-spin text-[#4a4a60]" />
            </div>
          ) : tags.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <Tag className="mx-auto mb-2 size-6 text-[#35354a]" />
              <p className="text-sm text-[#6a6a80]">No tags yet.</p>
              <p className="mt-1 text-xs text-[#4a4a60]">
                Open a quiz, expand Advanced options on any question, and set a Topic tag.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-[#1a1a2e]">
              {tags.map((t) => (
                <li
                  key={t.tag}
                  className="group flex items-center justify-between px-5 py-3 hover:bg-[#0f0f1d]/60 transition"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 rounded-full bg-[#1a1a2e] px-2.5 py-0.5 text-xs font-medium text-[#8d8da0]">
                      <Tag className="size-2.5" /> {t.tag}
                    </span>
                    <span className="text-xs text-[#4a4a60]">
                      {t.count} question{t.count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <button
                    onClick={() => setRenaming(t)}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[#4a4a60] opacity-0 transition hover:bg-[#1a1a2e] hover:text-[#c9c9d4] group-hover:opacity-100"
                  >
                    <Pencil className="size-3" /> Rename
                  </button>
                </li>
              ))}
            </ul>
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
            exit={{ opacity: 0 }}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-400 shadow-xl"
          >
            <Check className="size-3.5" /> {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}
