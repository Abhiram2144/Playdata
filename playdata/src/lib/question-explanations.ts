import type { SupabaseClient } from '@supabase/supabase-js';
import path from 'path';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini';
const MAX_SERIES_POINTS = 20;

interface QuestionRow {
  id: string;
  text: string;
  type: string;
  options: unknown;
  correct_answer: string;
  answer_tolerance: number | null;
  dataset_column: string | null;
  visualisation_id: string | null;
  visualisation_ids: unknown;
}

interface VisRow {
  id: string;
  name: string;
  chart_type: string;
  config: Record<string, unknown> | null;
  dataset_id: string | null;
}

// ── Dataset loading ───────────────────────────────────────────────────────────

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
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '' });
}

async function loadDatasetRows(
  datasetId: string,
  admin: SupabaseClient,
  cache: Map<string, Record<string, unknown>[]>
): Promise<Record<string, unknown>[]> {
  const cached = cache.get(datasetId);
  if (cached) return cached;

  let rows: Record<string, unknown>[] = [];
  const { data: dataset } = await admin
    .from('datasets')
    .select('storage_path')
    .eq('id', datasetId)
    .single();

  if (dataset?.storage_path) {
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
  cache.set(datasetId, rows);
  return rows;
}

// ── Chart series computation (mirrors InlineChartBuilder rendering) ───────────

function smartNum(v: unknown): number {
  if (typeof v === 'number') return v;
  return parseFloat(String(v ?? '').trim().replace(/[$£€%,]/g, ''));
}

function applyFilter(
  rows: Record<string, unknown>[],
  col: string,
  op: string,
  val: string
): Record<string, unknown>[] {
  if (!col || !val) return rows;
  return rows.filter((r) => {
    const v = String(r[col] ?? '');
    switch (op) {
      case '==': return v === val;
      case '!=': return v !== val;
      case '>': return Number(v) > Number(val);
      case '<': return Number(v) < Number(val);
      case '>=': return Number(v) >= Number(val);
      case '<=': return Number(v) <= Number(val);
      case 'contains': return v.toLowerCase().includes(val.toLowerCase());
      default: return true;
    }
  });
}

function groupAgg(
  rows: Record<string, unknown>[],
  xCol: string,
  yCol: string,
  agg: string
): { name: string; value: number }[] {
  const groups = new Map<string, number[]>();
  const order: string[] = [];
  for (const r of rows) {
    const k = String(r[xCol] ?? '—');
    if (!groups.has(k)) { groups.set(k, []); order.push(k); }
    if (yCol) {
      const n = smartNum(r[yCol]);
      if (!isNaN(n)) groups.get(k)!.push(n);
    } else {
      groups.get(k)!.push(1);
    }
  }
  return order.map((k) => {
    const vals = groups.get(k)!;
    const value =
      agg === 'count' || !yCol ? vals.length
      : agg === 'sum' ? vals.reduce((a, b) => a + b, 0)
      : vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    return { name: k, value: parseFloat(value.toFixed(4)) };
  }).slice(0, MAX_SERIES_POINTS);
}

function histBins(rows: Record<string, unknown>[], col: string): { bin: string; count: number }[] {
  const vals = rows.map((r) => smartNum(r[col])).filter((v) => !isNaN(v));
  if (!vals.length) return [];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const w = (max - min) / 10 || 1;
  const bins = Array.from({ length: 10 }, (_, i) => ({ bin: (min + i * w).toFixed(2), count: 0 }));
  for (const v of vals) bins[Math.min(Math.floor((v - min) / w), 9)].count++;
  return bins;
}

function describeVisualisation(
  vis: VisRow,
  rows: Record<string, unknown>[]
): string {
  const cfg = vis.config ?? {};
  const xAxis = String(cfg.xAxis ?? '');
  const yAxis = String(cfg.yAxis ?? '');
  const aggregation = String(cfg.aggregation ?? 'mean');
  const filterColumn = String(cfg.filterColumn ?? '');
  const filterOperator = String(cfg.filterOperator ?? '==');
  const filterValue = String(cfg.filterValue ?? '');

  const lines: string[] = [`Chart: "${vis.name}" (${vis.chart_type} chart)`];

  if (vis.chart_type === 'histogram') {
    lines.push(`Value column: ${xAxis}`);
  } else if (vis.chart_type === 'pie') {
    lines.push(`Category column: ${xAxis}${yAxis ? `; value column: ${yAxis} (${aggregation} per category)` : ' (count per category)'}`);
  } else {
    lines.push(`X axis: ${xAxis}; Y axis: ${yAxis}${vis.chart_type !== 'scatter' ? ` (${aggregation} per ${xAxis})` : ''}`);
  }
  if (filterColumn && filterValue) {
    lines.push(`Filter applied: ${filterColumn} ${filterOperator} ${filterValue}`);
  }

  const filtered = applyFilter(rows, filterColumn, filterOperator, filterValue);
  if (filtered.length === 0) {
    lines.push('Data points: unavailable');
    return lines.join('\n');
  }

  if (vis.chart_type === 'histogram') {
    const bins = histBins(filtered, xAxis);
    lines.push(`Data points (bin start → count): ${bins.map((b) => `${b.bin} → ${b.count}`).join(', ')}`);
  } else if (vis.chart_type === 'scatter') {
    const pts = filtered
      .map((r) => ({ x: smartNum(r[xAxis]), y: smartNum(r[yAxis]) }))
      .filter((p) => !isNaN(p.x) && !isNaN(p.y));
    const step = Math.max(1, Math.floor(pts.length / MAX_SERIES_POINTS));
    const sample = pts.filter((_, i) => i % step === 0).slice(0, MAX_SERIES_POINTS);
    lines.push(`Sample points (${pts.length} total): ${sample.map((p) => `(${p.x}, ${p.y})`).join(', ')}`);
  } else {
    const series = groupAgg(filtered, xAxis, yAxis, aggregation);
    lines.push(`Data points: ${series.map((s) => `${s.name}: ${s.value}`).join(', ')}`);
  }

  return lines.join('\n');
}

// ── OpenAI call ───────────────────────────────────────────────────────────────

async function generateExplanation(
  q: QuestionRow,
  chartContext: string | null,
  teacherId: string,
  admin: SupabaseClient
): Promise<void> {
  const systemPrompt =
    'You write brief answer explanations for a data-literacy quiz platform used in schools. ' +
    'Explain in one or two sentences why the correct answer is right, in plain language suitable ' +
    'for school students. When chart context is provided, ground the explanation in that chart ' +
    'and its data points. Never invent values that are not in the provided context. ' +
    'Respond with the explanation text only — no preamble, no markdown.';

  const parts = [`Question: ${q.text}`, `Type: ${q.type}`];
  if (q.type === 'mcq' && Array.isArray(q.options) && q.options.length > 0) {
    parts.push(`Options: ${(q.options as string[]).join(' | ')}`);
  }
  parts.push(`Correct answer: ${q.correct_answer}`);
  if (q.type === 'numerical' && q.answer_tolerance != null) {
    parts.push(`Accepted tolerance: ±${q.answer_tolerance}`);
  }
  if (q.dataset_column) parts.push(`Most relevant dataset column: ${q.dataset_column}`);
  parts.push('');
  parts.push(chartContext ? `Chart shown with this question:\n${chartContext}` : 'No chart is linked to this question.');
  parts.push('');
  parts.push('Write a brief explanation (1-2 sentences) of why the correct answer is correct.');
  const userPrompt = parts.join('\n');

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
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!aiRes.ok) {
    throw new Error(`OpenAI ${aiRes.status}: ${await aiRes.text().catch(() => '')}`);
  }

  const data = await aiRes.json();
  const explanation: string = (data.choices?.[0]?.message?.content ?? '').trim();
  const tokensUsed: number | null = data.usage?.total_tokens ?? null;
  if (!explanation) throw new Error('AI returned an empty explanation');

  // Only fill if still empty, so a concurrent run or teacher edit is never overwritten.
  const { error: updateErr } = await admin
    .from('questions')
    .update({ explanation })
    .eq('id', q.id)
    .is('explanation', null);
  if (updateErr) throw new Error(`questions.explanation update failed: ${updateErr.message}`);

  const { error: logErr } = await admin.from('ai_generations').insert({
    teacher_id: teacherId,
    type: 'explanation',
    prompt: `${systemPrompt}\n\n---\n\n${userPrompt}`,
    response: explanation,
    tokens_used: tokensUsed,
  });
  if (logErr) console.error('ai_generations insert failed:', logErr.message);
}

// ── Entry point ───────────────────────────────────────────────────────────────

/**
 * Backfills questions.explanation for every question in the session that has
 * none (manually-authored questions, or AI questions whose explanation was
 * cleared by a teacher edit). Fired asynchronously on session start.
 */
export async function backfillQuestionExplanations(
  sessionId: string,
  teacherId: string,
  admin: SupabaseClient
): Promise<void> {
  if (!process.env.OPENAI_API_KEY) return;

  const { data: items } = await admin
    .from('session_items')
    .select('type, reference_id')
    .eq('session_id', sessionId);

  const quizIds = (items ?? []).filter((i) => i.type === 'quiz').map((i) => i.reference_id as string);
  const standaloneIds = (items ?? []).filter((i) => i.type === 'question').map((i) => i.reference_id as string);
  if (quizIds.length === 0 && standaloneIds.length === 0) return;

  const SELECT = 'id, text, type, options, correct_answer, answer_tolerance, dataset_column, visualisation_id, visualisation_ids';
  const [quizQs, standaloneQs] = await Promise.all([
    quizIds.length > 0
      ? admin.from('questions').select(SELECT).in('quiz_id', quizIds).is('explanation', null)
      : Promise.resolve({ data: [] as QuestionRow[] }),
    standaloneIds.length > 0
      ? admin.from('questions').select(SELECT).in('id', standaloneIds).is('explanation', null)
      : Promise.resolve({ data: [] as QuestionRow[] }),
  ]);

  const questions = new Map<string, QuestionRow>();
  for (const q of [...(quizQs.data ?? []), ...(standaloneQs.data ?? [])] as QuestionRow[]) {
    questions.set(q.id, q);
  }
  if (questions.size === 0) return;

  // Resolve linked visualisations for chart context.
  const visIdsPerQuestion = new Map<string, string[]>();
  const allVisIds = new Set<string>();
  for (const q of questions.values()) {
    const ids = new Set<string>();
    if (Array.isArray(q.visualisation_ids)) {
      for (const id of q.visualisation_ids) if (typeof id === 'string' && id) ids.add(id);
    }
    if (q.visualisation_id) ids.add(q.visualisation_id);
    visIdsPerQuestion.set(q.id, [...ids]);
    ids.forEach((id) => allVisIds.add(id));
  }

  const visMap = new Map<string, VisRow>();
  if (allVisIds.size > 0) {
    const { data: visRows } = await admin
      .from('visualisations')
      .select('id, name, chart_type, config, dataset_id')
      .in('id', [...allVisIds]);
    for (const v of (visRows ?? []) as VisRow[]) visMap.set(v.id, v);
  }

  const rowsCache = new Map<string, Record<string, unknown>[]>();

  for (const q of questions.values()) {
    try {
      const descriptions: string[] = [];
      for (const visId of visIdsPerQuestion.get(q.id) ?? []) {
        const vis = visMap.get(visId);
        if (!vis) continue;
        const rows = vis.dataset_id ? await loadDatasetRows(vis.dataset_id, admin, rowsCache) : [];
        descriptions.push(describeVisualisation(vis, rows));
      }
      await generateExplanation(q, descriptions.length > 0 ? descriptions.join('\n\n') : null, teacherId, admin);
    } catch (e) {
      console.error('[explanations] generation failed for question', q.id, e);
    }
  }
}
