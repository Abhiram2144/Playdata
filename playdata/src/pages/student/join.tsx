import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { GetServerSideProps } from 'next'
import { motion } from 'framer-motion'
import { Zap, Hash, ArrowRight, Loader2, Users, Trophy, LayoutDashboard, UserCircle } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { createClientFromContext } from '@/lib/supabase/server-props'
import type { NavItem } from '@/components/layout/Sidebar'

interface Profile {
  id: string
  full_name: string
  email: string
  role: string
}

interface Props { profile: Profile; prefillCode?: string }

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const supabase = createClientFromContext(context)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { redirect: { destination: '/auth/login', permanent: false } }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile) return { redirect: { destination: '/auth/login', permanent: false } }
  if (profile.role === 'teacher' || profile.role === 'admin') {
    return { redirect: { destination: '/teacher/dashboard', permanent: false } }
  }

  const prefillCode = (context.query.code as string) ?? ''

  return { props: { profile, prefillCode } }
}

const NAV_ITEMS: NavItem[] = [
  { href: '/student/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/student/join', label: 'Join Session', icon: Users },
  { href: '/student/results', label: 'My Results', icon: Trophy },
  { href: '/profile', label: 'Profile', icon: UserCircle },
]

export default function JoinSession({ profile, prefillCode }: Props) {
  const router = useRouter()
  const [code, setCode] = useState(prefillCode ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [autoJoining] = useState(!!prefillCode)

  useEffect(() => {
    if (prefillCode) handleJoin(prefillCode)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleJoin = async (joinCode?: string) => {
    const c = (joinCode ?? code).trim().toUpperCase()
    if (!c) { setError('Please enter a session code'); return }

    setLoading(true)
    setError('')

    const res = await fetch('/api/student/sessions/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ join_code: c }),
    })
    const data = await res.json()
    setLoading(false)

    if (!res.ok) { setError(data.error ?? 'Failed to join session'); return }

    router.push(`/student/sessions/${data.session_id}`)
  }

  return (
    <DashboardLayout navItems={NAV_ITEMS} profile={profile}>
      <div className="max-w-md mx-auto space-y-6 pt-8">

        {/* Header card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-purple-50 to-indigo-50 p-8 shadow-sm"
        >
          <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-violet-200/50 blur-3xl pointer-events-none" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="size-3.5 text-violet-600" />
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-violet-600">Live Sessions</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Join a Session</h1>
            <p className="text-gray-500 text-sm">Enter the 6-character code your teacher shared.</p>
          </div>
        </motion.div>

        {/* Code input */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 space-y-5"
        >
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Hash className="size-4 text-violet-500" />
              Session Code
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))
                setError('')
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              placeholder="e.g. AB12CD"
              maxLength={6}
              disabled={loading}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.35em] text-gray-900 placeholder:text-gray-300 placeholder:tracking-widest focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100 disabled:opacity-50 transition"
            />
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600"
            >
              {error}
            </motion.p>
          )}

          <button
            onClick={() => handleJoin()}
            disabled={loading || code.length < 6}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {autoJoining ? 'Auto-joining…' : 'Joining…'}
              </>
            ) : (
              <>
                Join Session
                <ArrowRight className="size-4" />
              </>
            )}
          </button>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="text-center text-xs text-gray-400"
        >
          You can also scan the QR code displayed in your classroom.
        </motion.p>
      </div>
    </DashboardLayout>
  )
}
