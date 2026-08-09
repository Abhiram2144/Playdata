import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { GetServerSidePropsResult } from 'next';
import {
  GraduationCap, Plus, Users, BookOpen, Archive, ArchiveRestore, ChevronRight, X,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { TEACHER_NAV } from '@/lib/teacher-nav';
import { withAuth } from '@/lib/auth';
import { createClientFromContext } from '@/lib/supabase/server-props';
import { createAdminClient } from '@/lib/supabase/admin';

// ── Types ────────────────────────────────────────────────────────────────────

interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: string;
  subject_taught: string | null;
  institution_role: string | null;
  created_at: string;
}

interface Classroom {
  id: string;
  name: string;
  description: string | null;
  archived: boolean;
  created_at: string;
  student_count: number;
  session_count: number;
}

interface Props {
  profile: Profile;
  classrooms: Classroom[];
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
    const { data: rows } = await admin
      .from('classrooms')
      .select('id, name, description, archived, created_at, classroom_students(status), sessions(id)')
      .eq('teacher_id', userId)
      .order('created_at', { ascending: false });

    const classrooms: Classroom[] = (rows ?? []).map((c: Record<string, unknown>) => ({
      id: c.id as string,
      name: c.name as string,
      description: (c.description as string | null) ?? null,
      archived: c.archived as boolean,
      created_at: c.created_at as string,
      student_count: Array.isArray(c.classroom_students)
        ? (c.classroom_students as { status: string }[]).filter((s) => s.status !== 'removed').length
        : 0,
      session_count: Array.isArray(c.sessions) ? (c.sessions as unknown[]).length : 0,
    }));

    return { props: { profile, classrooms } };
  },
  { allowedRoles: ['teacher'] }
);

// ── Create modal ─────────────────────────────────────────────────────────────

function CreateModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (c: Classroom) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/teacher/classrooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Failed to create classroom'); return; }
      onCreate(json.classroom as Classroom);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-gray-900">Create classroom</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:text-gray-600 transition-colors">
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Year 10 Data Science"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-400/40"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Description <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="A brief description of this classroom…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-400/40 resize-none"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex gap-3 justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-violet-600 hover:bg-violet-700 text-white transition-colors disabled:opacity-60"
            >
              {saving ? 'Creating…' : 'Create classroom'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ── Classroom card grid ───────────────────────────────────────────────────────

function ClassroomGrid({
  classrooms,
  toggling,
  onToggleArchive,
}: {
  classrooms: Classroom[];
  toggling: string | null;
  onToggleArchive: (c: Classroom) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {classrooms.map((classroom, i) => (
        <motion.div
          key={classroom.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04 }}
          className={`group relative rounded-2xl border bg-white shadow-sm p-5 flex flex-col gap-3 transition-all ${
            classroom.archived
              ? 'border-gray-100 opacity-70'
              : 'border-gray-100 hover:border-violet-200 hover:shadow-md'
          }`}
        >
          <p className="text-sm font-semibold text-gray-800 leading-snug">
            {classroom.name}
          </p>

          {classroom.description && (
            <p className="text-xs text-gray-400 line-clamp-2">{classroom.description}</p>
          )}

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
              <Users className="size-3.5 text-gray-400" />
              {classroom.student_count} {classroom.student_count === 1 ? 'student' : 'students'}
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
              <BookOpen className="size-3.5 text-gray-400" />
              {classroom.session_count} {classroom.session_count === 1 ? 'session' : 'sessions'}
            </span>
          </div>

          <div className="mt-auto flex items-center justify-between pt-2 border-t border-gray-100">
            <button
              onClick={() => onToggleArchive(classroom)}
              disabled={toggling === classroom.id}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {classroom.archived
                ? <><ArchiveRestore className="size-3.5" /> Unarchive</>
                : <><Archive className="size-3.5" /> Archive</>
              }
            </button>
            <Link
              href={`/teacher/classrooms/${classroom.id}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 hover:text-violet-800 transition-colors"
            >
              View roster
              <ChevronRight className="size-3.5" />
            </Link>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ClassroomsPage({ profile, classrooms: initial }: Props) {
  const [list, setList] = useState<Classroom[]>(initial);
  const [showCreate, setShowCreate] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  const active = list.filter((c) => !c.archived);
  const archived = list.filter((c) => c.archived);

  function handleCreated(classroom: Classroom) {
    setList((prev) => [classroom, ...prev]);
    setShowCreate(false);
  }

  async function toggleArchive(classroom: Classroom) {
    setToggling(classroom.id);
    try {
      const res = await fetch(`/api/teacher/classrooms/${classroom.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !classroom.archived }),
      });
      if (res.ok) {
        setList((prev) =>
          prev.map((c) => c.id === classroom.id ? { ...c, archived: !c.archived } : c)
        );
      }
    } finally {
      setToggling(null);
    }
  }

  return (
    <DashboardLayout profile={profile} navItems={TEACHER_NAV}>
      <AnimatePresence>
        {showCreate && (
          <CreateModal onClose={() => setShowCreate(false)} onCreate={handleCreated} />
        )}
      </AnimatePresence>

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Teaching</p>
            <h1 className="mt-0.5 text-2xl font-bold text-gray-900">Classrooms</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              {active.length} active {active.length === 1 ? 'classroom' : 'classrooms'}
              {archived.length > 0 && `, ${archived.length} archived`}
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors"
          >
            <Plus className="size-4" />
            Create classroom
          </button>
        </div>

        {/* Active classrooms grid */}
        {active.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 rounded-full bg-gray-100 p-4">
              <GraduationCap className="size-8 text-gray-300" />
            </div>
            <p className="text-base font-medium text-gray-700">No classrooms yet</p>
            <p className="mt-1 text-sm text-gray-400">
              Create a classroom to organise your students and link it to sessions.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:border-violet-300 hover:text-violet-600 transition-colors"
            >
              <Plus className="size-4" />
              Create classroom
            </button>
          </div>
        ) : (
          <ClassroomGrid classrooms={active} toggling={toggling} onToggleArchive={toggleArchive} />
        )}

        {/* Archived classrooms */}
        {archived.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Archive className="size-4 text-gray-400" />
              <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                Archived ({archived.length})
              </p>
            </div>
            <ClassroomGrid classrooms={archived} toggling={toggling} onToggleArchive={toggleArchive} />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
