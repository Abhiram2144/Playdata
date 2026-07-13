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

const VALID_TYPES = new Set(['visualisation', 'quiz', 'question'])

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!['POST', 'PATCH', 'DELETE'].includes(req.method ?? '')) {
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
    .select('id, teacher_id, status')
    .eq('id', sessionId)
    .single()

  if (!session) return res.status(404).json({ error: 'Session not found' })
  if (session.teacher_id !== user.id) return res.status(403).json({ error: 'Forbidden' })
  if (session.status !== 'waiting') return res.status(400).json({ error: 'Cannot modify items of a started session' })

  // ── POST: add item ────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { type, reference_id } = req.body as { type?: string; reference_id?: string }
    if (!type || !VALID_TYPES.has(type)) return res.status(400).json({ error: 'Invalid item type' })
    if (!reference_id) return res.status(400).json({ error: 'reference_id is required' })

    const { count } = await admin
      .from('session_items')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId)

    const order_index = count ?? 0

    // Also add to session_visualisations join if it's a visualisation
    if (type === 'visualisation') {
      const { count: visCount } = await admin
        .from('session_visualisations')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId)

      await admin.from('session_visualisations').insert({
        session_id: sessionId,
        visualisation_id: reference_id,
        display_order: visCount ?? 0,
      })
    }

    const { data: item, error } = await admin
      .from('session_items')
      .insert({ session_id: sessionId, type, reference_id, order_index })
      .select('id, type, reference_id, order_index')
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json({ item })
  }

  // ── PATCH: reorder items ──────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    const { items } = req.body as { items?: { id: string; order_index: number }[] }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array is required' })
    }

    // Bulk update using upsert
    const rows = items.map(({ id, order_index }) => ({
      id,
      session_id: sessionId,
      order_index,
    }))

    const { error } = await admin.from('session_items').upsert(rows, { onConflict: 'id' })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  // ── DELETE: remove item ────────────────────────────────────────────────────────
  const itemId = req.query.itemId as string
  if (!itemId) return res.status(400).json({ error: 'itemId query param required' })

  // If it's a visualisation item, also remove from session_visualisations
  const { data: itemRow } = await admin
    .from('session_items')
    .select('type, reference_id')
    .eq('id', itemId)
    .eq('session_id', sessionId)
    .single()

  if (!itemRow) return res.status(404).json({ error: 'Item not found' })

  if (itemRow.type === 'visualisation') {
    await admin
      .from('session_visualisations')
      .delete()
      .eq('session_id', sessionId)
      .eq('visualisation_id', itemRow.reference_id)
  }

  const { error } = await admin.from('session_items').delete().eq('id', itemId).eq('session_id', sessionId)
  if (error) return res.status(500).json({ error: error.message })

  // Renumber order_index after removal
  const { data: remaining } = await admin
    .from('session_items')
    .select('id')
    .eq('session_id', sessionId)
    .order('order_index')

  if (remaining && remaining.length > 0) {
    const reordered = remaining.map((r: { id: string }, i: number) => ({ id: r.id, session_id: sessionId, order_index: i }))
    await admin.from('session_items').upsert(reordered, { onConflict: 'id' })
  }

  return res.status(200).json({ ok: true })
}
