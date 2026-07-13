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

function getIO(res: NextApiResponse) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (res as any).socket?.server?.io ?? null
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!['GET', 'PATCH', 'DELETE'].includes(req.method ?? '')) {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const user = await getSessionUser(req, res)
  if (!user) return res.status(401).json({ error: 'Unauthorised' })

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' })

  const sessionId = req.query.id as string

  const { data: session } = await admin
    .from('sessions')
    .select('id, teacher_id, title, join_code, status, current_item, started_at, ended_at, created_at, updated_at')
    .eq('id', sessionId)
    .single()

  if (!session) return res.status(404).json({ error: 'Session not found' })
  if (session.teacher_id !== user.id) return res.status(403).json({ error: 'Forbidden' })

  // ── GET ──────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const [itemsResult, participantsResult, responsesResult] = await Promise.all([
      admin
        .from('session_items')
        .select('id, type, reference_id, order_index')
        .eq('session_id', sessionId)
        .order('order_index'),
      admin
        .from('session_participants')
        .select('id, student_id, score, joined_at, left_at, profiles(full_name, email)')
        .eq('session_id', sessionId)
        .order('joined_at'),
      admin
        .from('student_responses')
        .select('id, question_id, student_id, answer, is_correct, submitted_at')
        .eq('session_id', sessionId)
        .order('submitted_at'),
    ])

    // Resolve reference names for items
    const items = itemsResult.data ?? []
    const quizIds = items.filter((i: Record<string, unknown>) => i.type === 'quiz').map((i: Record<string, unknown>) => i.reference_id as string)
    const visIds = items.filter((i: Record<string, unknown>) => i.type === 'visualisation').map((i: Record<string, unknown>) => i.reference_id as string)
    const questionIds = items.filter((i: Record<string, unknown>) => i.type === 'question').map((i: Record<string, unknown>) => i.reference_id as string)

    const [quizzesRes, visRes, questionsRes] = await Promise.all([
      quizIds.length > 0
        ? admin.from('quizzes').select('id, title, questions(id)').in('id', quizIds)
        : { data: [] },
      visIds.length > 0
        ? admin.from('visualisations').select('id, name, chart_type').in('id', visIds)
        : { data: [] },
      questionIds.length > 0
        ? admin.from('questions').select('id, text, type, options, correct_answer').in('id', questionIds)
        : { data: [] },
    ])

    type QuizRow = { id: string; title: string; questions: unknown[] }
    type VisRow = { id: string; name: string; chart_type: string }
    type QuestionRow = { id: string; text: string; type: string; options: unknown; correct_answer: string }

    const quizMap = new Map((quizzesRes.data ?? []).map((q: QuizRow) => [q.id, q]))
    const visMap = new Map((visRes.data ?? []).map((v: VisRow) => [v.id, v]))
    const qMap = new Map((questionsRes.data ?? []).map((q: QuestionRow) => [q.id, q]))

    const enrichedItems = items.map((item: Record<string, unknown>) => {
      const ref = item.reference_id as string
      if (item.type === 'quiz') {
        const q = quizMap.get(ref) as QuizRow | undefined
        return { ...item, title: q?.title ?? 'Unknown quiz', subtitle: `${Array.isArray(q?.questions) ? q.questions.length : 0} questions` }
      }
      if (item.type === 'visualisation') {
        const v = visMap.get(ref) as VisRow | undefined
        return { ...item, title: v?.name ?? 'Unknown chart', subtitle: v?.chart_type ?? '' }
      }
      if (item.type === 'question') {
        const q = qMap.get(ref) as QuestionRow | undefined
        return { ...item, title: q?.text ?? 'Unknown question', subtitle: q?.type ?? '', options: q?.options ?? null, correct_answer: q?.correct_answer ?? '' }
      }
      return item
    })

    return res.status(200).json({
      session,
      items: enrichedItems,
      participants: participantsResult.data ?? [],
      responses: responsesResult.data ?? [],
    })
  }

  // ── PATCH ─────────────────────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    const { action, itemIndex } = req.body as { action?: string; itemIndex?: number }

    if (action === 'start') {
      if (session.status !== 'waiting') {
        return res.status(400).json({ error: 'Session is not in waiting state' })
      }
      const { data: updated, error } = await admin
        .from('sessions')
        .update({ status: 'active', started_at: new Date().toISOString(), current_item: 0 })
        .eq('id', sessionId)
        .select('id, status, current_item, started_at')
        .single()
      if (error) return res.status(500).json({ error: error.message })

      const io = getIO(res)
      if (io) io.to(`session:${sessionId}`).emit('session:start', { currentItem: 0 })

      return res.status(200).json({ session: updated })
    }

    if (action === 'advance') {
      if (session.status !== 'active') {
        return res.status(400).json({ error: 'Session is not active' })
      }
      if (typeof itemIndex !== 'number') {
        return res.status(400).json({ error: 'itemIndex is required' })
      }
      const { data: updated, error } = await admin
        .from('sessions')
        .update({ current_item: itemIndex })
        .eq('id', sessionId)
        .select('id, status, current_item')
        .single()
      if (error) return res.status(500).json({ error: error.message })

      const io = getIO(res)
      if (io) io.to(`session:${sessionId}`).emit('session:advance', { currentItem: itemIndex })

      return res.status(200).json({ session: updated })
    }

    if (action === 'end') {
      if (session.status === 'ended') {
        return res.status(400).json({ error: 'Session already ended' })
      }
      const { data: updated, error } = await admin
        .from('sessions')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('id', sessionId)
        .select('id, status, ended_at')
        .single()
      if (error) return res.status(500).json({ error: error.message })

      const io = getIO(res)
      if (io) {
        io.to(`session:${sessionId}`).emit('session:end', {})
        io.socketsLeave(`session:${sessionId}`)
      }

      return res.status(200).json({ session: updated })
    }

    return res.status(400).json({ error: 'Invalid action' })
  }

  // ── DELETE ────────────────────────────────────────────────────────────────────
  if (session.status === 'active') {
    return res.status(400).json({ error: 'Cannot delete an active session. End it first.' })
  }
  const { error: delErr } = await admin.from('sessions').delete().eq('id', sessionId)
  if (delErr) return res.status(500).json({ error: delErr.message })
  return res.status(200).json({ ok: true })
}
