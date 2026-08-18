'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  X, Sparkles, Loader2, Check, Pencil, Trash2, Database,
  AlertTriangle, List, AlignLeft, Hash, Tag, ArrowLeft, BarChart2,
} from 'lucide-react';
import { QUESTION_TYPE_HELP, type DatasetOption, type QuestionDraft, type QuestionType } from '@/components/quiz/QuizBuilder';
import { InfoTip } from '@/components/ui/InfoTip';

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

interface ReviewItem extends GeneratedQuestion {
  _key: string;
  original_text: string;
  original_correct: string;
  accepted: boolean;
  editing: boolean;
}

export interface AIQuizGeneratorProps {
  datasets: DatasetOption[];
  datasetId: string;
  onDatasetChange: (id: string) => void;
  onAccept: (draft: QuestionDraft) => void;
  onClose: () => void;
}

const INPUT = 'w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 transition focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100';

const TYPE_META: Record<QuestionType, { label: string; icon: React.ElementType; colour: string }> = {
  mcq:          { label: 'Multiple Choice', icon: List,      colour: 'text-violet-700 bg-violet-100 ring-violet-200' },
  short_answer: { label: 'Short Answer',    icon: AlignLeft, colour: 'text-blue-700 bg-blue-100 ring-blue-200' },
  numerical:    { label: 'Numerical',       icon: Hash,      colour: 'text-emerald-700 bg-emerald-100 ring-emerald-200' },
};

function makeKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function CountStepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-600">{label}</label>
      <input
        type="number"
        min={0}
        max={10}
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.min(10, parseInt(e.target.value) || 0)))}
        className={INPUT}
      />
    </div>
  );
}

function ReviewCard({
  item, onChange, onAccept, onDiscard,
}: {
  item: ReviewItem;
  onChange: (patch: Partial<ReviewItem>) => void;
  onAccept: () => void;
  onDiscard: () => void;
}) {
  const meta = TYPE_META[item.type];
  const Icon = meta.icon;

  const setOption = (i: number, val: string) => {
    const options = [...item.options];
    const old = options[i];
    options[i] = val;
    onChange({ options, correct_answer: item.correct_answer === old ? val : item.correct_answer });
  };

  return (
    <div className={`rounded-2xl border bg-white p-4 shadow-sm transition ${
      item.accepted ? 'border-emerald-200 bg-emerald-50/50' : 'border-gray-100'
    }`}>
      <div className="mb-2 flex items-center gap-2">
        <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${meta.colour}`}>
          <Icon className="size-3" /> {meta.label}
        </span>
        {item.topic_tag && (
          <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            <Tag className="size-3" /> {item.topic_tag}
          </span>
        )}
        {item.dataset_column && (
          <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            <Database className="size-3" /> {item.dataset_column}
          </span>
        )}
        {item.accepted && (
          <span className="ml-auto flex items-center gap-1 text-xs font-semibold text-emerald-600">
            <Check className="size-3.5" /> Added to quiz
          </span>
        )}
      </div>

      {item.editing ? (
        <div className="space-y-3">
          <textarea
            value={item.text}
            onChange={(e) => onChange({ text: e.target.value })}
            rows={2}
            className={`${INPUT} resize-none`}
          />
          {item.type === 'mcq' && (
            <div className="space-y-2">
              {item.options.map((opt, oi) => (
                <div key={oi} className="flex items-center gap-2">
                  <button
                    onClick={() => onChange({ correct_answer: opt })}
                    aria-label={`Mark option ${oi + 1} correct`}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${
                      item.correct_answer === opt && opt
                        ? 'border-emerald-500 bg-emerald-500'
                        : 'border-gray-300 hover:border-violet-400'
                    }`}
                  >
                    {item.correct_answer === opt && opt && <Check className="size-2.5 text-white" />}
                  </button>
                  <input value={opt} onChange={(e) => setOption(oi, e.target.value)} className={INPUT} />
                </div>
              ))}
            </div>
          )}
          {item.type !== 'mcq' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">Correct answer</label>
                <input
                  value={item.correct_answer}
                  onChange={(e) => onChange({ correct_answer: e.target.value })}
                  className={INPUT}
                />
              </div>
              {item.type === 'numerical' && (
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">Tolerance (±)</label>
                  <input
                    type="number"
                    min={0}
                    value={item.answer_tolerance ?? ''}
                    onChange={(e) => onChange({ answer_tolerance: e.target.value === '' ? null : Number(e.target.value) })}
                    className={INPUT}
                  />
                </div>
              )}
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">Topic tag</label>
            <input value={item.topic_tag} onChange={(e) => onChange({ topic_tag: e.target.value })} className={INPUT} />
          </div>
          {item.explanation && (
            <p className="text-xs text-amber-600">
              Changing the question text or correct answer discards the explanation — a fresh one is generated when the quiz is run.
            </p>
          )}
        </div>
      ) : (
        <div>
          <p className="text-sm text-gray-800">{item.text}</p>
          {item.type === 'mcq' && (
            <ul className="mt-2 space-y-1">
              {item.options.map((opt, oi) => (
                <li
                  key={oi}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1 text-xs ${
                    opt === item.correct_answer
                      ? 'bg-emerald-50 font-medium text-emerald-700'
                      : 'text-gray-600'
                  }`}
                >
                  {opt === item.correct_answer
                    ? <Check className="size-3 shrink-0 text-emerald-500" />
                    : <span className="inline-block size-3 shrink-0" />}
                  {opt}
                </li>
              ))}
            </ul>
          )}
          {item.type !== 'mcq' && (
            <p className="mt-2 text-xs text-gray-600">
              Answer: <span className="font-medium text-gray-800">{item.correct_answer}</span>
              {item.type === 'numerical' && item.answer_tolerance != null && item.answer_tolerance > 0 && (
                <span> (± {item.answer_tolerance})</span>
              )}
            </p>
          )}
          {item.explanation && (
            <p className="mt-2 rounded-lg bg-gray-50 px-2.5 py-1.5 text-xs text-gray-600">
              <span className="font-semibold text-gray-700">Explanation: </span>{item.explanation}
            </p>
          )}
          {item.suggested_chart_type && (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-sky-50 px-2.5 py-1.5 text-xs text-sky-700 ring-1 ring-inset ring-sky-100">
              <BarChart2 className="mt-0.5 size-3 shrink-0" />
              <span>
                <span className="font-semibold capitalize">Suggested chart: {item.suggested_chart_type}</span>
                {item.suggested_chart_note && <span> — {item.suggested_chart_note}</span>}
                <span className="block text-sky-600/80">Create and link this chart to the question in the quiz builder.</span>
              </span>
            </p>
          )}
        </div>
      )}

      {!item.accepted && (
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={onAccept}
            disabled={!item.text.trim() || !item.correct_answer.trim()}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Check className="size-3.5" /> Accept
          </button>
          <button
            onClick={() => onChange({ editing: !item.editing })}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:border-violet-300 hover:text-violet-700"
          >
            <Pencil className="size-3.5" /> {item.editing ? 'Done editing' : 'Edit'}
          </button>
          <button
            onClick={onDiscard}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="size-3.5" /> Discard
          </button>
        </div>
      )}
    </div>
  );
}

export function AIQuizGenerator({
  datasets, datasetId, onDatasetChange, onAccept, onClose,
}: AIQuizGeneratorProps) {
  const [phase, setPhase] = useState<'config' | 'generating' | 'review'>('config');
  const [counts, setCounts] = useState({ mcq: 3, numerical: 1, short_answer: 1 });
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [generationId, setGenerationId] = useState<string | null>(null);

  const total = counts.mcq + counts.numerical + counts.short_answer;

  const generate = async () => {
    setPhase('generating');
    setError(null);
    try {
      const res = await fetch('/api/teacher/ai/generate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset_id: datasetId, counts }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Generation failed');
        setPhase('config');
        return;
      }
      setGenerationId(data.generation_id ?? null);
      setItems((data.questions as GeneratedQuestion[]).map((q) => ({
        ...q,
        _key: makeKey(),
        original_text: q.text,
        original_correct: q.correct_answer,
        accepted: false,
        editing: false,
      })));
      setPhase('review');
    } catch {
      setError('Network error — please try again');
      setPhase('config');
    }
  };

  const updateItem = (key: string, patch: Partial<ReviewItem>) => {
    setItems((prev) => prev.map((it) => (it._key === key ? { ...it, ...patch } : it)));
  };

  const acceptItem = (item: ReviewItem) => {
    // A generated explanation justifies the generated question/answer pair; if
    // the teacher changed either, the explanation may no longer match — drop it
    // (the session-start backfill regenerates explanations for questions without one).
    const answerChanged =
      item.text.trim() !== item.original_text.trim() ||
      item.correct_answer.trim() !== item.original_correct.trim();
    onAccept({
      _key: makeKey(),
      text: item.text.trim(),
      type: item.type,
      options: item.type === 'mcq' ? item.options.map((o) => o.trim()).filter(Boolean) : [],
      correct_answer: item.correct_answer.trim(),
      answer_tolerance: item.type === 'numerical' && item.answer_tolerance != null ? String(item.answer_tolerance) : '',
      dataset_column: item.dataset_column ?? '',
      visualisation_ids: [],
      chart_hint: item.suggested_chart_type
        ? `${item.suggested_chart_type}${item.suggested_chart_note ? ` — ${item.suggested_chart_note}` : ''}`
        : undefined,
      explanation: answerChanged ? '' : item.explanation.trim(),
      time_limit_secs: 30,
      topic_tag: item.topic_tag.trim(),
      _ai: { generation_id: generationId, original_text: item.original_text },
    });
    updateItem(item._key, { accepted: true, editing: false });
  };

  const acceptedCount = items.filter((i) => i.accepted).length;
  const pendingCount = items.length - acceptedCount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.18 }}
        className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-gray-500">
              <Sparkles className="size-3.5 text-violet-500" /> Question generator
            </p>
            <h2 className="mt-0.5 text-base font-semibold text-gray-900">
              {phase === 'review'
                ? 'Review generated questions'
                : 'Draft quiz questions from your dataset'}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {phase === 'config' && (
            <div className="space-y-4">
              <div>
                <label htmlFor="ai-gen-dataset" className="mb-1.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
                  <Database className="size-3" /> Dataset <span className="text-red-400">*</span>
                </label>
                <select
                  id="ai-gen-dataset"
                  value={datasetId}
                  onChange={(e) => onDatasetChange(e.target.value)}
                  className={INPUT}
                >
                  <option value="">— select a dataset —</option>
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Questions are grounded in this dataset&rsquo;s real columns and values. It becomes the quiz&rsquo;s linked dataset.
                </p>
              </div>

              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Number of questions
                  <InfoTip ariaLabel="What do the question types mean?" entries={QUESTION_TYPE_HELP} />
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <CountStepper label="MCQ" value={counts.mcq} onChange={(v) => setCounts((c) => ({ ...c, mcq: v }))} />
                  <CountStepper label="Numerical" value={counts.numerical} onChange={(v) => setCounts((c) => ({ ...c, numerical: v }))} />
                  <CountStepper label="Short answer" value={counts.short_answer} onChange={(v) => setCounts((c) => ({ ...c, short_answer: v }))} />
                </div>
              </div>
              <p className="text-xs text-gray-500">{total} question{total !== 1 ? 's' : ''} total (max 15).</p>

              {error && (
                <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                  <AlertTriangle className="size-3.5 shrink-0 text-red-500" />
                  <p className="text-xs text-red-600">{error}</p>
                </div>
              )}
            </div>
          )}

          {phase === 'generating' && (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <Loader2 className="size-8 animate-spin text-violet-500" />
              <p className="text-sm font-medium text-gray-700">Generating {total} questions from your data…</p>
              <p className="text-xs text-gray-500">This usually takes a few seconds.</p>
            </div>
          )}

          {phase === 'review' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                Nothing is saved automatically — accept the questions you want, edit them first if needed, or discard them.
              </p>
              {items.map((item) => (
                <ReviewCard
                  key={item._key}
                  item={item}
                  onChange={(patch) => updateItem(item._key, patch)}
                  onAccept={() => acceptItem(item)}
                  onDiscard={() => setItems((prev) => prev.filter((it) => it._key !== item._key))}
                />
              ))}
              {items.length === 0 && (
                <p className="py-8 text-center text-sm text-gray-500">All questions discarded.</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-gray-100 px-6 py-4">
          {phase === 'review' ? (
            <>
              <button
                onClick={() => { setItems([]); setPhase('config'); }}
                className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-violet-300 hover:text-violet-700"
              >
                <ArrowLeft className="size-3.5" /> Generate more
              </button>
              <div className="flex items-center gap-3">
                {acceptedCount > 0 && (
                  <p className="text-xs text-gray-500">
                    {acceptedCount} added{pendingCount > 0 ? `, ${pendingCount} pending` : ''}
                  </p>
                )}
                <button
                  onClick={onClose}
                  className="rounded-xl bg-violet-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-violet-500"
                >
                  Done
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-gray-500">Questions are drafted from your dataset&rsquo;s real values.</p>
              <button
                onClick={generate}
                disabled={phase === 'generating' || !datasetId || total < 1 || total > 15}
                className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {phase === 'generating'
                  ? <><Loader2 className="size-4 animate-spin" /> Generating…</>
                  : <><Sparkles className="size-4" /> Generate</>}
              </button>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
