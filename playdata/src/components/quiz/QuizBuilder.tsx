'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Trash2, GripVertical, ChevronDown, ChevronUp,
  Database, Hash, AlignLeft, List, AlertTriangle, Check,
  Clock, BookOpen, X, CheckCircle, BarChart2,
} from 'lucide-react';

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
  explanation: string;
  time_limit_secs: number;
}

export interface QuizBuilderProps {
  /** Existing quiz id — provided when editing, undefined when creating */
  quizId?: string;
  initialTitle?: string;
  initialDescription?: string;
  initialDatasetId?: string;
  initialQuestions?: QuestionDraft[];
  initialStatus?: QuizStatus;
  initialIsTimed?: boolean;
  datasets: DatasetOption[];
  visualisations?: VisualisationOption[];
  /** Label shown on primary save button */
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
  mcq:          { label: 'Multiple Choice', icon: List,      colour: 'text-violet-400 bg-violet-500/10 ring-violet-500/20' },
  short_answer: { label: 'Short Answer',    icon: AlignLeft, colour: 'text-blue-400 bg-blue-500/10 ring-blue-500/20' },
  numerical:    { label: 'Numerical',       icon: Hash,      colour: 'text-emerald-400 bg-emerald-500/10 ring-emerald-500/20' },
};

// ── Question card ─────────────────────────────────────────────────────────────
function QuestionCard({
  q,
  idx,
  total,
  expanded,
  columns,
  visualisations,
  onToggle,
  onUpdate,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  isDragOver,
}: {
  q: QuestionDraft;
  idx: number;
  total: number;
  expanded: boolean;
  columns: ColumnSchema[];
  visualisations: VisualisationOption[];
  onToggle: () => void;
  onUpdate: (patch: Partial<QuestionDraft>) => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  isDragOver: boolean;
}) {
  const meta = TYPE_META[q.type];
  const Icon = meta.icon;
  const [showAdvanced, setShowAdvanced] = useState(false);

  const setOption = (i: number, val: string) => {
    const opts = [...q.options];
    const old = opts[i];
    opts[i] = val;
    // keep correct_answer in sync if user edited the correct option text
    onUpdate({
      options: opts,
      correct_answer: q.correct_answer === old ? val : q.correct_answer,
    });
  };

  const addOption = () => onUpdate({ options: [...q.options, ''] });

  const removeOption = (i: number) => {
    const opts = q.options.filter((_, j) => j !== i);
    onUpdate({
      options: opts,
      correct_answer: q.correct_answer === q.options[i] ? '' : q.correct_answer,
    });
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={(e) => e.preventDefault()}
      className={`rounded-2xl border bg-[#11111f]/80 transition-all ${
        isDragOver
          ? 'border-violet-500/60 ring-2 ring-violet-500/20'
          : 'border-[#35354a]/60'
      }`}
    >
      {/* Card header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="cursor-grab touch-none text-[#35354a] hover:text-[#6a6a80] transition active:cursor-grabbing">
          <GripVertical className="size-4" />
        </span>

        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#1a1a2e] text-xs font-bold text-[#6a6a80]">
          {idx + 1}
        </span>

        <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${meta.colour}`}>
          <Icon className="size-3" /> {meta.label}
        </span>

        <p className="min-w-0 flex-1 truncate text-sm text-[#c9c9d4]">
          {q.text.trim() || <span className="italic text-[#4a4a60]">No question text yet…</span>}
        </p>

        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={onToggle}
            className="rounded-lg p-1.5 text-[#6a6a80] transition hover:text-white"
          >
            {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
          {total > 1 && (
            <button
              onClick={onDelete}
              className="rounded-lg p-1.5 text-[#4a4a60] transition hover:text-red-400"
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
            <div className="border-t border-[#35354a]/60 px-4 py-4 space-y-4">

              {/* Question text */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#8d8da0] uppercase tracking-wide">
                  Question text <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={q.text}
                  onChange={(e) => onUpdate({ text: e.target.value })}
                  placeholder="Type your question here…"
                  rows={2}
                  className="w-full resize-none rounded-xl border border-[#35354a] bg-[#0d0d18] px-3 py-2 text-sm text-white placeholder-[#4a4a60] focus:border-violet-500/60 focus:outline-none"
                />
              </div>

              {/* Visualisation attachments (multi-select) */}
              {visualisations.length > 0 && (
                <div>
                  <label className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-[#8d8da0] uppercase tracking-wide">
                    <BarChart2 className="size-3" /> Linked charts
                    <span className="normal-case font-normal ml-1 text-[#4a4a60]">(select one or more)</span>
                  </label>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {visualisations.map((v) => {
                      const checked = q.visualisation_ids.includes(v.id);
                      return (
                        <label
                          key={v.id}
                          className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 transition ${
                            checked
                              ? 'border-violet-500/40 bg-violet-500/10'
                              : 'border-[#35354a]/60 hover:border-[#4a4a60]'
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
                            className="accent-violet-500 shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-white truncate">{v.name}</p>
                            <p className="text-xs text-[#6a6a80] capitalize">{v.chart_type}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  {q.visualisation_ids.length > 0 && (
                    <p className="mt-1 text-xs text-[#6a6a80]">
                      {q.visualisation_ids.length} chart{q.visualisation_ids.length !== 1 ? 's' : ''} will be shown alongside this question.
                    </p>
                  )}
                </div>
              )}

              {/* Type selector */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#8d8da0] uppercase tracking-wide">
                  Question type
                </label>
                <div className="flex gap-2">
                  {(Object.keys(TYPE_META) as QuestionType[]).map((t) => {
                    const m = TYPE_META[t];
                    const TIcon = m.icon;
                    return (
                      <button
                        key={t}
                        onClick={() => onUpdate({ type: t, correct_answer: '', options: t === 'mcq' ? ['', ''] : [] })}
                        className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition ${
                          q.type === t
                            ? 'border-violet-500/40 bg-violet-500/10 text-violet-300'
                            : 'border-[#35354a]/60 text-[#8d8da0] hover:border-[#4a4a60] hover:text-white'
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
                  <label className="mb-1.5 block text-xs font-semibold text-[#8d8da0] uppercase tracking-wide">
                    Options <span className="text-red-400">*</span>
                    <span className="ml-1 normal-case font-normal">(select correct answer)</span>
                  </label>
                  <div className="space-y-2">
                    {q.options.map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <button
                          onClick={() => onUpdate({ correct_answer: opt.trim() })}
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${
                            q.correct_answer === opt.trim() && opt.trim()
                              ? 'border-emerald-500 bg-emerald-500'
                              : 'border-[#35354a] hover:border-violet-500/60'
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
                          className="flex-1 rounded-xl border border-[#35354a] bg-[#0d0d18] px-3 py-1.5 text-sm text-white placeholder-[#4a4a60] focus:border-violet-500/60 focus:outline-none"
                        />
                        {q.options.length > 2 && (
                          <button
                            onClick={() => removeOption(oi)}
                            className="p-1 text-[#4a4a60] transition hover:text-red-400"
                          >
                            <X className="size-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    {q.options.length < 6 && (
                      <button
                        onClick={addOption}
                        className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition"
                      >
                        <Plus className="size-3.5" /> Add option
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Short answer correct answer */}
              {q.type === 'short_answer' && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[#8d8da0] uppercase tracking-wide">
                    Correct answer <span className="text-red-400">*</span>
                  </label>
                  <input
                    value={q.correct_answer}
                    onChange={(e) => onUpdate({ correct_answer: e.target.value })}
                    placeholder="Expected answer"
                    className="w-full rounded-xl border border-[#35354a] bg-[#0d0d18] px-3 py-2 text-sm text-white placeholder-[#4a4a60] focus:border-violet-500/60 focus:outline-none"
                  />
                </div>
              )}

              {/* Numerical answer + tolerance */}
              {q.type === 'numerical' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[#8d8da0] uppercase tracking-wide">
                      Correct answer <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="number"
                      value={q.correct_answer}
                      onChange={(e) => onUpdate({ correct_answer: e.target.value })}
                      placeholder="e.g. 42"
                      className="w-full rounded-xl border border-[#35354a] bg-[#0d0d18] px-3 py-2 text-sm text-white placeholder-[#4a4a60] focus:border-violet-500/60 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[#8d8da0] uppercase tracking-wide">
                      Tolerance (±)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={q.answer_tolerance}
                      onChange={(e) => onUpdate({ answer_tolerance: e.target.value })}
                      placeholder="e.g. 0.5"
                      className="w-full rounded-xl border border-[#35354a] bg-[#0d0d18] px-3 py-2 text-sm text-white placeholder-[#4a4a60] focus:border-violet-500/60 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Advanced: dataset column, explanation, time limit */}
              <div>
                <button
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="flex items-center gap-1.5 text-xs text-[#6a6a80] hover:text-[#c9c9d4] transition"
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
                            <label className="mb-1.5 block text-xs font-semibold text-[#8d8da0] uppercase tracking-wide">
                              Dataset column
                            </label>
                            <select
                              value={q.dataset_column}
                              onChange={(e) => onUpdate({ dataset_column: e.target.value })}
                              className="w-full rounded-xl border border-[#35354a] bg-[#0d0d18] px-3 py-2 text-sm text-white focus:border-violet-500/60 focus:outline-none"
                            >
                              <option value="">— none —</option>
                              {columns.map((c) => (
                                <option key={c.name} value={c.name}>{c.name}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-[#8d8da0] uppercase tracking-wide flex items-center gap-1">
                            <Clock className="size-3" /> Time limit (seconds)
                          </label>
                          <input
                            type="number"
                            min="5"
                            max="300"
                            value={q.time_limit_secs}
                            onChange={(e) => onUpdate({ time_limit_secs: parseInt(e.target.value) || 30 })}
                            className="w-full rounded-xl border border-[#35354a] bg-[#0d0d18] px-3 py-2 text-sm text-white placeholder-[#4a4a60] focus:border-violet-500/60 focus:outline-none"
                          />
                        </div>

                        <div className={columns.length > 0 ? '' : 'sm:col-span-2'}>
                          <label className="mb-1.5 block text-xs font-semibold text-[#8d8da0] uppercase tracking-wide">
                            Explanation (shown after answer)
                          </label>
                          <textarea
                            value={q.explanation}
                            onChange={(e) => onUpdate({ explanation: e.target.value })}
                            placeholder="Optional explanation…"
                            rows={2}
                            className="w-full resize-none rounded-xl border border-[#35354a] bg-[#0d0d18] px-3 py-2 text-sm text-white placeholder-[#4a4a60] focus:border-violet-500/60 focus:outline-none"
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
  datasets,
  visualisations = [],
  saveLabel = 'Save',
}: QuizBuilderProps) {
  const router = useRouter();

  // Quiz metadata
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [datasetId, setDatasetId] = useState(initialDatasetId);
  const [isTimed, setIsTimed] = useState(initialIsTimed);

  // Questions
  const [questions, setQuestions] = useState<QuestionDraft[]>(
    initialQuestions.length > 0 ? initialQuestions : []
  );
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(initialQuestions.length === 0 ? [] : [])
  );

  // Drag
  const dragIdx = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Save
  const [saving, setSaving] = useState<'draft' | 'publish' | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  const selectedDataset = datasets.find((d) => d.id === datasetId);
  const columns: ColumnSchema[] = selectedDataset?.schema?.columns ?? [];

  // ── Question helpers ───────────────────────────────────────────────────────
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

  // ── Drag handlers ──────────────────────────────────────────────────────────
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

  // ── Dataset change — clear column links ───────────────────────────────────
  const handleDatasetChange = (id: string) => {
    setDatasetId(id);
    if (id !== datasetId) {
      setQuestions((prev) => prev.map((q) => ({ ...q, dataset_column: '' })));
    }
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const buildPayload = (status: 'draft' | 'in_progress') => ({
    title: title.trim(),
    description: description.trim() || undefined,
    dataset_id: datasetId || undefined,
    status,
    is_timed: isTimed,
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
    })),
  });

  const save = async (targetStatus: 'draft' | 'in_progress') => {
    const clientErrors: string[] = [];
    if (!title.trim()) clientErrors.push('Quiz title is required.');
    if (targetStatus === 'in_progress') {
      clientErrors.push(...validateForPublish(questions));
    }
    if (clientErrors.length > 0) { setErrors(clientErrors); return; }

    setSaving(targetStatus === 'in_progress' ? 'publish' : 'draft');
    setErrors([]);

    const isEdit = !!quizId;
    const url = isEdit ? `/api/teacher/quizzes/${quizId}` : '/api/teacher/quizzes';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload(targetStatus)),
    });

    const data = await res.json();
    setSaving(null);

    if (!res.ok) {
      setErrors(data.errors ?? [data.error ?? 'Save failed']);
      return;
    }

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
            className="fixed top-6 right-6 z-50 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-400 shadow-xl"
          >
            <CheckCircle className="size-4" /> Saved — redirecting…
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quiz metadata card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-[#35354a]/60 bg-[#11111f]/80 p-6 space-y-4"
      >
        <div className="flex items-center gap-2 mb-1">
          <BookOpen className="size-4 text-violet-400" />
          <span className="text-xs font-semibold uppercase tracking-widest text-[#6a6a80]">Quiz details</span>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-[#8d8da0] uppercase tracking-wide">
            Title <span className="text-red-400">*</span>
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Chapter 3 Review"
            className="w-full rounded-xl border border-[#35354a] bg-[#0d0d18] px-3 py-2.5 text-sm font-semibold text-white placeholder-[#4a4a60] focus:border-violet-500/60 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-[#8d8da0] uppercase tracking-wide">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description for students…"
            rows={2}
            className="w-full resize-none rounded-xl border border-[#35354a] bg-[#0d0d18] px-3 py-2 text-sm text-white placeholder-[#4a4a60] focus:border-violet-500/60 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-[#8d8da0] uppercase tracking-wide flex items-center gap-1">
            <Database className="size-3" /> Linked dataset (optional)
          </label>
          <select
            value={datasetId}
            onChange={(e) => handleDatasetChange(e.target.value)}
            className="w-full rounded-xl border border-[#35354a] bg-[#0d0d18] px-3 py-2 text-sm text-white focus:border-violet-500/60 focus:outline-none"
          >
            <option value="">— none —</option>
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        {/* Timed toggle */}
        <label className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${isTimed ? 'border-violet-500/30 bg-violet-500/5' : 'border-[#35354a]/40 bg-[#0f0f1d]'}`}>
          <input
            type="checkbox"
            checked={isTimed}
            onChange={(e) => setIsTimed(e.target.checked)}
            className="accent-violet-500 shrink-0"
          />
          <div>
            <div className="flex items-center gap-2">
              <Clock className="size-3.5 text-violet-400" />
              <p className="text-sm font-medium text-white">Timed quiz</p>
            </div>
            <p className="text-xs text-[#6a6a80] mt-0.5">
              {isTimed
                ? 'Each question has a countdown timer. Set time limits per question in Advanced options.'
                : 'No time limits — students can answer at their own pace.'}
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
          <p className="text-sm font-semibold text-[#c9c9d4]">
            Questions
            {questions.length > 0 && (
              <span className="ml-2 rounded-full bg-violet-500/15 px-2 py-0.5 text-xs text-violet-400">
                {questions.length}
              </span>
            )}
          </p>
          {questions.length > 1 && (
            <p className="text-xs text-[#4a4a60]">Drag to reorder</p>
          )}
        </div>

        {questions.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[#35354a]/60 bg-[#0f0f1d]/40 px-6 py-10 text-center">
            <p className="text-sm text-[#6a6a80]">No questions yet — add one below.</p>
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
            visualisations={visualisations}
            onToggle={() => toggleExpand(q._key)}
            onUpdate={(patch) => updateQuestion(q._key, patch)}
            onDelete={() => deleteQuestion(q._key)}
            onDragStart={() => { dragIdx.current = idx; }}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDrop={(e) => handleDrop(e, idx)}
            isDragOver={dragOverIdx === idx}
          />
        ))}

        <button
          onClick={addQuestion}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-violet-500/30 bg-violet-500/5 py-3 text-sm font-medium text-violet-400 transition hover:border-violet-500/60 hover:bg-violet-500/10"
        >
          <Plus className="size-4" /> Add question
        </button>
      </motion.div>

      {/* Errors */}
      <AnimatePresence>
        {errors.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3"
          >
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="size-3.5 text-red-400" />
              <span className="text-xs font-semibold text-red-400">
                {errors.length === 1 ? 'Fix this before saving' : `Fix ${errors.length} issues before saving`}
              </span>
            </div>
            <ul className="space-y-0.5 pl-5 list-disc">
              {errors.map((e, i) => (
                <li key={i} className="text-xs text-red-400/80">{e}</li>
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
          className="flex items-center gap-2 rounded-xl border border-[#35354a] bg-[#11111f] px-5 py-2.5 text-sm font-semibold text-[#c9c9d4] transition hover:border-violet-500/40 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving === 'draft' ? 'Saving…' : `${saveLabel} as Draft`}
        </button>
        <button
          onClick={() => save('in_progress')}
          disabled={saving !== null || saved}
          className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving === 'publish' ? 'Publishing…' : 'Save & Publish'}
        </button>
        <p className="text-xs text-[#4a4a60]">
          Publish validates all questions have correct answers and MCQ has ≥2 options.
        </p>
      </motion.div>
    </div>
  );
}
