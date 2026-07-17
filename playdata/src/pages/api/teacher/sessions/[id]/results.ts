import type { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase/admin'

function serializeCookie(name: string, value: string, opts: CookieOptions = {}): string {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`]
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`)
  if (opts.domain) parts.push(`Domain=${opts.domain}`)
  parts.push(`Path=${opts.path ?? '/'}`)
  if (opts.expires instanceof Date) parts.push(`Expires=${opts.expires.toUTCString()}`)
  if (opts.httpOnly) parts.push('HttpOnly')
  if (opts.secure) parts.push('Secure')
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`)
  return parts.join('; ')
}

async function getSessionUser(req: NextApiRequest, res: NextApiResponse) {
  const cookies: string[] = []
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return Object.entries(req.cookies).map(([name, value]) => ({ name, value: value ?? '' })) },
        setAll(cs) { cs.forEach(({ name, value, options }) => cookies.push(serializeCookie(name, value, options))) },
      },
    }
  )
  if (cookies.length > 0) res.setHeader('Set-Cookie', cookies)
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const user = await getSessionUser(req, res)
  if (!user) return res.status(401).json({ error: 'Unauthorised' })

  const { id } = req.query
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Session ID required' })

  const admin = createAdminClient()

  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' })

  const { data: session } = await admin
    .from('sessions')
    .select('id, title, join_code, status, started_at, ended_at, teacher_id')
    .eq('id', id)
    .single()

  if (!session || session.teacher_id !== user.id) return res.status(404).json({ error: 'Not found' })

  const [itemsRes, participantsRes, responsesRes] = await Promise.all([
    admin.from('session_items').select('id, type, reference_id, order_index').eq('session_id', id).order('order_index'),
    admin.from('session_participants').select('id, student_id, score, joined_at, left_at, profiles(full_name, email)').eq('session_id', id).order('score', { ascending: false }),
    admin.from('student_responses').select('id, question_id, student_id, answer, is_correct, submitted_at').eq('session_id', id),
  ])

  const rawItems = itemsRes.data ?? []

  // Load quiz questions for quiz items
  const quizIds = rawItems.filter((i: Record<string, unknown>) => i.type === 'quiz').map((i: Record<string, unknown>) => i.reference_id as string)
  const visIds = rawItems.filter((i: Record<string, unknown>) => i.type === 'visualisation').map((i: Record<string, unknown>) => i.reference_id as string)

  type QuizRow = { id: string; title: string; questions: { id: string; text: string; type: string; options: unknown; correct_answer: string; order_index: number }[] }
  type VisRow = { id: string; name: string; chart_type: string }

  const [qRes, vRes] = await Promise.all([
    quizIds.length > 0
      ? admin.from('quizzes').select('id, title, questions(id, text, type, options, correct_answer, order_index)').in('id', quizIds)
      : { data: [] },
    visIds.length > 0
      ? admin.from('visualisations').select('id, name, chart_type').in('id', visIds)
      : { data: [] },
  ])

  const qMap = new Map((qRes.data ?? []).map((q: QuizRow) => [q.id, q]))
  const vMap = new Map((vRes.data ?? []).map((v: VisRow) => [v.id, v]))

  const items = rawItems.map((item: Record<string, unknown>) => {
    const ref = item.reference_id as string
    if (item.type === 'quiz') {
      const q = qMap.get(ref) as QuizRow | undefined
      return {
        id: item.id,
        type: 'quiz',
        order_index: item.order_index,
        title: q?.title ?? 'Quiz',
        questions: Array.isArray(q?.questions)
          ? [...q!.questions].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
          : [],
      }
    }
    if (item.type === 'visualisation') {
      const v = vMap.get(ref) as VisRow | undefined
      return { id: item.id, type: 'visualisation', order_index: item.order_index, title: v?.name ?? 'Chart', questions: [] }
    }
    return { id: item.id, type: 'question', order_index: item.order_index, title: 'Question', questions: [] }
  })

  return res.status(200).json({
    session,
    items,
    participants: participantsRes.data ?? [],
    responses: responsesRes.data ?? [],
  })
}
