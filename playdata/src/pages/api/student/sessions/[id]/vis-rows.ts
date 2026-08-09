import type { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase/admin'
import path from 'path'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'

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

  const sessionId = req.query.id as string
  const visId = req.query.vis_id as string
  if (!visId) return res.status(400).json({ error: 'vis_id query param required' })

  const admin = createAdminClient()

  // Verify student is a participant in this session
  const { data: participant } = await admin
    .from('session_participants')
    .select('id')
    .eq('session_id', sessionId)
    .eq('student_id', user.id)
    .maybeSingle()

  if (!participant) return res.status(403).json({ error: 'Not a participant in this session' })

  // Verify this visualisation is accessible in this session — either as a direct item
  // or as a visualization linked to a question inside a quiz session item.
  const { data: directItem } = await admin
    .from('session_items')
    .select('id')
    .eq('session_id', sessionId)
    .eq('type', 'visualisation')
    .eq('reference_id', visId)
    .maybeSingle()

  if (!directItem) {
    const { data: quizItems } = await admin
      .from('session_items')
      .select('reference_id')
      .eq('session_id', sessionId)
      .eq('type', 'quiz')

    const quizIds = (quizItems ?? []).map((i) => i.reference_id as string)
    let foundInQuiz = false

    if (quizIds.length > 0) {
      // Fetch all questions in these quizzes and check in JS to avoid
      // relying on the @> operator which can misbehave with JSONB vs native arrays.
      const { data: qs } = await admin
        .from('questions')
        .select('id, visualisation_ids')
        .in('quiz_id', quizIds)

      foundInQuiz = (qs ?? []).some(
        (q: { visualisation_ids: string[] | null }) =>
          Array.isArray(q.visualisation_ids) && q.visualisation_ids.includes(visId)
      )
    }

    if (!foundInQuiz) return res.status(404).json({ error: 'Visualisation not found in session' })
  }

  // Load the visualisation with its dataset
  const { data: vis } = await admin
    .from('visualisations')
    .select('id, chart_type, config, dataset_id, datasets(id, storage_path, name)')
    .eq('id', visId)
    .maybeSingle()

  if (!vis) return res.status(404).json({ error: 'Visualisation not found' })
  if (!vis.dataset_id) return res.status(200).json({ rows: [], config: vis.config, chart_type: vis.chart_type })

  type DatasetRef = { storage_path: string | null; name: string }
  const dataset = Array.isArray(vis.datasets)
    ? (vis.datasets[0] as DatasetRef | undefined)
    : (vis.datasets as DatasetRef | null)

  const storagePath = dataset?.storage_path
  if (!storagePath) return res.status(200).json({ rows: [], config: vis.config, chart_type: vis.chart_type })

  const { data: blob, error: dlErr } = await admin.storage.from('datasets').download(storagePath)
  if (dlErr || !blob) return res.status(500).json({ error: 'Failed to load dataset' })

  const buffer = Buffer.from(await blob.arrayBuffer())
  const ext = path.extname(storagePath.split('/').pop() ?? '').toLowerCase()

  let allRows: Record<string, unknown>[]
  if (ext === '.csv') {
    const result = Papa.parse<Record<string, unknown>>(buffer.toString('utf-8'), {
      header: true,
      skipEmptyLines: true,
    })
    allRows = result.data
  } else {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
    const sheetName = workbook.SheetNames[0]
    allRows = sheetName
      ? XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '' })
      : []
  }

  return res.status(200).json({
    rows: allRows.slice(0, 500),
    config: vis.config ?? {},
    chart_type: vis.chart_type ?? 'bar',
  })
}
