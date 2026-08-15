import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import path from 'path';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini';
const MAX_TOTAL_QUESTIONS = 15;
const SAMPLE_ROW_COUNT = 12;
const MAX_DISTINCT_EXAMPLES = 8;

type QuestionType = 'mcq' | 'numerical' | 'short_answer';

interface GeneratedQuestion {
  text: string;
  type: QuestionType;
  options: string[];
  correct_answer: string;
  answer_tolerance: number | null;
  dataset_column: string | null;
  topic_tag: string;
  explanation: string;
  suggested_chart_type: string | null;
  suggested_chart_note: string;
}

const CHART_TYPES = ['bar', 'line', 'pie', 'scatter', 'histogram'] as const;

function serializeCookie(name: string, value: string, opts: CookieOptions = {}): string {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  parts.push(`Path=${opts.path ?? '/'}`);
  if (opts.expires instanceof Date) parts.push(`Expires=${opts.expires.toUTCString()}`);
  if (opts.httpOnly) parts.push('HttpOnly');
  if (opts.secure) parts.push('Secure');
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  return parts.join('; ');
}

async function getSessionUser(req: NextApiRequest, res: NextApiResponse) {
  const cookies: string[] = [];
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return Object.entries(req.cookies).map(([name, value]) => ({ name, value: value ?? '' })); },
        setAll(cs) { cs.forEach(({ name, value, options }) => cookies.push(serializeCookie(name, value, options))); },
      },
    }
  );
  if (cookies.length > 0) res.setHeader('Set-Cookie', cookies);
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

function parseCSV(buffer: Buffer): Record<string, unknown>[] {
  const result = Papa.parse<Record<string, unknown>>(buffer.toString('utf-8'), {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  return result.data;
}

function parseXLSX(buffer: Buffer): Record<string, unknown>[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
}

function truncate(v: unknown, max = 60): string {
  const s = String(v ?? '').trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function profileColumn(name: string, type: string, rows: Record<string, unknown>[]): string {
  const values = rows.map((r) => r[name]).filter((v) => v !== null && v !== undefined && String(v).trim() !== '');
  if (values.length === 0) return `- "${name}" (${type}): no values`;

  if (type === 'number') {
    const nums = values.map((v) => Number(String(v).trim())).filter((n) => !isNaN(n));
    if (nums.length > 0) {
      const min = Math.min(...nums);
      const max = Math.max(...nums);
      const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      return `- "${name}" (number): ${nums.length} values, min ${min}, max ${max}, mean ${Number(mean.toFixed(2))}`;
    }
  }

  const distinct = new Map<string, number>();
  for (const v of values) {
    const s = truncate(v);
    distinct.set(s, (distinct.get(s) ?? 0) + 1);
  }
  const top = [...distinct.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_DISTINCT_EXAMPLES)
    .map(([v, c]) => `"${v}" (×${c})`);
  return `- "${name}" (${type}): ${distinct.size} distinct values, most common: ${top.join(', ')}`;
}

function sampleRowsCSV(columns: string[], rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '(no rows available)';
  const step = Math.max(1, Math.floor(rows.length / SAMPLE_ROW_COUNT));
  const sample: Record<string, unknown>[] = [];
  for (let i = 0; i < rows.length && sample.length < SAMPLE_ROW_COUNT; i += step) sample.push(rows[i]);
  const header = columns.join(',');
  const lines = sample.map((r) => columns.map((c) => truncate(r[c], 40).replace(/,/g, ';')).join(','));
  return [header, ...lines].join('\n');
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The question text' },
          type: { type: 'string', enum: ['mcq', 'numerical', 'short_answer'] },
          options: {
            type: 'array',
            items: { type: 'string' },
            description: 'Exactly 4 distinct options for mcq; empty array for other types',
          },
          correct_answer: {
            type: 'string',
            description: 'For mcq must exactly equal one option; for numerical a plain number as string',
          },
          answer_tolerance: {
            type: ['number', 'null'],
            description: 'For numerical only: acceptable ± deviation; null otherwise',
          },
          dataset_column: {
            type: ['string', 'null'],
            description: 'The most relevant dataset column name, or null',
          },
          topic_tag: { type: 'string', description: 'Short 1-3 word data-literacy topic' },
          explanation: {
            type: 'string',
            description: 'One or two sentences explaining why the correct answer is right, citing real values from the dataset; shown to students after they answer',
          },
          suggested_chart_type: {
            type: 'string',
            enum: ['bar', 'line', 'pie', 'scatter', 'histogram', 'none'],
            description: 'The chart type the teacher should create and link to this question so students can read the answer from it; "none" if no chart helps',
          },
          suggested_chart_note: {
            type: 'string',
            description: 'Short instruction for building that chart using exact column names, e.g. "X: team (category), Y: mean of kills". Empty string when suggested_chart_type is "none"',
          },
        },
        required: ['text', 'type', 'options', 'correct_answer', 'answer_tolerance', 'dataset_column', 'topic_tag', 'explanation', 'suggested_chart_type', 'suggested_chart_note'],
        additionalProperties: false,
      },
    },
  },
  required: ['questions'],
  additionalProperties: false,
};

function repairQuestions(raw: GeneratedQuestion[], validColumns: Set<string>): GeneratedQuestion[] {
  const out: GeneratedQuestion[] = [];
  for (const q of raw) {
    const text = String(q.text ?? '').trim();
    const correct = String(q.correct_answer ?? '').trim();
    if (!text || !correct) continue;
    if (!['mcq', 'numerical', 'short_answer'].includes(q.type)) continue;

    let options: string[] = [];
    let correct_answer = correct;

    if (q.type === 'mcq') {
      options = [...new Set((q.options ?? []).map((o) => String(o).trim()).filter(Boolean))];
      if (options.length < 2) continue;
      const match = options.find((o) => o.toLowerCase() === correct.toLowerCase());
      if (!match) continue;
      correct_answer = match;
    }

    if (q.type === 'numerical' && isNaN(Number(correct))) continue;

    const tolerance = q.type === 'numerical' && typeof q.answer_tolerance === 'number' && q.answer_tolerance >= 0
      ? q.answer_tolerance
      : null;

    const column = q.dataset_column && validColumns.has(q.dataset_column) ? q.dataset_column : null;

    const chartType = CHART_TYPES.includes(q.suggested_chart_type as typeof CHART_TYPES[number])
      ? q.suggested_chart_type
      : null;

    out.push({
      text,
      type: q.type,
      options,
      correct_answer,
      answer_tolerance: tolerance,
      dataset_column: column,
      topic_tag: String(q.topic_tag ?? '').trim(),
      explanation: String(q.explanation ?? '').trim(),
      suggested_chart_type: chartType,
      suggested_chart_note: chartType ? String(q.suggested_chart_note ?? '').trim() : '',
    });
  }
  return out;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'AI generation is not configured (missing OpenAI API key)' });
  }

  const user = await getSessionUser(req, res);
  if (!user) return res.status(401).json({ error: 'Unauthorised' });

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });

  const { dataset_id, counts } = req.body as {
    dataset_id?: string;
    counts?: { mcq?: number; numerical?: number; short_answer?: number };
  };

  if (!dataset_id || typeof dataset_id !== 'string') {
    return res.status(400).json({ error: 'dataset_id is required' });
  }

  const wanted: Record<QuestionType, number> = {
    mcq: Math.max(0, Math.floor(Number(counts?.mcq ?? 0))),
    numerical: Math.max(0, Math.floor(Number(counts?.numerical ?? 0))),
    short_answer: Math.max(0, Math.floor(Number(counts?.short_answer ?? 0))),
  };
  const total = wanted.mcq + wanted.numerical + wanted.short_answer;
  if (total < 1) return res.status(400).json({ error: 'Request at least one question' });
  if (total > MAX_TOTAL_QUESTIONS) {
    return res.status(400).json({ error: `Maximum ${MAX_TOTAL_QUESTIONS} questions per generation` });
  }

  const { data: dataset } = await admin
    .from('datasets')
    .select('id, teacher_id, name, schema, storage_path, row_count')
    .eq('id', dataset_id)
    .single();

  if (!dataset || dataset.teacher_id !== user.id) {
    return res.status(404).json({ error: 'Dataset not found' });
  }

  const columns: { name: string; type: string }[] = dataset.schema?.columns ?? [];
  if (columns.length === 0) {
    return res.status(422).json({ error: 'This dataset has no columns to generate questions from' });
  }

  // ── Ground the prompt in real data ──────────────────────────────────────────
  let rows: Record<string, unknown>[] = [];
  if (dataset.storage_path) {
    const { data: blob } = await admin.storage.from('datasets').download(dataset.storage_path);
    if (blob) {
      const buffer = Buffer.from(await blob.arrayBuffer());
      const ext = path.extname(dataset.storage_path.split('/').pop() ?? '').toLowerCase();
      try {
        rows = ext === '.csv' ? parseCSV(buffer) : parseXLSX(buffer);
      } catch {
        rows = [];
      }
    }
  }

  const columnNames = columns.map((c) => c.name);
  const profiles = columns.map((c) => profileColumn(c.name, c.type, rows)).join('\n');
  const sampleCSV = sampleRowsCSV(columnNames, rows);

  const systemPrompt =
    'You generate quiz questions for a data-literacy teaching platform used in schools. ' +
    'Every question must be strictly grounded in the dataset described by the teacher: ' +
    'only reference column names and values that actually appear in it. Never invent columns, values, or statistics.';

  const userPrompt = `Dataset: "${dataset.name}" (${rows.length || dataset.row_count || 'unknown'} rows)

Columns and real statistics:
${profiles}

Sample rows (evenly sampled, commas inside values replaced with ";"):
${sampleCSV}

Generate exactly ${wanted.mcq} mcq, ${wanted.numerical} numerical and ${wanted.short_answer} short_answer questions.

Rules:
- mcq: exactly 4 distinct options; correct_answer must be exactly equal to one of the options; wrong options should be plausible values from the data.
- numerical: correct_answer must be a number that follows from the statistics listed above (min, max, mean, count or a value visible in the sample rows). Set answer_tolerance to a sensible ± margin (0.5 for rounded means, 0 for exact counts/values). options must be [].
- short_answer: expects a short answer (one or two words) that appears in the data. options must be [].
- dataset_column: the single most relevant column name, copied exactly from the list above, or null.
- topic_tag: a short 1-3 word data-literacy topic such as "Averages", "Comparison", "Data Types", "Ranges".
- explanation: 1-2 sentences explaining why the correct answer is correct, citing the real values or statistics listed above. Never invent values.
- suggested_chart_type: the chart (bar, line, pie, scatter or histogram) a teacher should build and attach so students can read the answer from it, or "none" when a chart would not help. Prefer questions that can be answered from a chart.
- suggested_chart_note: a short build instruction using exact column names from the list above, e.g. "X: team (category), Y: mean of kills" or "Histogram of match_duration". Empty when suggested_chart_type is "none".
- Clear, unambiguous wording suitable for school students.`;

  // ── Call OpenAI with structured outputs ─────────────────────────────────────
  let content: string;
  let tokensUsed: number | null = null;
  try {
    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'quiz_questions', strict: true, schema: RESPONSE_SCHEMA },
        },
      }),
      signal: AbortSignal.timeout(90_000),
    });

    if (!aiRes.ok) {
      const detail = await aiRes.text().catch(() => '');
      console.error('OpenAI error:', aiRes.status, detail);
      return res.status(502).json({ error: 'AI generation failed — please try again' });
    }

    const data = await aiRes.json();
    content = data.choices?.[0]?.message?.content ?? '';
    tokensUsed = data.usage?.total_tokens ?? null;
  } catch (err) {
    console.error('OpenAI request failed:', err);
    return res.status(502).json({ error: 'AI generation timed out — please try again' });
  }

  let parsed: { questions: GeneratedQuestion[] };
  try {
    parsed = JSON.parse(content);
  } catch {
    return res.status(502).json({ error: 'AI returned an unreadable response — please try again' });
  }

  const questions = repairQuestions(parsed.questions ?? [], new Set(columnNames));
  if (questions.length === 0) {
    return res.status(502).json({ error: 'AI produced no usable questions — please try again' });
  }

  // ── Log to ai_generations ───────────────────────────────────────────────────
  const { data: generation, error: genErr } = await admin
    .from('ai_generations')
    .insert({
      teacher_id: user.id,
      type: 'quiz_generation',
      prompt: `${systemPrompt}\n\n---\n\n${userPrompt}`,
      response: content,
      tokens_used: tokensUsed,
    })
    .select('id')
    .single();

  if (genErr) console.error('ai_generations insert failed:', genErr.message);

  return res.status(200).json({
    generation_id: generation?.id ?? null,
    questions,
  });
}
