'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlignLeft, Hash, List, Loader2, Search, Tag, X } from 'lucide-react';
import type { QuestionType } from './QuizBuilder';

export interface BankQuestion {
  id: string;
  quiz_id: string;
  quiz_title: string | null;
  text: string;
  type: QuestionType;
  topic_tag: string | null;
  options: string[] | null;
  correct_answer: string;
  answer_tolerance: number | null;
  dataset_column: string | null;
  explanation: string | null;
  time_limit_secs: number;
  visualisation_ids: string[] | null;
}

interface Props {
  onAdd: (q: BankQuestion) => void;
  onClose: () => void;
  excludeQuizId?: string;
  availableTags: string[];
}

const TYPE_PILL: Record<QuestionType, { label: string; colour: string }> = {
  mcq:          { label: 'MCQ',    colour: 'text-violet-400 bg-violet-500/10 ring-violet-500/20' },
  short_answer: { label: 'Short',  colour: 'text-blue-400 bg-blue-500/10 ring-blue-500/20' },
  numerical:    { label: 'Num',    colour: 'text-emerald-400 bg-emerald-500/10 ring-emerald-500/20' },
};

const TYPE_ICON: Record<QuestionType, React.ElementType> = {
  mcq: List,
  short_answer: AlignLeft,
  numerical: Hash,
};

export default function QuestionBankPicker({ onAdd, onClose, excludeQuizId, availableTags }: Props) {
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchQuestions = useCallback(async (tag: string | null, q: string) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (tag) params.set('tag', tag);
    if (q.trim()) params.set('q', q.trim());
    if (excludeQuizId) params.set('exclude_quiz', excludeQuizId);
    const res = await fetch(`/api/questions/bank?${params}`);
    if (res.ok) {
      const data = await res.json();
      setQuestions(data.questions ?? []);
    }
    setLoading(false);
  }, [excludeQuizId]);

  useEffect(() => { fetchQuestions(null, ''); }, [fetchQuestions]);

  function handleSearchChange(v: string) {
    setSearch(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchQuestions(activeTag, v), 280);
  }

  function handleTagFilter(tag: string | null) {
    setActiveTag(tag);
    fetchQuestions(tag, search);
  }

  function handleAdd(q: BankQuestion) {
    onAdd(q);
    setAddedIds((prev) => new Set([...prev, q.id]));
  }

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.18 }}
        className="relative z-10 flex h-[80vh] w-full max-w-2xl flex-col rounded-2xl border border-[#35354a]/60 bg-[#0d0d18] shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#35354a]/60 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Question Bank</h2>
            <p className="text-xs text-[#6a6a80]">Browse and reuse questions from your quizzes</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#6a6a80] transition hover:bg-[#1a1a2e] hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Filters */}
        <div className="border-b border-[#35354a]/40 px-5 py-3 space-y-2.5">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#4a4a60]" />
            <input
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search questions…"
              className="w-full rounded-xl border border-[#35354a] bg-[#11111f] py-2 pl-8 pr-3 text-sm text-white placeholder-[#4a4a60] focus:border-violet-500/60 focus:outline-none"
            />
          </div>

          {/* Tag chips */}
          {availableTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => handleTagFilter(null)}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
                  activeTag === null
                    ? 'bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/30'
                    : 'bg-[#1a1a2e] text-[#6a6a80] hover:text-[#c9c9d4]'
                }`}
              >
                All topics
              </button>
              {availableTags.map((t) => (
                <button
                  key={t}
                  onClick={() => handleTagFilter(activeTag === t ? null : t)}
                  className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
                    activeTag === t
                      ? 'bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/30'
                      : 'bg-[#1a1a2e] text-[#6a6a80] hover:text-[#c9c9d4]'
                  }`}
                >
                  <Tag className="size-2.5" />
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-[#4a4a60]" />
            </div>
          ) : questions.length === 0 ? (
            <div className="flex h-32 items-center justify-center">
              <p className="text-sm text-[#4a4a60]">
                {search || activeTag ? 'No questions match your filters.' : 'No questions in your bank yet.'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-[#1a1a2e]">
              <AnimatePresence initial={false}>
                {questions.map((q) => {
                  const pill = TYPE_PILL[q.type];
                  const Icon = TYPE_ICON[q.type];
                  const added = addedIds.has(q.id);
                  return (
                    <motion.li
                      key={q.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-start gap-3 px-5 py-3.5 hover:bg-[#11111f]/60 transition"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="mb-1 flex flex-wrap items-center gap-1.5">
                          <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${pill.colour}`}>
                            <Icon className="size-2.5" /> {pill.label}
                          </span>
                          {q.topic_tag && (
                            <span className="flex items-center gap-1 rounded-full bg-[#1a1a2e] px-2 py-0.5 text-[11px] text-[#6a6a80]">
                              <Tag className="size-2.5" /> {q.topic_tag}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-[#c9c9d4] line-clamp-2">{q.text}</p>
                        {q.quiz_title && (
                          <p className="mt-0.5 text-xs text-[#4a4a60]">From: {q.quiz_title}</p>
                        )}
                      </div>
                      <button
                        onClick={() => handleAdd(q)}
                        disabled={added}
                        className={`mt-0.5 shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                          added
                            ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20 cursor-default'
                            : 'bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/25 hover:bg-violet-500/25'
                        }`}
                      >
                        {added ? 'Added' : 'Add'}
                      </button>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </div>

        {/* Footer count */}
        <div className="border-t border-[#35354a]/40 px-5 py-2.5">
          <p className="text-xs text-[#4a4a60]">
            {loading ? '…' : `${questions.length} question${questions.length !== 1 ? 's' : ''}`}
            {addedIds.size > 0 && (
              <span className="ml-2 text-emerald-400">· {addedIds.size} added to quiz</span>
            )}
          </p>
        </div>
      </motion.div>
    </div>
  );
}
