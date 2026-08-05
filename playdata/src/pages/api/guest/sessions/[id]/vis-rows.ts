import type { NextApiRequest, NextApiResponse } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import path from 'path'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const sessionId = req.query.id as string
  const visId = req.query.vis_id as string
  const guestToken = req.query.guest_token as string

  if (!visId) return res.status(400).json({ error: 'vis_id query param required' })
  if (!guestToken) return res.status(400).json({ error: 'guest_token query param required' })

  const admin = createAdminClient()

  const { data: participant } = await admin
    .from('session_participants')
    .select('id')
    .eq('session_id', sessionId)
    .eq('guest_token', guestToken)
    .maybeSingle()

  if (!participant) return res.status(403).json({ error: 'Not a participant in this session' })

  // Allow: direct vis session item OR vis linked to a quiz question in the session
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
      const { data: qs } = await admin
        .from('questions')
        .select('id')
        .in('quiz_id', quizIds)
        .contains('visualisation_ids', [visId])

      foundInQuiz = (qs ?? []).length > 0
    }

    if (!foundInQuiz) return res.status(404).json({ error: 'Visualisation not found in session' })
  }

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
    const result = Papa.parse<Record<string, unknown>>(buffer.toString('utf-8'), { header: true, skipEmptyLines: true })
    allRows = result.data
  } else {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
    const sheetName = workbook.SheetNames[0]
    allRows = sheetName
      ? XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '' })
      : []
  }

  return res.status(200).json({ rows: allRows.slice(0, 500), config: vis.config ?? {}, chart_type: vis.chart_type ?? 'bar' })
}
