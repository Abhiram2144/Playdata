import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import { ArrowLeft, Database, FolderPlus, BarChart3, BookOpen } from 'lucide-react';
import { GetServerSidePropsResult } from 'next';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { type NavItem } from '@/components/layout/Sidebar';
import { TEACHER_NAV } from '@/lib/teacher-nav';
import { withAuth } from '@/lib/auth';
import { createClientFromContext } from '@/lib/supabase/server-props';
import { createAdminClient } from '@/lib/supabase/admin';
import QuizBuilder, { type DatasetOption, type VisualisationOption } from '@/components/quiz/QuizBuilder';

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

interface Props {
  profile: Profile;
  datasets: DatasetOption[];
  visualisations: VisualisationOption[];
  prefilledDatasetId: string | null;
  /** 'dataset' | 'visualisation' | null — for the "prefilled from" label */
  prefilledFrom: string | null;
}

// ── Server-side ───────────────────────────────────────────────────────────────
export const getServerSideProps = withAuth(
  async (context, userId): Promise<GetServerSidePropsResult<Props>> => {
    const supabase = createClientFromContext(context);
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, subject_taught, institution_role, created_at')
      .eq('id', userId)
      .single();

    if (!profile) return { redirect: { destination: '/auth/login', permanent: false } };

    const admin = createAdminClient();

    // Fetch all teacher's datasets (for selector + column list)
    const [{ data: rawDatasets }, { data: rawVisualisations }] = await Promise.all([
      admin.from('datasets').select('id, name, schema').eq('teacher_id', userId).order('name'),
      admin.from('visualisations').select('id, name, chart_type').eq('teacher_id', userId).order('name'),
    ]);

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

    const { dataset: dsParam, visualisation: visParam } = context.query;
    let prefilledDatasetId: string | null = null;
    let prefilledFrom: string | null = null;

    if (dsParam && typeof dsParam === 'string') {
      if (datasets.some((d) => d.id === dsParam)) {
        prefilledDatasetId = dsParam;
        prefilledFrom = 'dataset';
      }
    } else if (visParam && typeof visParam === 'string') {
      const { data: vis } = await admin
        .from('visualisations')
        .select('dataset_id')
        .eq('id', visParam)
        .eq('teacher_id', userId)
        .single();
      if (vis?.dataset_id && datasets.some((d) => d.id === vis.dataset_id)) {
        prefilledDatasetId = vis.dataset_id as string;
        prefilledFrom = 'visualisation';
      }
    }

    return { props: { profile, datasets, visualisations, prefilledDatasetId, prefilledFrom } };
  },
  { allowedRoles: ['teacher'] }
);

// ── Constants ─────────────────────────────────────────────────────────────────
const NAV_ITEMS = TEACHER_NAV;

// ── Page ──────────────────────────────────────────────────────────────────────
export default function NewQuizPage({ profile, datasets, visualisations, prefilledDatasetId, prefilledFrom }: Props) {
  const router = useRouter();

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
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-violet-600 transition-colors"
          >
            <ArrowLeft className="size-3.5" /> Back to Quizzes
          </button>
          <h1 className="text-2xl font-bold text-gray-900">New Quiz</h1>
          {prefilledFrom && prefilledDatasetId && (
            <p className="text-xs text-gray-400">
              Pre-linked from {prefilledFrom}
              {' '}·{' '}
              <button
                onClick={() => router.replace('/teacher/quizzes/new')}
                className="text-violet-600 hover:text-violet-700 transition"
              >
                remove link
              </button>
            </p>
          )}
        </motion.div>

        {/* Builder */}
        <QuizBuilder
          datasets={datasets}
          visualisations={visualisations}
          initialDatasetId={prefilledDatasetId ?? ''}
          saveLabel="Save"
        />
      </div>
    </DashboardLayout>
  );
}
