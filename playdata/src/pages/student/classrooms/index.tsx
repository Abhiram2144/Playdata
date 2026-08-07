import { GetServerSideProps } from 'next'
import { useRouter } from 'next/router'
import { motion } from 'framer-motion'
import { GraduationCap, ArrowRight, Users } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { STUDENT_NAV } from '@/lib/student-nav'
import { createClientFromContext } from '@/lib/supabase/server-props'
import { createAdminClient } from '@/lib/supabase/admin'

interface Profile {
  id: string
  full_name: string
  email: string
  role: string
}

interface ClassroomSummary {
  id: string
  name: string
  description: string | null
  teacher_name: string
  joined_at: string
}

interface Props {
  profile: Profile
  classrooms: ClassroomSummary[]
}

type ClassroomJoin = {
  id: string
  name: string
  description: string | null
  teacher_id: string
} | {
  id: string
  name: string
  description: string | null
  teacher_id: string
}[] | null

type MembershipRow = {
  classroom_id: string
  joined_at: string
  classrooms: ClassroomJoin
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const supabase = createClientFromContext(context)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { redirect: { destination: '/auth/login', permanent: false } }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile) return { redirect: { destination: '/onboarding/student', permanent: false } }
  if (profile.role !== 'student') return { redirect: { destination: '/teacher/dashboard', permanent: false } }

  const { data: memberships } = await admin
    .from('classroom_students')
    .select('classroom_id, joined_at, classrooms(id, name, description, teacher_id)')
    .eq('student_id', user.id)
    .eq('status', 'active')
    .order('joined_at', { ascending: false })

  const rows = (memberships ?? []) as unknown as MembershipRow[]

  const teacherIds = [...new Set(
    rows.map(r => {
      const c = Array.isArray(r.classrooms) ? r.classrooms[0] : r.classrooms
      return c?.teacher_id
    }).filter(Boolean)
  )] as string[]

  const { data: teachers } = teacherIds.length > 0
    ? await admin.from('profiles').select('id, full_name').in('id', teacherIds)
    : { data: [] }

  const teacherMap = new Map(
    (teachers ?? []).map((t: { id: string; full_name: string }) => [t.id, t.full_name])
  )

  const classrooms: ClassroomSummary[] = rows.flatMap(r => {
    const c = Array.isArray(r.classrooms) ? r.classrooms[0] : r.classrooms
    if (!c) return []
    return [{
      id: c.id,
      name: c.name,
      description: c.description,
      teacher_name: teacherMap.get(c.teacher_id) ?? 'Teacher',
      joined_at: r.joined_at,
    }]
  })

  return { props: { profile, classrooms } }
}

export default function StudentClassroomsIndex({ profile, classrooms }: Props) {
  const router = useRouter()

  return (
    <DashboardLayout navItems={STUDENT_NAV} profile={profile}>
      <div className="max-w-4xl space-y-8">

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="relative overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-purple-50 to-indigo-50 p-6 sm:p-8 shadow-sm"
        >
          <div className="absolute -right-8 -top-8 h-56 w-56 rounded-full bg-violet-200/50 blur-3xl pointer-events-none" />
          <div className="relative flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 ring-1 ring-violet-200">
              <GraduationCap className="size-5 text-violet-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">My Classrooms</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {classrooms.length === 0
                  ? 'You have not been added to any classrooms yet.'
                  : `${classrooms.length} classroom${classrooms.length !== 1 ? 's' : ''} you belong to`}
              </p>
            </div>
          </div>
        </motion.div>

        {classrooms.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center"
          >
            <Users className="mx-auto size-10 text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-500">No classrooms yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Ask your teacher to add you — they can invite you by email.
            </p>
          </motion.div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {classrooms.map((c, i) => (
              <motion.button
                key={c.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.05 }}
                whileHover={{ y: -2 }}
                onClick={() => router.push(`/student/classrooms/${c.id}`)}
                className="group flex flex-col rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:border-violet-300 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 ring-1 ring-violet-200">
                    <GraduationCap className="size-5 text-violet-600" />
                  </div>
                  <ArrowRight className="size-4 text-gray-400 group-hover:text-violet-500 transition-colors mt-1 shrink-0" />
                </div>
                <p className="font-semibold text-gray-900 truncate">{c.name}</p>
                {c.description && (
                  <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{c.description}</p>
                )}
                <p className="mt-3 text-xs text-gray-400">
                  Teacher: <span className="text-gray-600">{c.teacher_name}</span>
                </p>
              </motion.button>
            ))}
          </div>
        )}

      </div>
    </DashboardLayout>
  )
}
