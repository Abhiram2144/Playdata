import type { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase/admin'
import formidable from 'formidable'
import fs from 'fs'
import path from 'path'
import * as XLSX from 'xlsx'

// Disable Next.js body parsing — formidable reads the raw stream.
export const config = { api: { bodyParser: false } }

// ── Auth helper ───────────────────────────────────────────────────────────────

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

// ── Text extraction ───────────────────────────────────────────────────────────

async function extractText(filePath: string, ext: string): Promise<string> {
  switch (ext) {
    case '.txt':
    case '.csv':
      return fs.readFileSync(filePath, 'utf-8')

    case '.xlsx': {
      const wb = XLSX.readFile(filePath)
      return wb.SheetNames
        .map((name) => XLSX.utils.sheet_to_csv(wb.Sheets[name]))
        .join('\n')
    }

    case '.docx': {
      // mammoth has no shipped TS declarations; require with an explicit shape.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require('mammoth') as {
        extractRawText: (opts: { path: string }) => Promise<{ value: string }>
      }
      const result = await mammoth.extractRawText({ path: filePath })
      return result.value
    }

    default:
      throw new Error(`Unsupported file type: ${ext}`)
  }
}

// ── Email harvesting ──────────────────────────────────────────────────────────

const VALID_EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
// Anchored version used for the per-token validity test (avoids global-flag state issues).
const VALID_EMAIL_ANCHORED = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
// Catches anything that looks like it's trying to be an email (has @ with surrounding chars)
// but might not fully satisfy the valid pattern.
const ATTEMPTED_EMAIL_RE = /\S*@\S+/g

function harvestEmails(text: string): { emails: string[]; invalid_count: number } {
  const validMatches = text.match(VALID_EMAIL_RE) ?? []
  const emails = [...new Set(validMatches.map((e) => e.toLowerCase()))]

  const attempted = text.match(ATTEMPTED_EMAIL_RE) ?? []
  const invalid_count = attempted.filter((tok) => !VALID_EMAIL_ANCHORED.test(tok)).length

  return { emails, invalid_count }
}

// ── Shared add-students logic (mirrors /students POST) ────────────────────────

async function addStudentsToClassroom(
  classroomId: string,
  emails: string[],
  admin: ReturnType<typeof createAdminClient>
) {
  const { data: existingRows } = await admin
    .from('classroom_students')
    .select('email, status')
    .eq('classroom_id', classroomId)
    .in('email', emails)

  const existingMap = new Map<string, string>(
    (existingRows ?? []).map((r: { email: string; status: string }) => [r.email, r.status])
  )

  const { data: matchingProfiles } = await admin
    .from('profiles')
    .select('id, email')
    .eq('role', 'student')
    .in('email', emails)

  const profileMap = new Map<string, string>(
    (matchingProfiles ?? []).map((p: { id: string; email: string }) => [p.email.toLowerCase(), p.id])
  )

  let added_active = 0
  let added_invited = 0
  let skipped = 0

  const toInsert: {
    classroom_id: string
    email: string
    student_id: string | null
    status: string
    joined_at: string | null
  }[] = []

  for (const email of emails) {
    const existing = existingMap.get(email)

    if (existing && existing !== 'removed') {
      skipped++
      continue
    }

    const profileId = profileMap.get(email) ?? null
    const status = profileId ? 'active' : 'invited'

    if (existing === 'removed') {
      await admin
        .from('classroom_students')
        .update({ status, student_id: profileId, joined_at: profileId ? new Date().toISOString() : null })
        .eq('classroom_id', classroomId)
        .eq('email', email)
    } else {
      toInsert.push({
        classroom_id: classroomId,
        email,
        student_id: profileId,
        status,
        joined_at: profileId ? new Date().toISOString() : null,
      })
    }

    if (status === 'active') added_active++
    else added_invited++
  }

  if (toInsert.length > 0) {
    const { error } = await admin.from('classroom_students').insert(toInsert)
    if (error) throw new Error(error.message)
  }

  return { added_active, added_invited, skipped }
}

// ── Handler ───────────────────────────────────────────────────────────────────

const ALLOWED_EXTS = new Set(['.csv', '.txt', '.xlsx', '.docx'])

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const user = await getSessionUser(req, res)
  if (!user) return res.status(401).json({ error: 'Unauthorised' })

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' })

  const classroomId = req.query.id as string

  const { data: classroom } = await admin
    .from('classrooms')
    .select('id, teacher_id')
    .eq('id', classroomId)
    .single()

  if (!classroom) return res.status(404).json({ error: 'Classroom not found' })
  if (classroom.teacher_id !== user.id) return res.status(403).json({ error: 'Forbidden' })

  // Parse the uploaded file
  const form = formidable({ maxFileSize: 10 * 1024 * 1024 }) // 10 MB cap
  let files: formidable.Files
  try {
    ;[, files] = await form.parse(req)
  } catch {
    return res.status(400).json({ error: 'Failed to parse upload' })
  }

  const uploaded = Array.isArray(files.file) ? files.file[0] : files.file
  if (!uploaded) return res.status(400).json({ error: 'No file received' })

  const ext = path.extname(uploaded.originalFilename ?? '').toLowerCase()
  if (!ALLOWED_EXTS.has(ext)) {
    return res.status(400).json({ error: `Unsupported file type "${ext}". Accepted: .csv, .txt, .xlsx, .docx` })
  }

  let rawText: string
  try {
    rawText = await extractText(uploaded.filepath, ext)
  } catch (err) {
    return res.status(422).json({ error: (err as Error).message })
  }

  const { emails, invalid_count } = harvestEmails(rawText)

  if (emails.length === 0) {
    return res.status(200).json({ added_active: 0, added_invited: 0, skipped: 0, invalid_count })
  }

  try {
    const counts = await addStudentsToClassroom(classroomId, emails, admin)
    return res.status(200).json({ ...counts, invalid_count })
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message })
  }
}
