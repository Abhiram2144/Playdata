import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { GetServerSideProps } from 'next';
import { motion } from 'framer-motion';
import { Database, FolderPlus, Link as LinkIcon } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { type NavItem } from '@/components/layout/Sidebar';
import { withAuth } from '@/lib/auth';
import { createClientFromContext } from '@/lib/supabase/server-props';

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
}

interface DriveFile {
  id: string;
  name: string;
  mime_type?: string;
}

interface DatasetItem {
  id: string;
  name: string;
  source_url?: string;
}

export const getServerSideProps = withAuth(
  async (context, userId): Promise<import('next').GetServerSidePropsResult<Props>> => {
    const supabase = createClientFromContext(context);
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, subject_taught, institution_role, created_at')
      .eq('id', userId)
      .single();

    if (!profile) {
      return { redirect: { destination: '/auth/login', permanent: false } };
    }

    return { props: { profile } };
  },
  { allowedRoles: ['teacher'] }
);

const NAV_ITEMS: NavItem[] = [
  { href: '/teacher/dashboard', label: 'Dashboard', icon: Database },
  { href: '/teacher/datasets', label: 'Datasets', icon: FolderPlus },
  { href: '/teacher/visualisations', label: 'Visualisations', icon: LinkIcon, disabled: true },
];

export default function TeacherDatasets({ profile }: Props) {
  const router = useRouter();
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [datasets, setDatasets] = useState<DatasetItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingDatasets, setLoadingDatasets] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchDriveFiles();
    fetchDatasets();
  }, []);

  useEffect(() => {
    const { success, error } = router.query;
    if (success === 'google-connected') {
      setMessage({ type: 'success', text: 'Google Drive connected successfully!' });
    } else if (error) {
      setMessage({ type: 'error', text: `Error: ${error}` });
    }
  }, [router.query]);

  const fetchDriveFiles = async () => {
    setLoadingFiles(true);
    const res = await fetch('/api/teacher/drive/files');
    const data = await res.json();

    if (!res.ok) {
      setDriveFiles([]);
    } else {
      setDriveFiles(data?.files ?? []);
    }

    setLoadingFiles(false);
  };

  const fetchDatasets = async () => {
    setLoadingDatasets(true);
    const res = await fetch('/api/teacher/datasets');
    const data = await res.json();

    if (!res.ok) {
      setDatasets([]);
    } else {
      setDatasets(data?.datasets ?? []);
    }

    setLoadingDatasets(false);
  };

  const handleConnect = () => {
    setConnecting(true);
    setMessage(null);
    if (typeof window !== 'undefined') {
      window.location.assign('/api/teacher/drive/connect');
    }
  };

  return (
    <DashboardLayout navItems={NAV_ITEMS} profile={profile}>
      <div className="max-w-5xl space-y-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-[#35354a]/60 bg-[#11111f]/80 p-8"
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-[#6a6a80]">Datasets</p>
              <h1 className="mt-3 text-3xl font-bold text-white">Google Drive integration</h1>
              <p className="mt-2 text-sm text-[#8d8da0]">
                This page is scaffolded for teacher-driven dataset import and Google Drive connection management.
              </p>
            </div>
            <button
              type="button"
              onClick={handleConnect}
              disabled={connecting}
              className="inline-flex items-center justify-center rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-violet-500/50"
            >
              {connecting ? 'Redirecting…' : 'Connect Google Drive'}
            </button>
          </div>

          {message ? (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm ${
                message.type === 'success'
                  ? 'border-emerald-500/30 bg-emerald-600/10 text-emerald-300'
                  : 'border-red-500/30 bg-red-600/10 text-red-300'
              }`}
            >
              {message.text}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 mt-6">
            <div className="rounded-3xl border border-[#35354a]/60 bg-[#151526]/80 p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-[#c9c9d4]">Drive connections</p>
                  <p className="mt-2 text-sm text-[#8d8da0]">Manage drive files ready for dataset import.</p>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                {loadingFiles ? (
                  <p className="text-sm text-[#8d8da0]">Loading drive files…</p>
                ) : driveFiles.length > 0 ? (
                  driveFiles.map((file) => (
                    <div key={file.id} className="rounded-2xl border border-[#35354a]/40 bg-[#0f0f1d]/90 p-4">
                      <p className="font-medium text-white">{file.name}</p>
                      <p className="text-xs text-[#6a6a80]">{file.mime_type ?? 'Google Drive file'}</p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-[#35354a]/40 bg-[#0f0f1d]/90 p-4 text-sm text-[#6a6a80]">
                    No Google Drive files available yet.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-[#35354a]/60 bg-[#151526]/80 p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-[#c9c9d4]">Dataset import</p>
                  <p className="mt-2 text-sm text-[#8d8da0]">View imported datasets and source details.</p>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                {loadingDatasets ? (
                  <p className="text-sm text-[#8d8da0]">Loading datasets…</p>
                ) : datasets.length > 0 ? (
                  datasets.map((dataset) => (
                    <div key={dataset.id} className="rounded-2xl border border-[#35354a]/40 bg-[#0f0f1d]/90 p-4">
                      <p className="font-medium text-white">{dataset.name}</p>
                      <p className="text-xs text-[#6a6a80]">{dataset.source_url ?? 'Drive source'}</p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-[#35354a]/40 bg-[#0f0f1d]/90 p-4 text-sm text-[#6a6a80]">
                    No imported datasets available yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
