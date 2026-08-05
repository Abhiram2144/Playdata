import type { NextApiRequest, NextApiResponse } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { join_code, guest_name, guest_student_id } = req.body as {
    join_code?: string
    guest_name?: string
    guest_student_id?: string
  }

  if (!join_code?.trim()) return res.status(400).json({ error: 'Session code is required' })
  if (!guest_name?.trim()) return res.status(400).json({ error: 'Name is required' })
  if (!guest_student_id?.trim()) return res.status(400).json({ error: 'Student ID is required' })

  const admin = createAdminClient()

  const { data: session } = await admin
    .from('sessions')
    .select('id, status')
    .eq('join_code', join_code.trim().toUpperCase())
    .single()

  if (!session) return res.status(404).json({ error: 'Session not found. Check your code.' })
  if (session.status === 'ended') return res.status(400).json({ error: 'This session has already ended.' })

  const { data: participant, error } = await admin
    .from('session_participants')
    .insert({
      session_id: session.id,
      student_id: null,
      guest_name: guest_name.trim(),
      guest_student_id: guest_student_id.trim(),
      score: 0,
    })
    .select('id, guest_token')
    .single()

  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({
    session_id: session.id,
    participant_id: participant.id,
    guest_token: participant.guest_token,
  })
}
