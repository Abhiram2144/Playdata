import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import { ArrowLeft, Database, FolderPlus, BarChart3, BookOpen, LayoutDashboard, Users, TrendingUp, UserCircle } from 'lucide-react';
import { TEACHER_NAV } from '@/lib/teacher-nav';
import { GetServerSidePropsResult } from 'next';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { type NavItem } from '@/components/layout/Sidebar';
import { withAuth } from '@/lib/auth';
import { createClientFromContext } from '@/lib/supabase/server-props';
import { createAdminClient } from '@/lib/supabase/admin';
import QuizBuilder, { type DatasetOption, type QuestionDraft, type QuizStatus, type VisualisationOption } from '@/components/quiz/QuizBuilder';
import CollaboratorsPanel, { type CollaboratorRow } from '@/components/quiz/CollaboratorsPanel';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: string;
  subject_taught: string | null;
  institution_role: string | null;
  created_at: string;
}

interface QuizRow {
  id: string;
  title: string;
  description: string | null;
  status: QuizStatus;
  dataset_id: string | null;
  assigned_to: string | null;
  is_timed: boolean;
  questions: {
    id: string;
    order_index: number;
    text: string;
    type: 'mcq' | 'short_answer' | 'numerical';
    options: string[] | null;
    correct_answer: string;
    answer_tolerance: number | null;
    dataset_column: string | null;
    visualisation_ids: string[] | null;
    explanation: string | null;
    time_limit_secs: number;
  }[];
}

interface AssignedProfile {
  id: string;
  full_name: string;
  email: string;
}

interface Props {
  profile: Profile;
  quiz: QuizRow;
  datasets: DatasetOption[];
  visualisations: VisualisationOption[];
  isOwner: boolean;
  collaborators: CollaboratorRow[];
  assignedToProfile: AssignedProfile | null;
}

// ── Server-side ───────────────────────────────────────────────────────────────
export const getServerSideProps = withAuth(
  async (context, userId): Promise<GetServerSidePropsResult<Props>> => {
    const { id } = context.params as { id: string };
    const supabase = createClientFromContext(context);
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, subject_taught, institution_role, created_at')
      .eq('id', userId)
      .single();

    if (!profile) return { redirect: { destination: '/auth/login', permanent: false } };

    const admin = createAdminClient();

    // Verify user has access (collaborator role)
    const { data: collabRow } = await admin
      .from('quiz_collaborators')
      .select('role')
      .eq('quiz_id', id)
      .eq('teacher_id', userId)
      .single();

    if (!collabRow) return { notFound: true };
    const isOwner = collabRow.role === 'owner';

    const [{ data: rawQuiz }, { data: rawDatasets }, { data: rawCollabs }, { data: rawVisualisations }] = await Promise.all([
      admin
        .from('quizzes')
        .select(`
          id, title, description, status, dataset_id, assigned_to,
          questions(id, order_index, text, type, options, correct_answer,
                    answer_tolerance, dataset_column, visualisation_id, explanation, time_limit_secs)
        `)
        .eq('id', id)
        .single(),
      admin
        .from('datasets')
        .select('id, name, schema')
        .eq('teacher_id', userId)
        .order('name'),
      admin
        .from('quiz_collaborators')
        .select('teacher_id, role, added_at')
        .eq('quiz_id', id)
        .order('added_at', { ascending: true }),
      admin
        .from('visualisations')
        .select('id, name, chart_type')
        .eq('teacher_id', userId)
        .order('name'),
    ]);

    if (!rawQuiz) return { notFound: true };

    // Resolve collaborator profile names
    const collabTeacherIds = (rawCollabs ?? []).map((c: { teacher_id: string }) => c.teacher_id);
    const idsToFetch = new Set<string>(collabTeacherIds);
    const quizRecord = rawQuiz as Record<string, unknown>;
    if (quizRecord.assigned_to) idsToFetch.add(quizRecord.assigned_to as string);

    const { data: profileRows } = idsToFetch.size > 0
      ? await admin.from('profiles').select('id, full_name, email').in('id', [...idsToFetch])
      : { data: [] };

    const profileMap = new Map(
      (profileRows ?? []).map((p: { id: string; full_name: string; email: string }) => [p.id, p])
    );

    const collaborators: CollaboratorRow[] = (rawCollabs ?? []).map(
      (c: { teacher_id: string; role: string; added_at: string }) => {
        const p = profileMap.get(c.teacher_id) as { full_name: string; email: string } | undefined;
        return {
          teacher_id: c.teacher_id,
          role: c.role as 'owner' | 'contributor',
          added_at: c.added_at,
          full_name: p?.full_name ?? '',
          email: p?.email ?? '',
        };
      }
    );

    const assignedTo = quizRecord.assigned_to as string | null;
    const assignedToProfile: AssignedProfile | null = assignedTo
      ? (profileMap.get(assignedTo) as AssignedProfile | undefined) ?? null
      : null;

    const questions = (
      Array.isArray(quizRecord.questions)
        ? (quizRecord.questions as Record<string, unknown>[])
        : []
    ).sort((a, b) => (a.order_index as number) - (b.order_index as number));

    const quiz: QuizRow = {
      id: rawQuiz.id as string,
      title: rawQuiz.title as string,
      description: rawQuiz.description as string | null,
      status: rawQuiz.status as QuizStatus,
      dataset_id: rawQuiz.dataset_id as string | null,
      assigned_to: assignedTo,
      is_timed: ((rawQuiz as Record<string, unknown>).is_timed as boolean) ?? true,
      questions: questions.map((q) => ({
        id: q.id as string,
        order_index: q.order_index as number,
        text: q.text as string,
        type: q.type as 'mcq' | 'short_answer' | 'numerical',
        options: q.options as string[] | null,
        correct_answer: q.correct_answer as string,
        answer_tolerance: q.answer_tolerance as number | null,
        dataset_column: q.dataset_column as string | null,
        visualisation_ids: (q.visualisation_ids as string[] | null) ?? [],
        explanation: q.explanation as string | null,
        time_limit_secs: (q.time_limit_secs as number) ?? 30,
      })),
    };

    const datasets: DatasetOption[] = (rawDatasets ?? []).map((d: Record<string, unknown>) => ({
      id: d.id as string,
      name: d.name as string,
      schema: (d.schema as { columns: { name: string; type: string }[] }) ?? { columns: [] },
    }));

    const visualisations: VisualisationOption[] = (rawVisualisations ?? []).map((v: Record<string, unknown>) => ({
      id: v.id as string,
      name: v.name as string,
      chart_type: v.chart_type as string,
    }));

    return { props: { profile, quiz, datasets, visualisations, isOwner, collaborators, assignedToProfile } };
  },
  { allowedRoles: ['teacher'] }
);

// ── Constants ─────────────────────────────────────────────────────────────────
const NAV_ITEMS = TEACHER_NAV;

// ── Page ──────────────────────────────────────────────────────────────────────
export default function EditQuizPage({
  profile,
  quiz,
  datasets,
  visualisations,
  isOwner,
  collaborators,
  assignedToProfile,
}: Props) {
  const router = useRouter();
  const isAssigned = quiz.assigned_to === profile.id;

  const initialQuestions: QuestionDraft[] = quiz.questions.map((q) => ({
    _key: q.id,
    text: q.text,
    type: q.type,
    options: q.options ?? ['', ''],
    correct_answer: q.correct_answer,
    answer_tolerance: q.answer_tolerance != null ? String(q.answer_tolerance) : '',
    dataset_column: q.dataset_column ?? '',
    visualisation_ids: q.visualisation_ids ?? [],
    explanation: q.explanation ?? '',
    time_limit_secs: q.time_limit_secs,
  }));

  return (
    <DashboardLayout navItems={NAV_ITEMS} profile={profile}>
      <div className="max-w-3xl space-y-6">

        {/* Page header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-1"
        >
          <button
            onClick={() => router.push('/teacher/quizzes')}
            className="flex items-center gap-1.5 text-sm text-[#6a6a80] hover:text-violet-400 transition-colors"
          >
            <ArrowLeft className="size-3.5" /> Back to Quizzes
          </button>
          <h1 className="text-2xl font-bold text-white">Edit Quiz</h1>
          <p className="text-xs text-[#6a6a80]">Changes replace all questions atomically on save.</p>
        </motion.div>

        {/* Builder */}
        <QuizBuilder
          quizId={quiz.id}
          initialTitle={quiz.title}
          initialDescription={quiz.description ?? ''}
          initialDatasetId={quiz.dataset_id ?? ''}
          initialQuestions={initialQuestions}
          initialStatus={quiz.status}
          initialIsTimed={quiz.is_timed}
          datasets={datasets}
          visualisations={visualisations}
          saveLabel="Update"
        />

        {/* Collaborators panel */}
        <div id="collaborators" className="pt-2 scroll-mt-20">
          <CollaboratorsPanel
            quizId={quiz.id}
            currentUserId={profile.id}
            isOwner={isOwner}
            isAssigned={isAssigned}
            initialCollaborators={collaborators}
            initialAssignedTo={assignedToProfile}
            initialStatus={quiz.status}
          />
        </div>
      </div>
    </DashboardLayout>
  );
}
