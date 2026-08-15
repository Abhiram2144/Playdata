import type { SupabaseClient } from '@supabase/supabase-js';

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini';
const LOW_ACCURACY_THRESHOLD = 0.5;

interface TopicStat {
  topic: string;
  questions: number;
  responses: number;
  accuracy: number;
}

interface QuestionStat {
  text: string;
  topic: string | null;
  responses: number;
  accuracy: number;
}

interface SessionStats {
  session_title: string;
  participant_count: number;
  question_count: number;
  average_score: number | null;
  overall_accuracy: number | null;
  topics: TopicStat[];
  weakest_topics: string[];
  strongest_topics: string[];
  low_accuracy_questions: QuestionStat[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * All arithmetic happens here, in application code — the model only turns the
 * finished numbers into prose. Returns null when there is nothing to
 * summarize (no participants or no graded responses).
 */
async function computeSessionStats(
  sessionId: string,
  admin: SupabaseClient
): Promise<SessionStats | null> {
  const [{ data: session }, { data: items }, { data: participants }, { data: responses }] =
    await Promise.all([
      admin.from('sessions').select('title').eq('id', sessionId).single(),
      admin.from('session_items').select('type, reference_id').eq('session_id', sessionId),
      admin.from('session_participants').select('score').eq('session_id', sessionId),
      admin.from('student_responses').select('question_id, is_correct').eq('session_id', sessionId),
    ]);

  const graded = (responses ?? []).filter((r) => r.is_correct === true || r.is_correct === false);
  if (!session || (participants ?? []).length === 0 || graded.length === 0) return null;

  const quizIds = (items ?? []).filter((i) => i.type === 'quiz').map((i) => i.reference_id as string);
  const standaloneIds = (items ?? []).filter((i) => i.type === 'question').map((i) => i.reference_id as string);

  const [quizQuestions, standaloneQuestions] = await Promise.all([
    quizIds.length > 0
      ? admin.from('questions').select('id, text, topic_tag').in('quiz_id', quizIds)
      : Promise.resolve({ data: [] }),
    standaloneIds.length > 0
      ? admin.from('questions').select('id, text, topic_tag').in('id', standaloneIds)
      : Promise.resolve({ data: [] }),
  ]);

  const questionMeta = new Map<string, { text: string; topic_tag: string | null }>();
  for (const q of [...(quizQuestions.data ?? []), ...(standaloneQuestions.data ?? [])]) {
    questionMeta.set(q.id, { text: q.text, topic_tag: q.topic_tag });
  }

  const perQuestion = new Map<string, { correct: number; total: number }>();
  for (const r of graded) {
    const s = perQuestion.get(r.question_id) ?? { correct: 0, total: 0 };
    s.total += 1;
    if (r.is_correct === true) s.correct += 1;
    perQuestion.set(r.question_id, s);
  }

  const overallCorrect = graded.filter((r) => r.is_correct === true).length;

  const perTopic = new Map<string, { correct: number; total: number; questions: Set<string> }>();
  for (const [qid, s] of perQuestion) {
    const topic = questionMeta.get(qid)?.topic_tag ?? 'Untagged';
    const t = perTopic.get(topic) ?? { correct: 0, total: 0, questions: new Set<string>() };
    t.correct += s.correct;
    t.total += s.total;
    t.questions.add(qid);
    perTopic.set(topic, t);
  }

  const topics: TopicStat[] = [...perTopic.entries()]
    .map(([topic, t]) => ({
      topic,
      questions: t.questions.size,
      responses: t.total,
      accuracy: round2(t.correct / t.total),
    }))
    .sort((a, b) => a.accuracy - b.accuracy);

  const weakest = topics.length > 1 ? topics.filter((t) => t.accuracy === topics[0].accuracy) : [];
  const strongest = topics.length > 1
    ? topics.filter((t) => t.accuracy === topics[topics.length - 1].accuracy)
    : [];

  const lowQuestions: QuestionStat[] = [...perQuestion.entries()]
    .map(([qid, s]) => ({
      text: questionMeta.get(qid)?.text ?? 'Unknown question',
      topic: questionMeta.get(qid)?.topic_tag ?? null,
      responses: s.total,
      accuracy: round2(s.correct / s.total),
    }))
    .filter((q) => q.responses >= 2 && q.accuracy < LOW_ACCURACY_THRESHOLD)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 2);

  const scores = (participants ?? []).map((p) => p.score ?? 0);

  return {
    session_title: session.title,
    participant_count: scores.length,
    question_count: perQuestion.size,
    average_score: round2(scores.reduce((a, b) => a + b, 0) / scores.length),
    overall_accuracy: round2(overallCorrect / graded.length),
    topics,
    weakest_topics: weakest.map((t) => t.topic),
    strongest_topics: strongest.map((t) => t.topic),
    low_accuracy_questions: lowQuestions,
  };
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    bullets: {
      type: 'array',
      items: { type: 'string' },
      description: '3-6 concise bullet points, plain text without leading dashes',
    },
  },
  required: ['bullets'],
  additionalProperties: false,
};

export async function generateSessionSummary(
  sessionId: string,
  teacherId: string,
  admin: SupabaseClient
): Promise<void> {
  if (!process.env.OPENAI_API_KEY) return;

  const stats = await computeSessionStats(sessionId, admin);
  if (!stats) return;

  const systemPrompt =
    'You write concise post-lesson performance summaries for teachers on a data-literacy platform. ' +
    'You receive pre-computed class statistics as JSON. Use only these numbers — do not perform ' +
    'additional arithmetic or invent figures. Keep everything class-level; never mention or single ' +
    'out individual students. Accuracy values are fractions (0-1); express them as percentages.';

  const userPrompt = `Class statistics for the session "${stats.session_title}":

${JSON.stringify(stats, null, 2)}

Write 3-6 short bullet points for the teacher covering:
- overall class performance (participants, average score, overall accuracy)
- the weakest topic(s), if any stand out
- the strongest topic(s), if any stand out
- any standout question with notably low accuracy (quote or paraphrase it briefly)
Keep each bullet to one sentence. Plain text only, no markdown, no leading dashes.`;

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
        json_schema: { name: 'session_summary', strict: true, schema: RESPONSE_SCHEMA },
      },
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!aiRes.ok) {
    throw new Error(`OpenAI ${aiRes.status}: ${await aiRes.text().catch(() => '')}`);
  }

  const data = await aiRes.json();
  const content: string = data.choices?.[0]?.message?.content ?? '';
  const tokensUsed: number | null = data.usage?.total_tokens ?? null;

  const bullets: string[] = (JSON.parse(content).bullets ?? [])
    .map((b: string) => String(b).trim().replace(/^[-•]\s*/, ''))
    .filter(Boolean);
  if (bullets.length === 0) throw new Error('AI returned no summary bullets');

  const summary = bullets.map((b) => `- ${b}`).join('\n');

  const { error: updateErr } = await admin
    .from('sessions')
    .update({ ai_summary: summary })
    .eq('id', sessionId);
  if (updateErr) throw new Error(`sessions.ai_summary update failed: ${updateErr.message}`);

  const { error: logErr } = await admin.from('ai_generations').insert({
    teacher_id: teacherId,
    type: 'lesson_summary',
    prompt: `${systemPrompt}\n\n---\n\n${userPrompt}`,
    response: content,
    tokens_used: tokensUsed,
  });
  if (logErr) console.error('ai_generations insert failed:', logErr.message);
}
