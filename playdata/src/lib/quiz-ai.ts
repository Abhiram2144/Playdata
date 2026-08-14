import type { SupabaseClient } from '@supabase/supabase-js';

export interface AiMeta {
  generation_id: string | null;
  original_text: string;
}

export interface AiMetaQuestion {
  text: string;
  ai_meta?: AiMeta | null;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * Insert ai_quiz_evaluations rows for freshly-inserted questions that carry
 * AI metadata. `inserted` must be the .select('id, order_index') result of the
 * questions insert, where order_index === the question's index in `questions`.
 */
export async function insertAiEvaluations(
  admin: SupabaseClient,
  teacherId: string,
  questions: AiMetaQuestion[],
  inserted: { id: string; order_index: number }[]
): Promise<void> {
  const rows = inserted.flatMap(({ id, order_index }) => {
    const q = questions[order_index];
    if (!q?.ai_meta?.original_text) return [];
    const original = q.ai_meta.original_text.trim();
    const final = q.text.trim();
    const wasEdited = original !== final;
    return [{
      question_id: id,
      teacher_id: teacherId,
      generation_id: q.ai_meta.generation_id,
      was_edited: wasEdited,
      edit_distance: wasEdited ? levenshtein(original, final) : null,
    }];
  });
  if (rows.length === 0) return;
  const { error } = await admin.from('ai_quiz_evaluations').insert(rows);
  if (error) console.error('ai_quiz_evaluations insert failed:', error.message);
}
