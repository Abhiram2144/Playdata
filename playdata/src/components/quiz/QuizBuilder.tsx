'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Trash2, GripVertical, ChevronDown, ChevronUp,
  Database, Hash, AlignLeft, List, AlertTriangle, Check,
  Clock, BookOpen, X, CheckCircle, BarChart2, PenLine, Tag, Sparkles,
} from 'lucide-react';
import { TagCombobox } from '@/components/ui/TagCombobox';
import { InfoTip } from '@/components/ui/InfoTip';
import { InlineChartBuilder, type CreatedVis } from '@/components/quiz/InlineChartBuilder';
import { AIQuizGenerator } from '@/components/quiz/AIQuizGenerator';

// ── Types ─────────────────────────────────────────────────────────────────────
export type QuestionType = 'mcq' | 'short_answer' | 'numerical';
export type QuizStatus = 'draft' | 'in_progress' | 'assigned' | 'completed';

export interface ColumnSchema { name: string; type: string }
export interface DatasetOption { id: string; name: string; schema: { columns: ColumnSchema[] } }
export interface VisualisationOption { id: string; name: string; chart_type: string }

export interface QuestionDraft {
  _key: string;
  text: string;
  type: QuestionType;
  options: string[];
  correct_answer: string;
  answer_tolerance: string;
  dataset_column: string;
  visualisation_ids: string[];
  chart_hint?: string;
  explanation: string;
  time_limit_secs: number;
  topic_tag: string;
  _ai?: { generation_id: string | null; original_text: string };
}

export interface QuizBuilderProps {
  quizId?: string;
  initialTitle?: string;
  initialDescription?: string;
  initialDatasetId?: string;
  initialQuestions?: QuestionDraft[];
  initialStatus?: QuizStatus;
  initialIsTimed?: boolean;
  initialAllowStudentCharts?: boolean;
  datasets: DatasetOption[];
  visualisations?: VisualisationOption[];
  saveLabel?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeKey() {
  return typeof crypto !== 'undefined'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function emptyQuestion(): QuestionDraft {
  return {
    _key: makeKey(),
    text: '',
    type: 'mcq',
    options: ['', ''],
    correct_answer: '',
    answer_tolerance: '',
    dataset_column: '',
    visualisation_ids: [],
    explanation: '',
    time_limit_secs: 30,
    topic_tag: '',
  };
}

function validateForPublish(questions: QuestionDraft[]): string[] {
  const errs: string[] = [];
  if (questions.length === 0) errs.push('Add at least one question to publish.');
  questions.forEach((q, i) => {
    const n = i + 1;
    if (!q.text.trim()) errs.push(`Q${n}: question text is required.`);
    if (!q.correct_answer.trim()) errs.push(`Q${n}: correct answer is required.`);
    if (q.type === 'mcq') {
      const opts = q.options.filter((o) => o.trim());
      if (opts.length < 2) errs.push(`Q${n}: MCQ needs at least 2 non-empty options.`);
      if (q.correct_answer && !opts.includes(q.correct_answer)) {
        errs.push(`Q${n}: correct answer must match one of the options.`);
      }
    }
  });
  return errs;
}

const TYPE_META: Record<QuestionType, { label: string; icon: React.ElementType; colour: string }> = {
  mcq:          { label: 'Multiple Choice', icon: List,      colour: 'text-violet-700 bg-violet-100 ring-violet-200' },
  short_answer: { label: 'Short Answer',    icon: AlignLeft, colour: 'text-blue-700 bg-blue-100 ring-blue-200' },
  numerical:    { label: 'Numerical',       icon: Hash,      colour: 'text-emerald-700 bg-emerald-100 ring-emerald-200' },
};

const QUESTION_TYPE_HELP = [
  { term: 'Multiple Choice (MCQ)', desc: 'Students pick the correct answer from a set of options you provide.' },
  { term: 'Short Answer', desc: 'Students type a free-text response, marked correct when it matches your expected answer.' },
  { term: 'Numerical', desc: 'Students enter a number — you can allow a ± tolerance around the correct value.' },
];

// shared input class
const INPUT = 'w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 transition focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100';

// ── Question card ─────────────────────────────────────────────────────────────
function QuestionCard({
  q, idx, total, expanded, columns, visualisations, availableTags,
  hasDataset,
  onToggle, onUpdate, onDelete, onDragStart, onDragOver, onDrop, isDragOver,
  onOpenChartBuilder,
}: {
  q: QuestionDraft;
  idx: number;
  total: number;
  expanded: boolean;
  columns: ColumnSchema[];
  visualisations: VisualisationOption[];
  availableTags: string[];
  hasDataset: boolean;
  onToggle: () => void;
  onUpdate: (patch: Partial<QuestionDraft>) => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  isDragOver: boolean;
  onOpenChartBuilder: () => void;
}) {
  const meta = TYPE_META[q.type];
  const Icon = meta.icon;
  const [showAdvanced, setShowAdvanced] = useState(false);

  const setOption = (i: number, val: string) => {
    const opts = [...q.options];
    const old = opts[i];
    opts[i] = val;
    onUpdate({ options: opts, correct_answer: q.correct_answer === old ? val : q.correct_answer });
  };

  const addOption = () => onUpdate({ options: [...q.options, ''] });

  const removeOption = (i: number) => {
    const opts = q.options.filter((_, j) => j !== i);
    onUpdate({ options: opts, correct_answer: q.correct_answer === q.options[i] ? '' : q.correct_answer });
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={(e) => e.preventDefault()}
      className={`rounded-2xl border bg-white shadow-sm transition-all ${
        isDragOver
          ? 'border-violet-300 ring-2 ring-violet-100'
          : 'border-gray-100'
      }`}
    >
      {/* Card header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="cursor-grab touch-none text-gray-600 transition hover:text-gray-700 active:cursor-grabbing">
          <GripVertical className="size-4" />
        </span>

        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gray-100 text-xs font-bold text-gray-500">
          {idx + 1}
        </span>

        <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${meta.colour}`}>
          <Icon className="size-3" /> {meta.label}
        </span>

        <p className="min-w-0 flex-1 truncate text-sm text-gray-700">
          {q.text.trim() || <span className="italic text-gray-600">No question text yet…</span>}
        </p>

        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={onToggle}
            className="rounded-lg p-1.5 text-gray-600 transition hover:bg-gray-100 hover:text-gray-700"
          >
            {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
          {total > 1 && (
            <button
              onClick={onDelete}
              className="rounded-lg p-1.5 text-gray-600 transition hover:bg-red-50 hover:text-red-500"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Expanded editor */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="border-t border-gray-100 px-4 py-4 space-y-4">

              {/* Question text */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Question text <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={q.text}
                  onChange={(e) => onUpdate({ text: e.target.value })}
                  placeholder="Type your question here…"
                  rows={2}
                  className={`${INPUT} resize-none`}
                />
              </div>

              {/* Visualisation attachments */}
              <div>
                {q.chart_hint && q.visualisation_ids.length === 0 && (
                  <p className="mb-2 flex items-start gap-1.5 rounded-lg bg-sky-50 px-2.5 py-1.5 text-xs text-sky-700 ring-1 ring-inset ring-sky-100">
                    <BarChart2 className="mt-0.5 size-3 shrink-0" />
                    <span>
                      <span className="font-semibold">Suggested chart:</span> {q.chart_hint} — create it below and link it to this question.
                    </span>
                  </p>
                )}
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
                    <BarChart2 className="size-3" /> Linked charts
                  </label>
                  {hasDataset && (
                    <button
                      type="button"
                      onClick={onOpenChartBuilder}
                      className="flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-600 transition hover:border-violet-300 hover:bg-violet-100"
                    >
                      <Plus className="size-3" /> Create chart
                    </button>
                  )}
                </div>
                {visualisations.length > 0 ? (
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {visualisations.map((v) => {
                      const checked = q.visualisation_ids.includes(v.id);
                      return (
                        <label
                          key={v.id}
                          className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 transition ${
                            checked
                              ? 'border-violet-300 bg-violet-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const ids = e.target.checked
                                ? [...q.visualisation_ids, v.id]
                                : q.visualisation_ids.filter((id) => id !== v.id);
                              onUpdate({ visualisation_ids: ids });
                            }}
                            className="accent-violet-600 shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-gray-800">{v.name}</p>
                            <p className="text-xs capitalize text-gray-600">{v.chart_type}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                ) : hasDataset ? (
                  <p className="text-xs text-gray-600">No charts yet — click &ldquo;Create chart&rdquo; to add one.</p>
                ) : (
                  <p className="text-xs text-gray-600">Select a dataset for this quiz to create and link charts.</p>
                )}
                {q.visualisation_ids.length > 0 && (
                  <p className="mt-1 text-xs text-gray-600">
                    {q.visualisation_ids.length} chart{q.visualisation_ids.length !== 1 ? 's' : ''} will be shown alongside this question.
                  </p>
                )}
              </div>

              {/* Type selector */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Question type
                  <InfoTip ariaLabel="What do the question types mean?" entries={QUESTION_TYPE_HELP} />
                </label>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(TYPE_META) as QuestionType[]).map((t) => {
                    const m = TYPE_META[t];
                    const TIcon = m.icon;
                    return (
                      <button
                        key={t}
                        onClick={() => onUpdate({ type: t, correct_answer: '', options: t === 'mcq' ? ['', ''] : [] })}
                        className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition ${
                          q.type === t
                            ? 'border-violet-300 bg-violet-50 text-violet-700'
                            : 'border-gray-200 text-gray-500 hover:border-violet-200 hover:text-violet-600'
                        }`}
                      >
                        <TIcon className="size-3.5" /> {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* MCQ options */}
              {q.type === 'mcq' && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Options <span className="text-red-400">*</span>
                    <span className="ml-1 normal-case font-normal text-gray-600">(click circle to mark correct)</span>
                  </label>
                  <div className="space-y-2">
                    {q.options.map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <button
                          onClick={() => onUpdate({ correct_answer: opt.trim() })}
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${
                            q.correct_answer === opt.trim() && opt.trim()
                              ? 'border-emerald-500 bg-emerald-500'
                              : 'border-gray-300 hover:border-violet-400'
                          }`}
                        >
                          {q.correct_answer === opt.trim() && opt.trim() && (
                            <Check className="size-2.5 text-white" />
                          )}
                        </button>
                        <input
                          value={opt}
                          onChange={(e) => setOption(oi, e.target.value)}
                          placeholder={`Option ${oi + 1}`}
                          className={INPUT}
                        />
                        {q.options.length > 2 && (
                          <button
                            onClick={() => removeOption(oi)}
                            className="p-1 text-gray-600 transition hover:text-red-400"
                          >
                            <X className="size-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    {q.options.length < 6 && (
                      <button
                        onClick={addOption}
                        className="flex items-center gap-1.5 text-xs font-medium text-violet-600 transition hover:text-violet-700"
                      >
                        <Plus className="size-3.5" /> Add option
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Short answer */}
              {q.type === 'short_answer' && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Correct answer <span className="text-red-400">*</span>
                  </label>
                  <input
                    value={q.correct_answer}
                    onChange={(e) => onUpdate({ correct_answer: e.target.value })}
                    placeholder="Expected answer"
                    className={INPUT}
                  />
                </div>
              )}

              {/* Numerical */}
              {q.type === 'numerical' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Correct answer <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="number"
                      value={q.correct_answer}
                      onChange={(e) => onUpdate({ correct_answer: e.target.value })}
                      placeholder="e.g. 42"
                      className={INPUT}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Tolerance (±)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={q.answer_tolerance}
                      onChange={(e) => onUpdate({ answer_tolerance: e.target.value })}
                      placeholder="e.g. 0.5"
                      className={INPUT}
                    />
                  </div>
                </div>
              )}

              {/* Advanced options */}
              <div>
                <button
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="flex items-center gap-1.5 text-xs font-medium text-gray-600 transition hover:text-gray-600"
                >
                  {showAdvanced ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                  Advanced options
                </button>

                <AnimatePresence>
                  {showAdvanced && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {columns.length > 0 && (
                          <div>
                            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-600">
                              Dataset column
                            </label>
                            <select
                              value={q.dataset_column}
                              onChange={(e) => onUpdate({ dataset_column: e.target.value })}
                              className={INPUT}
                            >
                              <option value="">— none —</option>
                              {columns.map((c) => (
                                <option key={c.name} value={c.name}>{c.name}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div>
                          <label className="mb-1.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
                            <Clock className="size-3" /> Time limit (seconds)
                          </label>
                          <input
                            type="number"
                            min="5"
                            max="300"
                            value={q.time_limit_secs}
                            onChange={(e) => onUpdate({ time_limit_secs: parseInt(e.target.value) || 30 })}
                            className={INPUT}
                          />
                        </div>

                        <div className={columns.length > 0 ? '' : 'sm:col-span-2'}>
                          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-600">
                            Explanation (shown after answer)
                          </label>
                          <textarea
                            value={q.explanation}
                            onChange={(e) => onUpdate({ explanation: e.target.value })}
                            placeholder="Optional explanation…"
                            rows={2}
                            className={`${INPUT} resize-none`}
                          />
                        </div>

                        <div>
                          <label className="mb-1.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
                            <Tag className="size-3" /> Topic tag
                          </label>
                          <TagCombobox
                            value={q.topic_tag}
                            onChange={(v) => onUpdate({ topic_tag: v })}
                            availableTags={availableTags}
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main builder ──────────────────────────────────────────────────────────────
export default function QuizBuilder({
  quizId,
  initialTitle = '',
  initialDescription = '',
  initialDatasetId = '',
  initialQuestions = [],
  initialStatus = 'draft',
  initialIsTimed = true,
  initialAllowStudentCharts = false,
  datasets,
  visualisations = [],
  saveLabel = 'Save',
}: QuizBuilderProps) {
  const router = useRouter();

  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [datasetId, setDatasetId] = useState(initialDatasetId);
  const [isTimed, setIsTimed] = useState(initialIsTimed);
  const [allowStudentCharts, setAllowStudentCharts] = useState(initialAllowStudentCharts);

  const [questions, setQuestions] = useState<QuestionDraft[]>(
    initialQuestions.length > 0 ? initialQuestions : []
  );
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(initialQuestions.length === 0 ? [] : [])
  );

  const dragIdx = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const [localVisualisations, setLocalVisualisations] = useState<VisualisationOption[]>(visualisations);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [openChartFor, setOpenChartFor] = useState<string | null>(null);
  const [showAIGenerator, setShowAIGenerator] = useState(false);

  useEffect(() => {
    if (!datasetId) { setRows([]); return; }
    setLoadingRows(true);
    fetch(`/api/teacher/datasets/${datasetId}/rows?page=0&pageSize=200`)
      .then((r) => (r.ok ? r.json() : { rows: [] }))
      .then((d) => { setRows(d.rows ?? []); setLoadingRows(false); })
      .catch(() => setLoadingRows(false));
  }, [datasetId]);

  const [availableTags, setAvailableTags] = useState<string[]>([]);
  useEffect(() => {
    fetch('/api/questions/tags')
      .then((r) => r.ok ? r.json() : { tags: [] })
      .then(({ tags }) => setAvailableTags((tags ?? []).map((t: { tag: string }) => t.tag)))
      .catch(() => {});
  }, []);

  const [saving, setSaving] = useState<'draft' | 'publish' | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  const selectedDataset = datasets.find((d) => d.id === datasetId);
  const columns: ColumnSchema[] = selectedDataset?.schema?.columns ?? [];

  const addQuestion = () => {
    const q = emptyQuestion();
    setQuestions((prev) => [...prev, q]);
    setExpanded((prev) => new Set([...prev, q._key]));
  };

  const updateQuestion = (key: string, patch: Partial<QuestionDraft>) => {
    setQuestions((prev) => prev.map((q) => (q._key === key ? { ...q, ...patch } : q)));
  };

  const deleteQuestion = (key: string) => {
    setQuestions((prev) => prev.filter((q) => q._key !== key));
    setExpanded((prev) => { const s = new Set(prev); s.delete(key); return s; });
  };

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const s = new Set(prev);
      s.has(key) ? s.delete(key) : s.add(key);
      return s;
    });
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };

  const handleDrop = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    const from = dragIdx.current;
    if (from === null || from === idx) { setDragOverIdx(null); return; }
    setQuestions((prev) => {
      const arr = [...prev];
      const [moved] = arr.splice(from, 1);
      arr.splice(idx, 0, moved);
      return arr;
    });
    dragIdx.current = null;
    setDragOverIdx(null);
  };

  const handleDatasetChange = (id: string) => {
    setDatasetId(id);
    if (id !== datasetId) {
      setQuestions((prev) => prev.map((q) => ({ ...q, dataset_column: '' })));
    }
  };

  const handleChartCreated = (vis: CreatedVis) => {
    setLocalVisualisations((prev) => [...prev, vis]);
    if (openChartFor) {
      updateQuestion(openChartFor, {
        visualisation_ids: [
          ...(questions.find((q) => q._key === openChartFor)?.visualisation_ids ?? []),
          vis.id,
        ],
      });
    }
    setOpenChartFor(null);
  };

  const buildPayload = (status: 'draft' | 'in_progress') => ({
    title: title.trim(),
    description: description.trim() || undefined,
    dataset_id: datasetId || undefined,
    status,
    is_timed: isTimed,
    allow_student_charts: allowStudentCharts,
    questions: questions.map((q, idx) => ({
      order_index: idx,
      text: q.text.trim(),
      type: q.type,
      options: q.type === 'mcq' ? q.options.filter((o) => o.trim()) : null,
      correct_answer: q.correct_answer.trim(),
      answer_tolerance: q.type === 'numerical' ? (q.answer_tolerance ? Number(q.answer_tolerance) : null) : null,
      dataset_column: q.dataset_column || null,
      visualisation_ids: q.visualisation_ids,
      explanation: q.explanation.trim() || null,
      time_limit_secs: isTimed ? q.time_limit_secs : 0,
      topic_tag: q.topic_tag.trim() || null,
      ai_meta: q._ai ?? null,
    })),
  });

  const save = async (targetStatus: 'draft' | 'in_progress') => {
    const clientErrors: string[] = [];
    if (!title.trim()) clientErrors.push('Quiz title is required.');
    if (targetStatus === 'in_progress') clientErrors.push(...validateForPublish(questions));
    if (clientErrors.length > 0) { setErrors(clientErrors); return; }

    setSaving(targetStatus === 'in_progress' ? 'publish' : 'draft');
    setErrors([]);

    const isEdit = !!quizId;
    const res = await fetch(
      isEdit ? `/api/teacher/quizzes/${quizId}` : '/api/teacher/quizzes',
      { method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildPayload(targetStatus)) }
    );

    const data = await res.json();
    setSaving(null);

    if (!res.ok) { setErrors(data.errors ?? [data.error ?? 'Save failed']); return; }

    setSaved(true);
    setTimeout(() => router.push('/teacher/quizzes'), 800);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl space-y-6">

      {/* Saved flash */}
      <AnimatePresence>
        {saved && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fixed top-6 right-6 z-50 flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm font-medium text-emerald-700 shadow-lg"
          >
            <CheckCircle className="size-4 text-emerald-500" /> Saved — redirecting…
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quiz metadata card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm space-y-4"
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 ring-1 ring-violet-200">
            <BookOpen className="size-3.5 text-violet-600" />
          </span>
          <span className="text-xs font-semibold uppercase tracking-widest text-gray-600">Quiz details</span>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-600">
            Title <span className="text-red-400">*</span>
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Chapter 3 Review"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-semibold text-gray-900 placeholder-gray-400 transition focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-600">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description for students…"
            rows={2}
            className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 transition focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100"
          />
        </div>

        <div>
          <label htmlFor="quiz-linked-dataset" className="mb-1.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
            <Database className="size-3" /> Linked dataset (optional)
          </label>
          <select
            id="quiz-linked-dataset"
            value={datasetId}
            onChange={(e) => handleDatasetChange(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 transition focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100"
          >
            <option value="">— none —</option>
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        {/* Timed toggle */}
        <label className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${
          isTimed ? 'border-violet-200 bg-violet-50' : 'border-gray-200 bg-gray-50'
        }`}>
          <input
            type="checkbox"
            checked={isTimed}
            onChange={(e) => setIsTimed(e.target.checked)}
            className="accent-violet-600 shrink-0"
          />
          <div>
            <div className="flex items-center gap-2">
              <Clock className={`size-3.5 ${isTimed ? 'text-violet-600' : 'text-gray-600'}`} />
              <p className="text-sm font-medium text-gray-800">Timed quiz</p>
            </div>
            <p className="text-xs text-gray-600 mt-0.5">
              {isTimed
                ? 'Each question has a countdown timer. Set time limits per question in Advanced options.'
                : 'No time limits — students can answer at their own pace.'}
            </p>
          </div>
        </label>

        {/* Allow student charts toggle */}
        <label className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${
          allowStudentCharts ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-gray-50'
        }`}>
          <input
            type="checkbox"
            checked={allowStudentCharts}
            onChange={(e) => setAllowStudentCharts(e.target.checked)}
            className="accent-emerald-600 shrink-0"
          />
          <div>
            <div className="flex items-center gap-2">
              <PenLine className={`size-3.5 ${allowStudentCharts ? 'text-emerald-600' : 'text-gray-600'}`} />
              <p className="text-sm font-medium text-gray-800">Allow student chart creation</p>
            </div>
            <p className="text-xs text-gray-600 mt-0.5">
              {allowStudentCharts
                ? 'Students can build their own charts while answering questions.'
                : 'Students will only see the charts you linked to each question.'}
            </p>
          </div>
        </label>
      </motion.div>

      {/* Questions */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="space-y-3"
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-800">
            Questions
            {questions.length > 0 && (
              <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                {questions.length}
              </span>
            )}
          </p>
          {questions.length > 1 && (
            <p className="text-xs text-gray-600">Drag to reorder</p>
          )}
        </div>

        {questions.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center">
            <p className="text-sm text-gray-600">No questions yet — add one below.</p>
          </div>
        )}

        {questions.map((q, idx) => (
          <QuestionCard
            key={q._key}
            q={q}
            idx={idx}
            total={questions.length}
            expanded={expanded.has(q._key)}
            columns={columns}
            visualisations={localVisualisations}
            availableTags={availableTags}
            hasDataset={!!datasetId}
            onToggle={() => toggleExpand(q._key)}
            onUpdate={(patch) => updateQuestion(q._key, patch)}
            onDelete={() => deleteQuestion(q._key)}
            onDragStart={() => { dragIdx.current = idx; }}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDrop={(e) => handleDrop(e, idx)}
            isDragOver={dragOverIdx === idx}
            onOpenChartBuilder={() => setOpenChartFor(q._key)}
          />
        ))}

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            onClick={addQuestion}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-violet-300 bg-violet-50 py-3 text-sm font-medium text-violet-600 transition hover:border-violet-400 hover:bg-violet-100"
          >
            <Plus className="size-4" /> Add question
          </button>
          <button
            onClick={() => setShowAIGenerator(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-fuchsia-300 bg-fuchsia-50 py-3 text-sm font-medium text-fuchsia-600 transition hover:border-fuchsia-400 hover:bg-fuchsia-100"
          >
            <Sparkles className="size-4" /> Auto-generate
          </button>
        </div>
      </motion.div>

      {/* Errors */}
      <AnimatePresence>
        {errors.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3"
          >
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="size-3.5 text-red-500" />
              <span className="text-xs font-semibold text-red-600">
                {errors.length === 1 ? 'Fix this before saving' : `Fix ${errors.length} issues before saving`}
              </span>
            </div>
            <ul className="space-y-0.5 pl-5 list-disc">
              {errors.map((e, i) => (
                <li key={i} className="text-xs text-red-500">{e}</li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Save buttons */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex items-center gap-3 pb-8"
      >
        <button
          onClick={() => save('draft')}
          disabled={saving !== null || saved}
          className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-violet-300 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving === 'draft' ? 'Saving…' : `${saveLabel} as Draft`}
        </button>
        <button
          onClick={() => save('in_progress')}
          disabled={saving !== null || saved}
          className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving === 'publish' ? 'Publishing…' : 'Save & Publish'}
        </button>
        <p className="text-xs text-gray-600">
          Publish validates all questions have correct answers and MCQ has ≥2 options.
        </p>
      </motion.div>

      {/* AI quiz generator modal */}
      <AnimatePresence>
        {showAIGenerator && (
          <AIQuizGenerator
            datasets={datasets}
            datasetId={datasetId}
            onDatasetChange={handleDatasetChange}
            onAccept={(draft) => setQuestions((prev) => [...prev, draft])}
            onClose={() => setShowAIGenerator(false)}
          />
        )}
      </AnimatePresence>

      {/* Inline chart builder modal */}
      <AnimatePresence>
        {openChartFor && datasetId && (
          <InlineChartBuilder
            key={openChartFor}
            columns={columns}
            rows={rows}
            loadingRows={loadingRows}
            datasetId={datasetId}
            onCreated={handleChartCreated}
            onClose={() => setOpenChartFor(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
