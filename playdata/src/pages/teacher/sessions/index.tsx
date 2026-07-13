import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Database, BarChart3, BookOpen, Users,
  TrendingUp, UserCircle, Plus, Play, Clock, CheckCircle2,
  Hourglass, Radio, Trash2, AlertTriangle, X,
} from 'lucide-react'
import { GetServerSidePropsResult } from 'next'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { type NavItem } from '@/components/layout/Sidebar'
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

const NAV_ITEMS = TEACHER_NAV

const STATUS_META: Record<SessionStatus, { label: string; colour: string; icon: React.ElementType }> = {
  waiting:  { label: 'Waiting',  colour: 'bg-amber-500/15 text-amber-400',   icon: Hourglass },
  active:   { label: 'Live',     colour: 'bg-emerald-500/15 text-emerald-400', icon: Radio },
  ended:    { label: 'Ended',    colour: 'bg-[#35354a]/60 text-[#8d8da0]',   icon: CheckCircle2 },
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
            <p className="text-xs font-semibold uppercase tracking-widest text-[#6a6a80]">Sessions</p>
            <h1 className="mt-0.5 text-2xl font-bold text-white">Live Sessions</h1>
          </div>
          <button
            onClick={() => { setShowNew(true); setNewTitle(''); setCreateError(null) }}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500"
          >
            <Plus className="size-4" /> New Session
          </button>
        </motion.div>

        {/* Session cards */}
        {sessions.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-2xl border border-[#35354a]/60 bg-[#11111f]/80 px-8 py-16 text-center"
          >
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10 ring-1 ring-violet-500/20">
              <Users className="size-7 text-violet-400" />
            </span>
            <p className="mt-4 text-sm font-semibold text-white">No sessions yet</p>
            <p className="mt-1 text-xs text-[#6a6a80]">Create a live session to engage your students in real time.</p>
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
                  className="rounded-2xl border border-[#35354a]/60 bg-[#11111f]/80 p-5"
                >
                  <div className="flex items-start gap-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 ring-1 ring-violet-500/20">
                      <Play className="size-5 text-violet-400" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-sm font-semibold text-white">{session.title}</h2>
                        <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${meta.colour}`}>
                          <StatusIcon className="size-3" /> {meta.label}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[#6a6a80]">
                        <span className="font-mono font-semibold text-[#8d8da0] tracking-widest">{session.join_code}</span>
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
                          className="flex items-center gap-1.5 rounded-lg border border-[#35354a] px-3 py-1.5 text-xs font-medium text-[#c9c9d4] transition hover:border-violet-500/40 hover:text-violet-400"
                        >
                          Build
                        </Link>
                      )}
                      {session.status === 'active' && (
                        <Link
                          href={`/teacher/sessions/${session.id}/live`}
                          className="flex items-center gap-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/30 px-3 py-1.5 text-xs font-medium text-emerald-400 transition hover:bg-emerald-600/30"
                        >
                          <Radio className="size-3" /> Rejoin
                        </Link>
                      )}
                      {session.status === 'waiting' && (
                        <button
                          onClick={() => setConfirmDelete(session.id)}
                          className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-600/10 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-600/20"
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setShowNew(false) }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm rounded-2xl border border-[#35354a]/60 bg-[#11111f] p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-sm font-bold text-white">New Session</h2>
                <button onClick={() => setShowNew(false)} className="text-[#6a6a80] hover:text-white">
                  <X className="size-4" />
                </button>
              </div>
              <label className="block text-xs font-medium text-[#8d8da0] mb-1.5">Session title</label>
              <input
                autoFocus
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
                placeholder="e.g. Week 3 – Data Distributions"
                className="w-full rounded-xl border border-[#35354a] bg-[#1e1e30] px-3 py-2.5 text-sm text-white placeholder-[#4a4a60] outline-none focus:border-violet-500/60 transition"
              />
              {createError && <p className="mt-2 text-xs text-red-400">{createError}</p>}
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => setShowNew(false)}
                  className="rounded-xl border border-[#35354a] px-4 py-2 text-sm text-[#8d8da0] transition hover:text-white"
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

      {/* Delete confirmation modal */}
      <AnimatePresence>
        {confirmDelete && (
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
              className="w-full max-w-sm rounded-2xl border border-[#35354a]/60 bg-[#11111f] p-6 shadow-2xl"
            >
              <div className="flex items-start gap-3 mb-5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/10 ring-1 ring-red-500/20">
                  <AlertTriangle className="size-4 text-red-400" />
                </span>
                <div>
                  <h2 className="text-sm font-bold text-white">Delete session?</h2>
                  <p className="text-xs text-[#8d8da0] mt-0.5">This permanently deletes the session and all its items.</p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="rounded-xl border border-[#35354a] px-4 py-2 text-sm text-[#8d8da0] transition hover:text-white"
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
