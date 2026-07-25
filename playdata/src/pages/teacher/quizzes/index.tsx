import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, Plus, Copy, Trash2, Database, FolderPlus,
  CheckCircle, Clock, FileQuestion, AlertTriangle, Pencil,
  Crown, UserCheck, Share2,
} from 'lucide-react';
import { GetServerSidePropsResult } from 'next';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { TEACHER_NAV } from '@/lib/teacher-nav';
import { withAuth } from '@/lib/auth';
import { createClientFromContext } from '@/lib/supabase/server-props';
import { createAdminClient } from '@/lib/supabase/admin';

// ── Types ─────────────────────────────────────────────────────────────────────
type QuizStatus = 'draft' | 'in_progress' | 'assigned' | 'completed';

interface QuizSummary {
  id: string;
  title: string;
  description: string | null;
  status: QuizStatus;
  dataset_id: string | null;
  dataset_name: string | null;
  question_count: number;
  teacher_id: string;
  assigned_to: string | null;
  assigned_to_name: string | null;
  last_edited_by: string | null;
  last_edited_by_name: string | null;
  last_edited_at: string | null;
  created_at: string;
  updated_at: string;
  is_owner: boolean;
  is_assigned: boolean;
  my_role: string | null;
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
  quizzes: QuizSummary[];
}

// ── Server-side ───────────────────────────────────────────────────────────────
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

    // Get all quiz IDs where user is a collaborator
    const { data: collabRows } = await admin
      .from('quiz_collaborators')
      .select('quiz_id, role')
      .eq('teacher_id', userId);

    const collabQuizIds = (collabRows ?? []).map((r: { quiz_id: string }) => r.quiz_id);
    const roleMap = new Map(
      (collabRows ?? []).map((r: { quiz_id: string; role: string }) => [r.quiz_id, r.role])
    );

    const selectFields = 'id, title, description, status, dataset_id, teacher_id, assigned_to, last_edited_by, last_edited_at, created_at, updated_at, datasets(name), questions(id)';

    const [ownedResult, assignedResult] = await Promise.all([
      collabQuizIds.length > 0
        ? admin.from('quizzes').select(selectFields).in('id', collabQuizIds).order('created_at', { ascending: false })
        : { data: [], error: null },
      admin.from('quizzes').select(selectFields).eq('assigned_to', userId).order('created_at', { ascending: false }),
    ]);

    const seen = new Set<string>();
    const combined: Record<string, unknown>[] = [];
    for (const q of [...(ownedResult.data ?? []), ...(assignedResult.data ?? [])]) {
      const quiz = q as Record<string, unknown>;
      if (!seen.has(quiz.id as string)) {
        seen.add(quiz.id as string);
        combined.push(quiz);
      }
    }
    combined.sort((a, b) =>
      new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime()
    );

    // Batch-resolve profile names
    const profileIds = new Set<string>();
    combined.forEach((q) => {
      if (q.last_edited_by) profileIds.add(q.last_edited_by as string);
      if (q.assigned_to) profileIds.add(q.assigned_to as string);
    });

    const { data: profileRows } = profileIds.size > 0
      ? await admin.from('profiles').select('id, full_name').in('id', [...profileIds])
      : { data: [] };

    const nameMap = new Map(
      (profileRows ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name])
    );

    const quizzes: QuizSummary[] = combined.map((q) => ({
      id: q.id as string,
      title: q.title as string,
      description: q.description as string | null,
      status: q.status as QuizStatus,
      dataset_id: q.dataset_id as string | null,
      dataset_name: (q.datasets as { name: string } | null)?.name ?? null,
      question_count: Array.isArray(q.questions) ? (q.questions as unknown[]).length : 0,
      teacher_id: q.teacher_id as string,
      assigned_to: q.assigned_to as string | null,
      assigned_to_name: q.assigned_to ? (nameMap.get(q.assigned_to as string) ?? null) : null,
      last_edited_by: q.last_edited_by as string | null,
      last_edited_by_name: q.last_edited_by ? (nameMap.get(q.last_edited_by as string) ?? null) : null,
      last_edited_at: q.last_edited_at as string | null,
      created_at: q.created_at as string,
      updated_at: q.updated_at as string,
      is_owner: q.teacher_id === userId,
      is_assigned: q.assigned_to === userId,
      my_role: roleMap.get(q.id as string) ?? null,
    }));

    return { props: { profile, quizzes } };
  },
  { allowedRoles: ['teacher'] }
);

// ── Constants ─────────────────────────────────────────────────────────────────
const NAV_ITEMS = TEACHER_NAV;

const STATUS_META: Record<QuizStatus, { label: string; colour: string }> = {
  draft:       { label: 'Draft',       colour: 'bg-gray-100 text-gray-500' },
  in_progress: { label: 'In progress', colour: 'bg-amber-100 text-amber-700' },
  assigned:    { label: 'Assigned',    colour: 'bg-blue-100 text-blue-700' },
  completed:   { label: 'Completed',   colour: 'bg-emerald-100 text-emerald-700' },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Quiz card ─────────────────────────────────────────────────────────────────
function QuizCard({
  quiz,
  currentUserId,
  onDuplicate,
  onDelete,
  onMarkComplete,
  duplicating,
  deleting,
  completing,
}: {
  quiz: QuizSummary;
  currentUserId: string;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onMarkComplete: (id: string) => void;
  duplicating: string | null;
  deleting: string | null;
  completing: string | null;
}) {
  const status = STATUS_META[quiz.status] ?? STATUS_META.draft;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
    >
      <div className="flex items-start gap-4">
        {/* Icon */}
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 ring-1 ring-violet-200">
          <BookOpen className="size-5 text-violet-600" />
        </span>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-gray-900">{quiz.title}</h2>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.colour}`}>
              {status.label}
            </span>
            {/* Role badge */}
            {quiz.is_owner ? (
              <span className="flex items-center gap-0.5 rounded-full bg-violet-100 px-1.5 py-0.5 text-xs text-violet-700 ring-1 ring-violet-200">
                <Crown className="size-2.5" /> Owner
              </span>
            ) : quiz.my_role === 'contributor' ? (
              <span className="flex items-center gap-0.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500 ring-1 ring-gray-200">
                <UserCheck className="size-2.5" /> Contributor
              </span>
            ) : null}
          </div>

          {quiz.description && (
            <p className="mt-0.5 truncate text-xs text-gray-500">{quiz.description}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <FileQuestion className="size-3" />
              {quiz.question_count} question{quiz.question_count !== 1 ? 's' : ''}
            </span>
            {quiz.dataset_name && (
              <span className="flex items-center gap-1">
                <Database className="size-3" />
                {quiz.dataset_name}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="size-3" />
              {new Date(quiz.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            {quiz.assigned_to_name && quiz.assigned_to !== currentUserId && (
              <span className="flex items-center gap-1 text-blue-600">
                <UserCheck className="size-3" />
                Assigned to {quiz.assigned_to_name}
              </span>
            )}
            {quiz.last_edited_by_name && quiz.last_edited_at && (
              <span className="flex items-center gap-1 text-gray-400">
                <Pencil className="size-3" />
                {quiz.last_edited_by === currentUserId ? 'you' : quiz.last_edited_by_name}
                {' · '}{timeAgo(quiz.last_edited_at)}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/* Mark complete for assigned quizzes */}
          {(quiz.is_assigned || quiz.is_owner) && quiz.status === 'assigned' && (
            <button
              onClick={() => onMarkComplete(quiz.id)}
              disabled={completing === quiz.id}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-40"
            >
              <CheckCircle className="size-3" />
              {completing === quiz.id ? 'Updating…' : 'Complete'}
            </button>
          )}

          <Link
            href={`/teacher/quizzes/${quiz.id}`}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:border-violet-300 hover:text-violet-600"
          >
            <Pencil className="size-3" /> Edit
          </Link>

          {quiz.is_owner && (
            <>
              <Link
                href={`/teacher/quizzes/${quiz.id}#collaborators`}
                className="flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 transition hover:bg-violet-100"
              >
                <Share2 className="size-3" /> Share
              </Link>
              <button
                onClick={() => onDuplicate(quiz.id)}
                disabled={duplicating === quiz.id}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:border-violet-300 hover:text-violet-600 disabled:opacity-40"
              >
                <Copy className="size-3" />
                {duplicating === quiz.id ? 'Copying…' : 'Duplicate'}
              </button>
              <button
                onClick={() => onDelete(quiz.id)}
                className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-100"
              >
                <Trash2 className="size-3" />
              </button>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function QuizList({ profile, quizzes: initial }: Props) {
  const router = useRouter();
  const [quizzes, setQuizzes] = useState(initial);
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [completing, setCompleting] = useState<string | null>(null);

  const assignedToMe = quizzes.filter((q) => q.is_assigned && !q.is_owner && q.my_role !== 'contributor');
  const myQuizzes = quizzes.filter((q) => q.is_owner || q.my_role === 'contributor');

  const handleDuplicate = async (id: string) => {
    setDuplicating(id);
    const res = await fetch(`/api/teacher/quizzes/${id}/duplicate`, { method: 'POST' });
    const data = await res.json();
    setDuplicating(null);
    if (res.ok) router.push(`/teacher/quizzes/${data.quizId}`);
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    const res = await fetch(`/api/teacher/quizzes/${id}`, { method: 'DELETE' });
    setDeleting(null);
    setConfirmDelete(null);
    if (res.ok) setQuizzes((prev) => prev.filter((q) => q.id !== id));
  };

  const handleMarkComplete = async (id: string) => {
    setCompleting(id);
    const res = await fetch(`/api/teacher/quizzes/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    });
    setCompleting(null);
    if (res.ok) {
      setQuizzes((prev) =>
        prev.map((q) => q.id === id ? { ...q, status: 'completed' as QuizStatus } : q)
      );
    }
  };

  const cardProps = {
    currentUserId: profile.id,
    onDuplicate: handleDuplicate,
    onDelete: setConfirmDelete,
    onMarkComplete: handleMarkComplete,
    duplicating,
    deleting,
    completing,
  };

  return (
    <DashboardLayout navItems={NAV_ITEMS} profile={profile}>
      <div className="max-w-5xl space-y-8">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Quizzes</p>
            <h1 className="mt-0.5 text-2xl font-bold text-gray-900">Your Quizzes</h1>
          </div>
          <Link
            href="/teacher/quizzes/new"
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500"
          >
            <Plus className="size-4" /> New Quiz
          </Link>
        </motion.div>

        {/* Assigned to me section */}
        {assignedToMe.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 }}
          >
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-gray-400 flex items-center gap-2">
              <UserCheck className="size-3.5" /> Assigned to me
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                {assignedToMe.length}
              </span>
            </h2>
            <div className="space-y-3">
              {assignedToMe.map((quiz) => (
                <QuizCard key={quiz.id} quiz={quiz} {...cardProps} />
              ))}
            </div>
          </motion.div>
        )}

        {/* My quizzes section */}
        {myQuizzes.length === 0 && assignedToMe.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-2xl border border-gray-100 bg-white px-8 py-16 text-center shadow-sm"
          >
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 ring-1 ring-violet-200">
              <BookOpen className="size-7 text-violet-600" />
            </span>
            <p className="mt-4 text-sm font-semibold text-gray-800">No quizzes yet</p>
            <p className="mt-1 text-xs text-gray-400">Create your first quiz to get started.</p>
            <Link
              href="/teacher/quizzes/new"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500"
            >
              <Plus className="size-4" /> Create a quiz
            </Link>
          </motion.div>
        ) : myQuizzes.length > 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 }}
          >
            {assignedToMe.length > 0 && (
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-gray-400 flex items-center gap-2">
                <FolderPlus className="size-3.5" /> My quizzes
              </h2>
            )}
            <div className="space-y-3">
              {myQuizzes.map((quiz) => (
                <QuizCard key={quiz.id} quiz={quiz} {...cardProps} />
              ))}
            </div>
          </motion.div>
        ) : null}
      </div>

      {/* Delete confirmation modal */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-xl"
            >
              <div className="flex items-start gap-3 mb-5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-100 ring-1 ring-red-200">
                  <AlertTriangle className="size-4 text-red-500" />
                </span>
                <div>
                  <h2 className="text-sm font-bold text-gray-900">Delete quiz?</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    This will permanently delete the quiz and all its questions. This cannot be undone.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-500 transition hover:text-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(confirmDelete)}
                  disabled={deleting === confirmDelete}
                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
                >
                  {deleting === confirmDelete ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}
