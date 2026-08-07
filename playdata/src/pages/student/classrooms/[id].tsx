import { useCallback, useEffect, useRef, useState } from 'react'
import { GetServerSideProps } from 'next'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, GraduationCap, Zap, ArrowRight, UserCircle } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { STUDENT_NAV } from '@/lib/student-nav'
import { createClientFromContext } from '@/lib/supabase/server-props'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ClassroomDetail, ActiveSession } from '@/pages/api/student/classrooms/[id]'
import type { InvitePayload } from '@/components/StudentInviteListener'

interface Profile {
  id: string
  full_name: string
  email: string
  role: string
}

interface Props {
  profile: Profile
  classroom: ClassroomDetail
  activeSession: ActiveSession | null
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const supabase = createClientFromContext(context)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { redirect: { destination: '/auth/login', permanent: false } }

  const admin = createAdminClient()
  const classroomId = context.params!.id as string

  const [profileRes, membershipRes] = await Promise.all([
    admin.from('profiles').select('id, full_name, email, role').eq('id', user.id).maybeSingle(),
    admin
      .from('classroom_students')
      .select('id, status')
      .eq('classroom_id', classroomId)
      .eq('student_id', user.id)
      .maybeSingle(),
  ])

  if (!profileRes.data) return { redirect: { destination: '/onboarding/student', permanent: false } }
  if (profileRes.data.role !== 'student') return { redirect: { destination: '/teacher/dashboard', permanent: false } }
  if (!membershipRes.data || membershipRes.data.status !== 'active') {
    return { notFound: true }
  }

  const [classroomRes, sessionRes] = await Promise.all([
    admin
      .from('classrooms')
      .select('id, name, description, teacher_id, created_at')
      .eq('id', classroomId)
      .single(),
    admin
      .from('sessions')
      .select('id, title, join_code, status')
      .eq('classroom_id', classroomId)
      .eq('status', 'active')
      .maybeSingle(),
  ])

  if (!classroomRes.data) return { notFound: true }

  const { data: teacher } = await admin
    .from('profiles')
    .select('full_name')
    .eq('id', classroomRes.data.teacher_id)
    .single()

  const classroom: ClassroomDetail = {
    ...classroomRes.data,
    teacher_name: teacher?.full_name ?? 'Teacher',
  }

  return {
    props: {
      profile: profileRes.data,
      classroom,
      activeSession: (sessionRes.data ?? null) as ActiveSession | null,
    },
  }
}

export default function StudentClassroomDetail({ profile, classroom, activeSession: initialActiveSession }: Props) {
  const router = useRouter()
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(initialActiveSession)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const channelRef = useRef<BroadcastChannel | null>(null)

  const fetchActiveSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/student/classrooms/${classroom.id}`)
      if (!res.ok) return
      const data = await res.json() as { activeSession: ActiveSession | null }
      setActiveSession(data.activeSession)
    } catch {
      // network error — keep current state
    }
  }, [classroom.id])

  useEffect(() => {
    // BroadcastChannel: receive session-started events from StudentInviteListener
    const bc = new BroadcastChannel('playdata-sessions')
    channelRef.current = bc

    bc.onmessage = (evt: MessageEvent) => {
      if (evt.data?.type === 'session-started') {
        const payload = evt.data.payload as InvitePayload
        // Only update if this event is for our classroom
        if (!activeSession) {
          // Refetch to confirm
          fetchActiveSession()
        } else {
          // Quick update from broadcast payload
          setActiveSession({
            id: payload.sessionId,
            title: payload.sessionTitle,
            join_code: payload.joinCode,
            status: 'active',
          })
        }
      }
    }

    // Poll every 10 seconds in case the student opened this page directly
    pollRef.current = setInterval(fetchActiveSession, 10_000)

    return () => {
      bc.close()
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [classroom.id, activeSession, fetchActiveSession])

  const joinedDate = new Date(classroom.created_at).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <DashboardLayout navItems={STUDENT_NAV} profile={profile}>
      <div className="max-w-2xl space-y-6">

        {/* back link */}
        <Link
          href="/student/classrooms"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="size-4" />
          My Classrooms
        </Link>

        {/* Active session banner */}
        <AnimatePresence>
          {activeSession && (
            <motion.div
              key="banner"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col gap-3 rounded-2xl border border-violet-300 bg-gradient-to-br from-violet-50 via-purple-50 to-indigo-50 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-violet-600" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-violet-900">
                    {activeSession.title} — Session Live
                  </p>
                  <p className="text-xs text-violet-600 mt-0.5">
                    Your teacher has started a quiz for this class
                  </p>
                </div>
              </div>
              <button
                onClick={() => router.push(`/student/sessions/${activeSession.id}`)}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 transition-colors shrink-0"
              >
                Join Now <ArrowRight className="size-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Classroom header card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden"
        >
          <div className="h-1.5 bg-gradient-to-r from-violet-600 to-indigo-500" />
          <div className="p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 ring-1 ring-violet-200">
                <GraduationCap className="size-6 text-violet-600" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-bold uppercase tracking-widest text-violet-600">Classroom</span>
                </div>
                <h1 className="text-xl font-bold text-gray-900 truncate">{classroom.name}</h1>
                {classroom.description && (
                  <p className="text-sm text-gray-500 mt-1">{classroom.description}</p>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Details */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl border border-gray-200 bg-white shadow-sm divide-y divide-gray-100"
        >
          <div className="flex items-center gap-3 px-6 py-4">
            <UserCircle className="size-4 text-gray-400 shrink-0" />
            <span className="text-sm text-gray-500 flex-1">Teacher</span>
            <span className="text-sm font-medium text-gray-800">{classroom.teacher_name}</span>
          </div>
          <div className="flex items-center gap-3 px-6 py-4">
            <Zap className="size-4 text-gray-400 shrink-0" />
            <span className="text-sm text-gray-500 flex-1">Class created</span>
            <span className="text-sm font-medium text-gray-800">{joinedDate}</span>
          </div>
          <div className="flex items-center gap-3 px-6 py-4">
            <span className="ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
              <span className={`inline-flex h-2.5 w-2.5 rounded-full ${activeSession ? 'bg-green-500' : 'bg-gray-300'}`} />
            </span>
            <span className="text-sm text-gray-500 flex-1">Session status</span>
            <span className={`text-sm font-medium ${activeSession ? 'text-green-700' : 'text-gray-400'}`}>
              {activeSession ? 'Active now' : 'No active session'}
            </span>
          </div>
        </motion.div>

      </div>
    </DashboardLayout>
  )
}
