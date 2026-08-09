'use client';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, UserPlus, X, Crown, UserCheck, Search,
  CheckCircle, AlertTriangle, ChevronRight,
} from 'lucide-react';

export interface CollaboratorRow {
  teacher_id: string;
  role: 'owner' | 'contributor';
  added_at: string;
  full_name: string;
  email: string;
}

interface TeacherResult {
  id: string;
  full_name: string;
  email: string;
}

interface AssignedProfile {
  id: string;
  full_name: string;
  email: string;
}

interface Props {
  quizId: string;
  currentUserId: string;
  isOwner: boolean;
  isAssigned: boolean;
  initialCollaborators: CollaboratorRow[];
  initialAssignedTo: AssignedProfile | null;
  initialStatus: string;
}

export default function CollaboratorsPanel({
  quizId,
  currentUserId,
  isOwner,
  isAssigned,
  initialCollaborators,
  initialAssignedTo,
  initialStatus,
}: Props) {
  const [collaborators, setCollaborators] = useState<CollaboratorRow[]>(initialCollaborators);
  const [assignedTo, setAssignedTo] = useState<AssignedProfile | null>(initialAssignedTo);
  const [status, setStatus] = useState(initialStatus);

  const [collabSearch, setCollabSearch] = useState('');
  const [collabResults, setCollabResults] = useState<TeacherResult[]>([]);
  const [collabSearching, setCollabSearching] = useState(false);
  const [addingCollab, setAddingCollab] = useState<string | null>(null);
  const [removingCollab, setRemovingCollab] = useState<string | null>(null);
  const collabDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [assignSearch, setAssignSearch] = useState('');
  const [assignResults, setAssignResults] = useState<TeacherResult[]>([]);
  const [assignSearching, setAssignSearching] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [clearingAssign, setClearingAssign] = useState(false);
  const assignDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [flash, setFlash] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  function showFlash(type: 'ok' | 'err', msg: string) {
    setFlash({ type, msg });
    setTimeout(() => setFlash(null), 3000);
  }

  useEffect(() => {
    if (!isOwner) return;
    if (collabDebounce.current) clearTimeout(collabDebounce.current);
    if (!collabSearch.trim()) { setCollabResults([]); return; }
    collabDebounce.current = setTimeout(async () => {
      setCollabSearching(true);
      const r = await fetch(`/api/teacher/quizzes/search-teachers?q=${encodeURIComponent(collabSearch)}&quizId=${quizId}`);
      const d = await r.json();
      setCollabResults(d.teachers ?? []);
      setCollabSearching(false);
    }, 350);
    return () => { if (collabDebounce.current) clearTimeout(collabDebounce.current); };
  }, [collabSearch, isOwner, quizId]);

  const addCollaborator = async (teacher: TeacherResult) => {
    setAddingCollab(teacher.id);
    const r = await fetch(`/api/teacher/quizzes/${quizId}/collaborators`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacher_id: teacher.id }),
    });
    const d = await r.json();
    setAddingCollab(null);
    if (!r.ok) { showFlash('err', d.error ?? 'Failed to add'); return; }
    setCollaborators((prev) => [...prev, d.collaborator]);
    setCollabSearch('');
    setCollabResults([]);
    showFlash('ok', `${teacher.full_name} added as contributor`);
  };

  const removeCollaborator = async (tid: string) => {
    setRemovingCollab(tid);
    const r = await fetch(`/api/teacher/quizzes/${quizId}/collaborators/${tid}`, { method: 'DELETE' });
    const d = await r.json();
    setRemovingCollab(null);
    if (!r.ok) { showFlash('err', d.error ?? 'Failed to remove'); return; }
    setCollaborators((prev) => prev.filter((c) => c.teacher_id !== tid));
  };

  useEffect(() => {
    if (!isOwner) return;
    if (assignDebounce.current) clearTimeout(assignDebounce.current);
    if (!assignSearch.trim()) { setAssignResults([]); return; }
    assignDebounce.current = setTimeout(async () => {
      setAssignSearching(true);
      const r = await fetch(`/api/teacher/quizzes/search-teachers?q=${encodeURIComponent(assignSearch)}`);
      const d = await r.json();
      setAssignResults((d.teachers ?? []).filter((t: TeacherResult) => t.id !== currentUserId && t.id !== assignedTo?.id));
      setAssignSearching(false);
    }, 350);
    return () => { if (assignDebounce.current) clearTimeout(assignDebounce.current); };
  }, [assignSearch, isOwner, currentUserId, assignedTo]);

  const assign = async (teacher: TeacherResult) => {
    setAssigning(true);
    const r = await fetch(`/api/teacher/quizzes/${quizId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigned_to: teacher.id }),
    });
    const d = await r.json();
    setAssigning(false);
    if (!r.ok) { showFlash('err', d.error ?? 'Failed to assign'); return; }
    setAssignedTo({ id: teacher.id, full_name: teacher.full_name, email: teacher.email });
    setStatus('assigned');
    setAssignSearch('');
    setAssignResults([]);
    showFlash('ok', `Assigned to ${teacher.full_name}`);
  };

  const clearAssignment = async () => {
    setClearingAssign(true);
    const r = await fetch(`/api/teacher/quizzes/${quizId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigned_to: null }),
    });
    const d = await r.json();
    setClearingAssign(false);
    if (!r.ok) { showFlash('err', d.error ?? 'Failed'); return; }
    setAssignedTo(null);
    setStatus('in_progress');
  };

  const markComplete = async () => {
    setUpdatingStatus(true);
    const r = await fetch(`/api/teacher/quizzes/${quizId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    });
    const d = await r.json();
    setUpdatingStatus(false);
    if (!r.ok) { showFlash('err', d.error ?? 'Failed'); return; }
    setStatus('completed');
    showFlash('ok', 'Marked as completed');
  };

  const STATUS_COLOUR: Record<string, string> = {
    draft:       'bg-gray-100 text-gray-500',
    in_progress: 'bg-amber-100 text-amber-700',
    assigned:    'bg-blue-100 text-blue-700',
    completed:   'bg-emerald-100 text-emerald-700',
  };
  const STATUS_LABEL: Record<string, string> = {
    draft: 'Draft', in_progress: 'In progress', assigned: 'Assigned', completed: 'Completed',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-6"
    >
      {/* Flash */}
      <AnimatePresence>
        {flash && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`fixed top-6 right-6 z-50 flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm shadow-xl ${
              flash.type === 'ok'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {flash.type === 'ok'
              ? <CheckCircle className="size-4" />
              : <AlertTriangle className="size-4" />}
            {flash.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center gap-2">
        <Users className="size-4 text-violet-600" />
        <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Collaboration</span>
        <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOUR[status] ?? STATUS_COLOUR.draft}`}>
          {STATUS_LABEL[status] ?? status}
        </span>
      </div>

      {/* Collaborators list */}
      <div>
        <p className="mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Members</p>
        <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden">
          {collaborators.map((c) => (
            <div key={c.teacher_id} className="flex items-center gap-3 px-4 py-2.5 bg-gray-50">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs ${
                c.role === 'owner'
                  ? 'bg-violet-100 ring-1 ring-violet-200'
                  : 'bg-gray-100 ring-1 ring-gray-200'
              }`}>
                {c.role === 'owner'
                  ? <Crown className="size-3.5 text-violet-600" />
                  : <UserCheck className="size-3.5 text-gray-400" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800">
                  {c.full_name}
                  {c.teacher_id === currentUserId && (
                    <span className="ml-1.5 text-xs text-gray-400">(you)</span>
                  )}
                </p>
                <p className="truncate text-xs text-gray-400">{c.email}</p>
              </div>
              <span className="shrink-0 text-xs text-gray-400 capitalize">{c.role}</span>
              {isOwner && c.role !== 'owner' && (
                <button
                  onClick={() => removeCollaborator(c.teacher_id)}
                  disabled={removingCollab === c.teacher_id}
                  className="ml-1 p-1 text-gray-400 transition hover:text-red-500 disabled:opacity-40"
                  title="Remove contributor"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Add collaborator (owner only) */}
      {isOwner && (
        <div>
          <p className="mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1">
            <UserPlus className="size-3" /> Invite contributor
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-gray-400" />
            <input
              value={collabSearch}
              onChange={(e) => setCollabSearch(e.target.value)}
              placeholder="Search by name or email…"
              className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
            />
          </div>
          <AnimatePresence>
            {(collabResults.length > 0 || collabSearching) && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-1 rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm"
              >
                {collabSearching && (
                  <p className="px-4 py-2.5 text-xs text-gray-400">Searching…</p>
                )}
                {!collabSearching && collabResults.length === 0 && (
                  <p className="px-4 py-2.5 text-xs text-gray-400">No teachers found</p>
                )}
                {collabResults.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => addCollaborator(t)}
                    disabled={addingCollab === t.id}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-violet-50 disabled:opacity-50 transition"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-gray-800">{t.full_name}</p>
                      <p className="truncate text-xs text-gray-400">{t.email}</p>
                    </div>
                    <ChevronRight className="size-3.5 text-gray-400 shrink-0" />
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Assign to teacher (owner only) */}
      {isOwner && (
        <div>
          <p className="mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1">
            <UserCheck className="size-3" /> Assign to teacher
          </p>
          {assignedTo ? (
            <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800">{assignedTo.full_name}</p>
                <p className="text-xs text-gray-500">{assignedTo.email}</p>
              </div>
              <button
                onClick={clearAssignment}
                disabled={clearingAssign}
                className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-500 transition hover:text-gray-800 disabled:opacity-40"
              >
                {clearingAssign ? 'Clearing…' : 'Clear'}
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-gray-400" />
              <input
                value={assignSearch}
                onChange={(e) => setAssignSearch(e.target.value)}
                placeholder="Search teacher to assign…"
                className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
              />
              <AnimatePresence>
                {(assignResults.length > 0 || assignSearching) && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="absolute top-full left-0 right-0 mt-1 z-10 rounded-xl border border-gray-200 bg-white overflow-hidden shadow-lg"
                  >
                    {assignSearching && (
                      <p className="px-4 py-2.5 text-xs text-gray-400">Searching…</p>
                    )}
                    {!assignSearching && assignResults.length === 0 && (
                      <p className="px-4 py-2.5 text-xs text-gray-400">No teachers found</p>
                    )}
                    {assignResults.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => assign(t)}
                        disabled={assigning}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-violet-50 disabled:opacity-50 transition"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-gray-800">{t.full_name}</p>
                          <p className="truncate text-xs text-gray-400">{t.email}</p>
                        </div>
                        <ChevronRight className="size-3.5 text-gray-400 shrink-0" />
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}

      {/* Mark complete */}
      {(isAssigned || isOwner) && status !== 'completed' && status !== 'draft' && (
        <div className="pt-1 border-t border-gray-100">
          <button
            onClick={markComplete}
            disabled={updatingStatus}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40"
          >
            <CheckCircle className="size-4" />
            {updatingStatus ? 'Updating…' : 'Mark as completed'}
          </button>
        </div>
      )}
      {status === 'completed' && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5">
          <CheckCircle className="size-4 text-emerald-600" />
          <span className="text-sm text-emerald-700">This quiz has been completed.</span>
        </div>
      )}
    </motion.div>
  );
}
