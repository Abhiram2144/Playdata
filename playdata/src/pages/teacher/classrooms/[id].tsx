import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import { GetServerSidePropsResult } from 'next';
import {
  ArrowLeft, UserPlus, Users, MailCheck, MailX, X, Search, ChevronUp, ChevronDown,
  Upload, FileText, AlertTriangle, PlayCircle, BookOpen, BarChart2,
  Radio, CheckCircle2, Clock,
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
}

interface RosterStudent {
  id: string;
  email: string;
  status: 'invited' | 'active';
  invited_at: string;
  joined_at: string | null;
  student_id: string | null;
  full_name: string | null;
}

interface QuizSummary {
  id: string;
  title: string;
}

interface SessionSummary {
  id: string;
  title: string;
  status: 'waiting' | 'active' | 'ended';
  started_at: string | null;
  ended_at: string | null;
  participant_count: number;
  item_count: number;
}

interface Props {
  profile: Profile;
  classroom: Classroom;
  students: RosterStudent[];
  quizzes: QuizSummary[];
  sessions: SessionSummary[];
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

    const classroomId = context.params?.id as string;
    const admin = createAdminClient();

    const { data: classroom } = await admin
      .from('classrooms')
      .select('id, teacher_id, name, description, archived, created_at')
      .eq('id', classroomId)
      .single();

    if (!classroom || classroom.teacher_id !== userId) {
      return { redirect: { destination: '/teacher/classrooms', permanent: false } };
    }

    type ProfileJoin = { full_name: string; email: string } | { full_name: string; email: string }[] | null;

    const [{ data: rows }, { data: quizzesRows }, { data: sessionsRows }] = await Promise.all([
      admin
        .from('classroom_students')
        .select('id, email, status, invited_at, joined_at, student_id, profiles(full_name, email)')
        .eq('classroom_id', classroomId)
        .neq('status', 'removed')
        .order('invited_at', { ascending: false }),
      admin
        .from('quizzes')
        .select('id, title')
        .eq('teacher_id', userId)
        .order('created_at', { ascending: false }),
      admin
        .from('sessions')
        .select('id, title, status, started_at, ended_at, session_participants(id), session_items(id)')
        .eq('classroom_id', classroomId)
        .order('created_at', { ascending: false }),
    ]);

    const students: RosterStudent[] = (rows ?? []).map((row: {
      id: string;
      email: string;
      status: string;
      invited_at: string;
      joined_at: string | null;
      student_id: string | null;
      profiles: ProfileJoin;
    }) => {
      const prof = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return {
        id: row.id,
        email: row.email,
        status: row.status as 'invited' | 'active',
        invited_at: row.invited_at,
        joined_at: row.joined_at,
        student_id: row.student_id,
        full_name: prof?.full_name ?? null,
      };
    });

    const sessions: SessionSummary[] = (sessionsRows ?? []).map((s: Record<string, unknown>) => ({
      id: s.id as string,
      title: s.title as string,
      status: s.status as 'waiting' | 'active' | 'ended',
      started_at: s.started_at as string | null,
      ended_at: s.ended_at as string | null,
      participant_count: Array.isArray(s.session_participants) ? (s.session_participants as unknown[]).length : 0,
      item_count: Array.isArray(s.session_items) ? (s.session_items as unknown[]).length : 0,
    }));

    return {
      props: {
        profile,
        classroom: {
          id: classroom.id,
          name: classroom.name,
          description: classroom.description,
          archived: classroom.archived,
          created_at: classroom.created_at,
        },
        students,
        quizzes: (quizzesRows ?? []) as QuizSummary[],
        sessions,
      },
    };
  },
  { allowedRoles: ['teacher'] }
);

// ── Add-students modal ───────────────────────────────────────────────────────

interface AddSummary {
  added_active: number;
  added_invited: number;
  skipped: number;
  invalid_count?: number; // only populated by file-upload path
}

// ── Summary panel (shared by both tabs) ──────────────────────────────────────

function SummaryPanel({ summary, onDone }: { summary: AddSummary; onDone: () => void }) {
  const nothingAdded = summary.added_active === 0 && summary.added_invited === 0;
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 space-y-2.5">
        {summary.added_active > 0 && (
          <div className="flex items-center gap-2.5">
            <span className="inline-flex size-6 items-center justify-center rounded-full bg-emerald-100">
              <MailCheck className="size-3.5 text-emerald-600" />
            </span>
            <span className="text-sm text-gray-700">
              <span className="font-semibold text-emerald-700">{summary.added_active}</span>
              {' '}added as active — account already exists
            </span>
          </div>
        )}
        {summary.added_invited > 0 && (
          <div className="flex items-center gap-2.5">
            <span className="inline-flex size-6 items-center justify-center rounded-full bg-violet-100">
              <MailX className="size-3.5 text-violet-600" />
            </span>
            <span className="text-sm text-gray-700">
              <span className="font-semibold text-violet-700">{summary.added_invited}</span>
              {' '}pending invite — will activate on sign-up
            </span>
          </div>
        )}
        {summary.skipped > 0 && (
          <div className="flex items-center gap-2.5">
            <span className="inline-flex size-6 items-center justify-center rounded-full bg-gray-100">
              <span className="text-xs font-bold text-gray-500">—</span>
            </span>
            <span className="text-sm text-gray-500">
              <span className="font-semibold">{summary.skipped}</span>
              {' '}already on the roster (skipped)
            </span>
          </div>
        )}
        {(summary.invalid_count ?? 0) > 0 && (
          <div className="flex items-center gap-2.5">
            <span className="inline-flex size-6 items-center justify-center rounded-full bg-rose-100">
              <AlertTriangle className="size-3.5 text-rose-500" />
            </span>
            <span className="text-sm text-gray-500">
              <span className="font-semibold text-rose-600">{summary.invalid_count}</span>
              {' '}address{summary.invalid_count === 1 ? '' : 'es'} looked invalid — add manually
            </span>
          </div>
        )}
        {nothingAdded && summary.skipped > 0 && (
          <p className="text-sm text-gray-500 text-center pt-1">
            All provided emails are already on the roster.
          </p>
        )}
        {nothingAdded && summary.skipped === 0 && (
          <p className="text-sm text-gray-500 text-center pt-1">
            No valid email addresses found in the file.
          </p>
        )}
      </div>
      <div className="flex justify-end">
        <button
          onClick={onDone}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-violet-600 hover:bg-violet-700 text-white transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

type ModalTab = 'manual' | 'upload';

function AddStudentsModal({
  classroomId,
  onClose,
  onAdded,
}: {
  classroomId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [tab, setTab] = useState<ModalTab>('manual');
  const [summary, setSummary] = useState<AddSummary | null>(null);

  // Manual-entry state
  const [emails, setEmails] = useState('');
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState('');

  // File-upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadSaving, setUploadSaving] = useState(false);
  const [uploadError, setUploadError] = useState('');

  function handleDone() {
    onAdded();
    onClose();
  }

  // ── Manual submit ──────────────────────────────────────────────────────────
  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!emails.trim()) { setManualError('Enter at least one email address'); return; }
    setManualSaving(true);
    setManualError('');
    try {
      const res = await fetch(`/api/teacher/classrooms/${classroomId}/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails }),
      });
      const json = await res.json();
      if (!res.ok) { setManualError(json.error ?? 'Failed to add students'); return; }
      setSummary(json as AddSummary);
    } finally {
      setManualSaving(false);
    }
  }

  // ── File-drop helpers ──────────────────────────────────────────────────────
  function acceptFile(f: File) {
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (!['csv', 'txt', 'xlsx', 'docx'].includes(ext)) {
      setUploadError('Only .csv, .txt, .xlsx, and .docx files are accepted.');
      return;
    }
    setUploadError('');
    setFile(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) acceptFile(f);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) acceptFile(f);
  }

  // ── Upload submit ──────────────────────────────────────────────────────────
  async function handleUploadSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setUploadError('Choose a file first'); return; }
    setUploadSaving(true);
    setUploadError('');
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch(`/api/teacher/classrooms/${classroomId}/students/upload`, {
        method: 'POST',
        body,
      });
      const json = await res.json();
      if (!res.ok) { setUploadError(json.error ?? 'Upload failed'); return; }
      setSummary(json as AddSummary);
    } finally {
      setUploadSaving(false);
    }
  }

  const tabCls = (t: ModalTab) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      tab === t
        ? 'bg-violet-50 text-violet-700'
        : 'text-gray-500 hover:text-gray-700'
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">Add students</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-500 hover:text-gray-600 transition-colors">
            <X className="size-4" />
          </button>
        </div>

        {summary ? (
          <SummaryPanel summary={summary} onDone={handleDone} />
        ) : (
          <>
            {/* Tabs */}
            <div className="flex gap-1 mb-5 bg-gray-50 rounded-xl p-1">
              <button className={tabCls('manual')} onClick={() => setTab('manual')}>
                Type emails
              </button>
              <button className={tabCls('upload')} onClick={() => setTab('upload')}>
                <span className="inline-flex items-center gap-1.5">
                  <Upload className="size-3.5" />
                  Upload a list
                </span>
              </button>
            </div>

            {/* ── Manual tab ──────────────────────────────────────────────── */}
            {tab === 'manual' && (
              <form onSubmit={handleManualSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Email addresses
                  </label>
                  <textarea
                    autoFocus
                    value={emails}
                    onChange={(e) => setEmails(e.target.value)}
                    rows={6}
                    placeholder={`alice@example.com\nbob@example.com, carol@example.com`}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-400/40 resize-none font-mono"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Separate with commas, spaces, or new lines. Duplicates are ignored.
                  </p>
                </div>
                {manualError && <p className="text-xs text-red-500">{manualError}</p>}
                <div className="flex gap-3 justify-end">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={manualSaving}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={manualSaving}
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-violet-600 hover:bg-violet-700 text-white transition-colors disabled:opacity-60"
                  >
                    {manualSaving ? 'Adding…' : 'Add students'}
                  </button>
                </div>
              </form>
            )}

            {/* ── Upload tab ───────────────────────────────────────────────── */}
            {tab === 'upload' && (
              <form onSubmit={handleUploadSubmit} className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-2">
                    Accepts <span className="font-mono">.csv</span>, <span className="font-mono">.xlsx</span>,{' '}
                    <span className="font-mono">.txt</span>, <span className="font-mono">.docx</span>
                    {' '}— emails are extracted regardless of structure.
                  </p>

                  {/* Drop zone */}
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 cursor-pointer transition-colors ${
                      dragOver
                        ? 'border-violet-400 bg-violet-50'
                        : file
                        ? 'border-emerald-300 bg-emerald-50'
                        : 'border-gray-200 bg-gray-50 hover:border-violet-300 hover:bg-violet-50/40'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.txt,.xlsx,.docx"
                      className="sr-only"
                      onChange={handleFileChange}
                    />

                    {file ? (
                      <>
                        <FileText className="size-8 text-emerald-500" />
                        <div className="text-center">
                          <p className="text-sm font-medium text-gray-800 truncate max-w-[280px]">
                            {file.name}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {(file.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                          className="mt-1 text-xs text-gray-500 hover:text-red-500 transition-colors"
                        >
                          Remove
                        </button>
                      </>
                    ) : (
                      <>
                        <Upload className="size-8 text-gray-300" />
                        <div className="text-center">
                          <p className="text-sm font-medium text-gray-700">
                            Drop your file here
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            or <span className="text-violet-600 underline underline-offset-2">browse to choose</span>
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}

                <div className="flex gap-3 justify-end">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={uploadSaving}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={uploadSaving || !file}
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-violet-600 hover:bg-violet-700 text-white transition-colors disabled:opacity-60"
                  >
                    {uploadSaving ? 'Processing…' : 'Upload and add'}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
}

// ── Start-session modal ───────────────────────────────────────────────────────

function StartSessionModal({
  classroomId,
  quizzes,
  onClose,
}: {
  classroomId: string;
  quizzes: QuizSummary[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [selectedQuizId, setSelectedQuizId] = useState('');
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function handleQuizSelect(id: string) {
    setSelectedQuizId(id);
    const quiz = quizzes.find((q) => q.id === id);
    if (quiz) setTitle(quiz.title);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedQuizId) { setError('Select a quiz first'); return; }
    if (!title.trim()) { setError('Session title is required'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/teacher/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), classroomId, quizId: selectedQuizId }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Failed to create session'); return; }
      router.push(`/teacher/sessions/${json.sessionId}/live`);
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
          <h3 className="text-base font-semibold text-gray-900">Start a quiz for this class</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-500 hover:text-gray-600 transition-colors">
            <X className="size-4" />
          </button>
        </div>

        {quizzes.length === 0 ? (
          <div className="py-8 text-center space-y-3">
            <BookOpen className="size-8 text-gray-300 mx-auto" />
            <p className="text-sm text-gray-500">You have no quizzes yet.</p>
            <Link
              href="/teacher/quizzes"
              className="inline-flex items-center gap-1.5 text-sm text-violet-600 hover:text-violet-800 transition-colors"
            >
              Create a quiz first
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Quiz picker */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Select quiz</label>
              <div className="max-h-52 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
                {quizzes.map((quiz) => (
                  <label
                    key={quiz.id}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                      selectedQuizId === quiz.id ? 'bg-violet-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="quiz"
                      value={quiz.id}
                      checked={selectedQuizId === quiz.id}
                      onChange={() => handleQuizSelect(quiz.id)}
                      className="accent-violet-600"
                    />
                    <span className={`text-sm ${selectedQuizId === quiz.id ? 'font-medium text-violet-800' : 'text-gray-700'}`}>
                      {quiz.title}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Session title */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Session title
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Week 3 — Data distributions"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-400/40"
              />
              <p className="mt-1 text-xs text-gray-500">
                Invites are sent automatically when you click &ldquo;Start&rdquo; on the live page.
                The join code is still shown as a fallback.
              </p>
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
                disabled={saving || !selectedQuizId}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-violet-600 hover:bg-violet-700 text-white transition-colors disabled:opacity-60"
              >
                <PlayCircle className="size-4" />
                {saving ? 'Creating…' : 'Go to live view'}
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
}

// ── Remove confirmation modal ─────────────────────────────────────────────────

function RemoveModal({
  student,
  classroomId,
  onConfirm,
  onCancel,
  removing,
}: {
  student: RosterStudent;
  classroomId: string;
  onConfirm: () => void;
  onCancel: () => void;
  removing: boolean;
}) {
  void classroomId;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-xl"
      >
        <h3 className="text-base font-semibold text-gray-900 mb-2">Remove student?</h3>
        <p className="text-sm text-gray-500 mb-1">
          <span className="font-medium text-gray-800">{student.full_name ?? student.email}</span>
          {student.full_name && (
            <span className="text-gray-500"> · {student.email}</span>
          )}
        </p>
        <p className="text-sm text-gray-500 mb-6">
          Their history is kept. You can re-add them later.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={removing}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={removing}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-60"
          >
            {removing ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Sort helpers ─────────────────────────────────────────────────────────────

type SortKey = 'email' | 'name' | 'status' | 'invited_at';
type SortDir = 'asc' | 'desc';

function sortStudents(students: RosterStudent[], key: SortKey, dir: SortDir): RosterStudent[] {
  return [...students].sort((a, b) => {
    let va: string, vb: string;
    if (key === 'name') {
      va = (a.full_name ?? a.email).toLowerCase();
      vb = (b.full_name ?? b.email).toLowerCase();
    } else if (key === 'invited_at') {
      va = a.invited_at;
      vb = b.invited_at;
    } else {
      va = (a[key] as string).toLowerCase();
      vb = (b[key] as string).toLowerCase();
    }
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return dir === 'asc' ? cmp : -cmp;
  });
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ClassroomRosterPage({ profile, classroom, students: initial, quizzes, sessions }: Props) {
  const [students, setStudents] = useState<RosterStudent[]>(initial);
  const [showAdd, setShowAdd] = useState(false);
  const [showStartSession, setShowStartSession] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<RosterStudent | null>(null);
  const [removing, setRemoving] = useState(false);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('invited_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const activeCount = students.filter((s) => s.status === 'active').length;
  const invitedCount = students.filter((s) => s.status === 'invited').length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? students.filter(
          (s) =>
            s.email.includes(q) ||
            (s.full_name ?? '').toLowerCase().includes(q)
        )
      : students;
    return sortStudents(base, sortKey, sortDir);
  }, [students, search, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  async function handleRefresh() {
    const res = await fetch(`/api/teacher/classrooms/${classroom.id}`);
    if (res.ok) {
      const json = await res.json();
      setStudents(json.students as RosterStudent[]);
    }
  }

  async function handleRemove() {
    if (!pendingRemove) return;
    setRemoving(true);
    try {
      const res = await fetch(
        `/api/teacher/classrooms/${classroom.id}/students/${pendingRemove.id}`,
        { method: 'PATCH' }
      );
      if (res.ok) {
        setStudents((prev) => prev.filter((s) => s.id !== pendingRemove.id));
        setPendingRemove(null);
      }
    } finally {
      setRemoving(false);
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronUp className="size-3 text-gray-300" />;
    return sortDir === 'asc'
      ? <ChevronUp className="size-3 text-violet-500" />
      : <ChevronDown className="size-3 text-violet-500" />;
  }

  function thBtn(col: SortKey, label: string) {
    return (
      <button
        onClick={() => handleSort(col)}
        className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-700 transition-colors"
      >
        {label}
        <SortIcon col={col} />
      </button>
    );
  }

  return (
    <DashboardLayout profile={profile} navItems={TEACHER_NAV} title={classroom.name}>
      <AnimatePresence>
        {showAdd && (
          <AddStudentsModal
            classroomId={classroom.id}
            onClose={() => setShowAdd(false)}
            onAdded={handleRefresh}
          />
        )}
        {showStartSession && (
          <StartSessionModal
            classroomId={classroom.id}
            quizzes={quizzes}
            onClose={() => setShowStartSession(false)}
          />
        )}
        {pendingRemove && (
          <RemoveModal
            student={pendingRemove}
            classroomId={classroom.id}
            onConfirm={handleRemove}
            onCancel={() => setPendingRemove(null)}
            removing={removing}
          />
        )}
      </AnimatePresence>

      <div className="space-y-6">
        {/* Back + Header */}
        <div>
          <Link
            href="/teacher/classrooms"
            className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-700 transition-colors mb-3"
          >
            <ArrowLeft className="size-3.5" />
            All classrooms
          </Link>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-600">Classroom</p>
              <h1 className="mt-0.5 text-2xl font-bold text-gray-900">{classroom.name}</h1>
              {classroom.description && (
                <p className="mt-0.5 text-sm text-gray-600">{classroom.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href={`/teacher/classrooms/${classroom.id}/analytics`}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 px-4 py-2.5 text-sm font-semibold text-gray-600 transition-colors"
              >
                <BarChart2 className="size-4" />
                Analytics
              </Link>
              <button
                onClick={() => setShowStartSession(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 hover:bg-violet-100 px-4 py-2.5 text-sm font-semibold text-violet-700 transition-colors"
              >
                <PlayCircle className="size-4" />
                Start quiz for this class
              </button>
              <button
                onClick={() => setShowAdd(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors"
              >
                <UserPlus className="size-4" />
                Add students
              </button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="inline-flex items-center gap-2 rounded-xl bg-white border border-gray-100 shadow-sm px-4 py-2.5">
            <Users className="size-4 text-violet-500" />
            <span className="text-sm font-semibold text-gray-800">{students.length}</span>
            <span className="text-xs text-gray-500">total</span>
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl bg-white border border-gray-100 shadow-sm px-4 py-2.5">
            <MailCheck className="size-4 text-emerald-500" />
            <span className="text-sm font-semibold text-gray-800">{activeCount}</span>
            <span className="text-xs text-gray-500">active</span>
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl bg-white border border-gray-100 shadow-sm px-4 py-2.5">
            <MailX className="size-4 text-amber-500" />
            <span className="text-sm font-semibold text-gray-800">{invitedCount}</span>
            <span className="text-xs text-gray-500">invited</span>
          </div>
        </div>

        {/* Search */}
        {students.length > 0 && (
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-500 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email…"
              className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-400/40"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-600"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Sessions */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Sessions</h2>
          {sessions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-5 py-10 text-center">
              <PlayCircle className="mx-auto size-7 text-gray-300 mb-2" />
              <p className="text-sm text-gray-500">No sessions run for this classroom yet.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden divide-y divide-gray-50">
              {sessions.map((s) => {
                const isActive = s.status === 'active'
                const isWaiting = s.status === 'waiting'
                const isEnded = s.status === 'ended'
                const date = s.started_at ?? s.ended_at
                return (
                  <div key={s.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50/60 transition-colors">
                    <div className="shrink-0">
                      {isActive || isWaiting ? (
                        <span className="flex size-8 items-center justify-center rounded-full bg-emerald-100">
                          <Radio className="size-4 text-emerald-600" />
                        </span>
                      ) : (
                        <span className="flex size-8 items-center justify-center rounded-full bg-gray-100">
                          <CheckCircle2 className="size-4 text-gray-500" />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-800 truncate">{s.title}</p>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className="text-xs text-gray-500">
                          {s.participant_count} student{s.participant_count !== 1 ? 's' : ''}
                        </span>
                        <span className="text-gray-200">·</span>
                        <span className="text-xs text-gray-500">
                          {s.item_count} item{s.item_count !== 1 ? 's' : ''}
                        </span>
                        {date && (
                          <>
                            <span className="text-gray-200">·</span>
                            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                              <Clock className="size-3" />
                              {new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      {isActive || isWaiting ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          </span>
                          Live
                        </span>
                      ) : (
                        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                          Ended
                        </span>
                      )}
                      <Link
                        href={isActive || isWaiting ? `/teacher/sessions/${s.id}/live` : `/teacher/sessions/${s.id}/results`}
                        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-violet-300 hover:text-violet-700 transition-colors shadow-sm"
                      >
                        {isActive || isWaiting ? 'Go to live' : 'View results'}
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Roster table */}
        {students.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 rounded-full bg-gray-100 p-4">
              <Users className="size-8 text-gray-300" />
            </div>
            <p className="text-base font-medium text-gray-700">No students yet</p>
            <p className="mt-1 text-sm text-gray-500">
              Add student emails to invite them to this classroom.
            </p>
            <button
              onClick={() => setShowAdd(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:border-violet-300 hover:text-violet-600 transition-colors"
            >
              <UserPlus className="size-4" />
              Add students
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-gray-500">No students match &ldquo;{search}&rdquo;</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-5 py-3">{thBtn('name', 'Name / Email')}</th>
                  <th className="text-left px-5 py-3 hidden sm:table-cell">{thBtn('email', 'Email')}</th>
                  <th className="text-left px-5 py-3">{thBtn('status', 'Status')}</th>
                  <th className="text-left px-5 py-3 hidden md:table-cell">{thBtn('invited_at', 'Invited')}</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((student, i) => (
                  <motion.tr
                    key={student.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className="hover:bg-gray-50/60 transition-colors"
                  >
                    {/* Name / email (primary cell, shown always) */}
                    <td className="px-5 py-3.5">
                      {student.full_name ? (
                        <div>
                          <p className="font-medium text-gray-800 text-sm">{student.full_name}</p>
                          <p className="text-xs text-gray-500 sm:hidden">{student.email}</p>
                        </div>
                      ) : (
                        <p className="text-gray-500 italic text-sm">No account yet</p>
                      )}
                    </td>

                    {/* Email (hidden on small screens — shown in primary cell) */}
                    <td className="px-5 py-3.5 hidden sm:table-cell text-gray-500 text-xs">
                      {student.email}
                    </td>

                    {/* Status badge */}
                    <td className="px-5 py-3.5">
                      {student.status === 'active' ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-100">
                          <span className="size-1.5 rounded-full bg-emerald-500" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-100">
                          <span className="size-1.5 rounded-full bg-amber-400" />
                          Invited
                        </span>
                      )}
                    </td>

                    {/* Invited at */}
                    <td className="px-5 py-3.5 hidden md:table-cell text-xs text-gray-500">
                      {new Date(student.invited_at).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>

                    {/* Remove */}
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => setPendingRemove(student)}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        Remove
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
