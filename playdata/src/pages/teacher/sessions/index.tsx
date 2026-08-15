import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Play, Clock, BookOpen, Users,
  Hourglass, Radio, Trash2, AlertTriangle, X, BarChart2,
} from 'lucide-react'
import { GetServerSidePropsResult } from 'next'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { TEACHER_NAV } from '@/lib/teacher-nav'
import { withAuth } from '@/lib/auth'
import { createClientFromContext } from '@/lib/supabase/server-props'
import { createAdminClient } from '@/lib/supabase/admin'

type SessionStatus = 'waiting' | 'active' | 'ended'

interface SessionSummary {
  id: string
  title: string
  join_code: string
  status: SessionStatus
  current_item: number | null
  started_at: string | null
  ended_at: string | null
  created_at: string
  item_count: number
  participant_count: number
}

interface Profile {
  id: string
  full_name: string
  email: string
  role: string
}

interface Props {
  profile: Profile
  sessions: SessionSummary[]
}

export const getServerSideProps = withAuth(
  async (context, userId): Promise<GetServerSidePropsResult<Props>> => {
    const supabase = createClientFromContext(context)
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .eq('id', userId)
      .single()

    if (!profile) return { redirect: { destination: '/auth/login', permanent: false } }

    const admin = createAdminClient()
    const { data: sessions } = await admin
      .from('sessions')
      .select('id, title, join_code, status, current_item, started_at, ended_at, created_at, session_items(id), session_participants(id)')
      .eq('teacher_id', userId)
      .order('created_at', { ascending: false })

    const formatted: SessionSummary[] = (sessions ?? []).map((s: Record<string, unknown>) => ({
      id: s.id as string,
      title: s.title as string,
      join_code: s.join_code as string,
      status: s.status as SessionStatus,
      current_item: s.current_item as number | null,
      started_at: s.started_at as string | null,
      ended_at: s.ended_at as string | null,
      created_at: s.created_at as string,
      item_count: Array.isArray(s.session_items) ? (s.session_items as unknown[]).length : 0,
      participant_count: Array.isArray(s.session_participants) ? (s.session_participants as unknown[]).length : 0,
    }))

    return { props: { profile, sessions: formatted } }
  },
  { allowedRoles: ['teacher'] }
)

const STATUS_META: Record<SessionStatus, { label: string; colour: string; icon: React.ElementType }> = {
  waiting:  { label: 'Waiting',  colour: 'bg-amber-100 text-amber-700',    icon: Hourglass },
  active:   { label: 'Live',     colour: 'bg-emerald-100 text-emerald-700', icon: Radio },
  ended:    { label: 'Ended',    colour: 'bg-gray-100 text-gray-500',       icon: BarChart2 },
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function SessionsList({ profile, sessions: initial }: Props) {
  const router = useRouter()
  const [sessions, setSessions] = useState(initial)
  const [showNew, setShowNew] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)

  const endedCount = sessions.filter((s) => s.status === 'ended').length

  const handleCreate = async () => {
    if (!newTitle.trim()) { setCreateError('Session title is required'); return }
    setCreating(true)
    setCreateError(null)
    const res = await fetch('/api/teacher/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle.trim() }),
    })
    const data = await res.json()
    setCreating(false)
    if (!res.ok) { setCreateError(data.error ?? 'Failed to create session'); return }
    router.push(`/teacher/sessions/${data.sessionId}`)
  }

  const handleDelete = async (id: string) => {
    setDeleting(id)
    const res = await fetch(`/api/teacher/sessions/${id}`, { method: 'DELETE' })
    setDeleting(null)
    setConfirmDelete(null)
    if (res.ok) setSessions((prev) => prev.filter((s) => s.id !== id))
  }

  const handleClearHistory = async () => {
    setClearing(true)
    const res = await fetch('/api/teacher/sessions', { method: 'DELETE' })
    setClearing(false)
    setConfirmClear(false)
    if (res.ok) setSessions((prev) => prev.filter((s) => s.status !== 'ended'))
  }

  return (
    <DashboardLayout navItems={TEACHER_NAV} profile={profile}>
      <div className="max-w-5xl space-y-8">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Sessions</p>
            <h1 className="mt-0.5 text-2xl font-bold text-gray-900">Live Sessions</h1>
          </div>
          <div className="flex items-center gap-2">
            {endedCount > 0 && (
              <button
                onClick={() => setConfirmClear(true)}
                className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-500 transition hover:bg-red-100"
              >
                <Trash2 className="size-4" /> Clear history
              </button>
            )}
            <button
              onClick={() => { setShowNew(true); setNewTitle(''); setCreateError(null) }}
              className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500"
            >
              <Plus className="size-4" /> New Session
            </button>
          </div>
        </motion.div>

        {/* Session cards */}
        {sessions.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-2xl border border-gray-100 bg-white shadow-sm px-8 py-16 text-center"
          >
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 ring-1 ring-violet-200">
              <Users className="size-7 text-violet-600" />
            </span>
            <p className="mt-4 text-sm font-semibold text-gray-800">No sessions yet</p>
            <p className="mt-1 text-xs text-gray-500">Create a live session to engage your students in real time.</p>
            <button
              onClick={() => { setShowNew(true); setNewTitle(''); setCreateError(null) }}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500"
            >
              <Plus className="size-4" /> Create a session
            </button>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="space-y-3"
          >
            {sessions.map((session) => {
              const meta = STATUS_META[session.status]
              const StatusIcon = meta.icon
              return (
                <div
                  key={session.id}
                  className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5"
                >
                  <div className="flex items-start gap-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 ring-1 ring-violet-200">
                      <Play className="size-5 text-violet-600" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-sm font-semibold text-gray-900">{session.title}</h2>
                        <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${meta.colour}`}>
                          <StatusIcon className="size-3" /> {meta.label}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                        <span className="font-mono font-semibold text-gray-600 tracking-widest">{session.join_code}</span>
                        <span className="flex items-center gap-1">
                          <BookOpen className="size-3" />
                          {session.item_count} item{session.item_count !== 1 ? 's' : ''}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="size-3" />
                          {session.participant_count} student{session.participant_count !== 1 ? 's' : ''}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" />
                          {timeAgo(session.created_at)}
                        </span>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {session.status === 'waiting' && (
                        <Link
                          href={`/teacher/sessions/${session.id}`}
                          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:border-violet-300 hover:text-violet-600"
                        >
                          Build
                        </Link>
                      )}
                      {session.status === 'active' && (
                        <Link
                          href={`/teacher/sessions/${session.id}/live`}
                          className="flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100"
                        >
                          <Radio className="size-3" /> Rejoin
                        </Link>
                      )}
                      {session.status === 'ended' && (
                        <Link
                          href={`/teacher/sessions/${session.id}/results`}
                          className="flex items-center gap-1.5 rounded-lg bg-violet-50 border border-violet-200 px-3 py-1.5 text-xs font-medium text-violet-700 transition hover:bg-violet-100"
                        >
                          <BarChart2 className="size-3" /> View Results
                        </Link>
                      )}
                      {session.status === 'waiting' && (
                        <button
                          onClick={() => setConfirmDelete(session.id)}
                          className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-500 transition hover:bg-red-100"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </motion.div>
        )}
      </div>

      {/* New session modal */}
      <AnimatePresence>
        {showNew && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setShowNew(false) }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-xl"
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-sm font-bold text-gray-900">New Session</h2>
                <button onClick={() => setShowNew(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="size-4" />
                </button>
              </div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Session title</label>
              <input
                autoFocus
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
                placeholder="e.g. Week 3 – Data Distributions"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-violet-400 transition"
              />
              {createError && <p className="mt-2 text-xs text-red-500">{createError}</p>}
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => setShowNew(false)}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-500 transition hover:text-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
                >
                  {creating ? 'Creating…' : 'Create'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Clear history confirmation modal */}
      <AnimatePresence>
        {confirmClear && (
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
                  <h2 className="text-sm font-bold text-gray-900">Clear session history?</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    This permanently deletes all {endedCount} ended session{endedCount !== 1 ? 's' : ''}, including
                    student responses, results and analytics. Students will no longer see these sessions in their
                    results. This cannot be undone.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setConfirmClear(false)}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-500 transition hover:text-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClearHistory}
                  disabled={clearing}
                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
                >
                  {clearing ? 'Clearing…' : 'Clear history'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
                  <h2 className="text-sm font-bold text-gray-900">Delete session?</h2>
                  <p className="text-xs text-gray-500 mt-0.5">This permanently deletes the session and all its items.</p>
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
  )
}
