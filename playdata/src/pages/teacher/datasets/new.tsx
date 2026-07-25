import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UploadCloud, FileSpreadsheet, X, CheckCircle2, AlertCircle,
  Database, FolderPlus, BarChart3, Loader2,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { type NavItem } from '@/components/layout/Sidebar';
import { TEACHER_NAV } from '@/lib/teacher-nav';
import { withAuth } from '@/lib/auth';
import { createClientFromContext } from '@/lib/supabase/server-props';

interface Profile { id: string; full_name: string; email: string; role: string; subject_taught: string | null; institution_role: string | null; created_at: string; }
interface Props { profile: Profile }

export const getServerSideProps = withAuth(
  async (context, userId) => {
    const supabase = createClientFromContext(context);
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, subject_taught, institution_role, created_at')
      .eq('id', userId)
      .single();
    if (!profile) return { redirect: { destination: '/auth/login', permanent: false } };
    return { props: { profile } };
  },
  { allowedRoles: ['teacher'] }
);

const NAV_ITEMS = TEACHER_NAV;

type UploadState = 'idle' | 'uploading' | 'processing' | 'success' | 'error';

const ACCEPTED = '.csv,.xlsx,.xls';
const ACCEPTED_MIME = new Set([
  'text/csv',
  'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function NewDataset({ profile }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [state, setState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  const setFileIfValid = (f: File) => {
    if (!ACCEPTED_MIME.has(f.type) && !f.name.match(/\.(csv|xlsx|xls)$/i)) {
      setErrorMsg('Only .csv and .xlsx files are supported.');
      setState('error');
      return;
    }
    if (f.size > 50 * 1024 * 1024) {
      setErrorMsg('File exceeds the 50 MB limit.');
      setState('error');
      return;
    }
    setFile(f);
    setState('idle');
    setErrorMsg('');
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) setFileIfValid(f);
  }, []);

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFileIfValid(f);
    e.target.value = '';
  };

  const clearFile = () => { setFile(null); setState('idle'); setErrorMsg(''); };

  const upload = () => {
    if (!file) return;
    setState('uploading');
    setProgress(0);
    setErrorMsg('');

    const body = new FormData();
    body.append('file', file);

    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = () => {
      if (xhr.status === 201) {
        setState('success');
        const json = JSON.parse(xhr.responseText) as { dataset: { id: string } };
        setTimeout(() => router.push(`/teacher/datasets/${json.dataset.id}`), 800);
      } else {
        let msg = 'Upload failed.';
        try { msg = (JSON.parse(xhr.responseText) as { error?: string }).error ?? msg; } catch { /* */ }
        setErrorMsg(msg);
        setState('error');
      }
    };

    xhr.onerror = () => { setErrorMsg('Network error — please try again.'); setState('error'); };

    // Once bytes land on the server, flip to "processing" until response comes back
    xhr.upload.onloadend = () => { setState('processing'); };

    xhr.open('POST', '/api/teacher/datasets/upload');
    xhr.send(body);
  };

  return (
    <DashboardLayout navItems={NAV_ITEMS} profile={profile}>
      <div className="max-w-2xl">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/teacher/datasets')}
            className="mb-4 text-sm text-gray-400 hover:text-violet-600 transition-colors"
          >
            ← Back to Datasets
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Upload Dataset</h1>
          <p className="mt-1 text-sm text-gray-500">
            Upload a .csv or .xlsx file. Columns and types are detected automatically.
          </p>
        </div>

        {/* Drop zone */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className={`relative rounded-2xl border-2 border-dashed transition-colors duration-200 ${
            dragging
              ? 'border-violet-400 bg-violet-50'
              : file
              ? 'border-gray-200 bg-white'
              : 'border-gray-200 bg-gray-50 hover:border-violet-300 hover:bg-white'
          }`}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
        >
          <AnimatePresence mode="wait">
            {!file ? (
              /* Empty state */
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center gap-4 px-8 py-16 text-center"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-100 ring-1 ring-violet-200">
                  <UploadCloud className="size-8 text-violet-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-800">Drop your file here</p>
                  <p className="mt-1 text-sm text-gray-400">or click to browse</p>
                  <p className="mt-2 text-xs text-gray-400">.csv or .xlsx — max 50 MB</p>
                </div>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="mt-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 transition-colors"
                >
                  Choose file
                </button>
              </motion.div>
            ) : (
              /* File selected */
              <motion.div
                key="file"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-4 px-6 py-5"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-100 ring-1 ring-violet-200">
                  <FileSpreadsheet className="size-6 text-violet-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-gray-900">{file.name}</p>
                  <p className="text-xs text-gray-400">{formatBytes(file.size)}</p>
                </div>
                {state === 'idle' && (
                  <button
                    onClick={clearFile}
                    className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            className="hidden"
            onChange={onFileChange}
          />
        </motion.div>

        {/* Progress / status */}
        <AnimatePresence>
          {(state === 'uploading' || state === 'processing') && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3"
            >
              {state === 'uploading' ? (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">Uploading…</span>
                    <span className="text-violet-600 font-semibold">{progress}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-violet-500"
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.15 }}
                    />
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <Loader2 className="size-4 text-violet-600 animate-spin shrink-0" />
                  Analysing columns and types…
                </div>
              )}
            </motion.div>
          )}

          {state === 'success' && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
            >
              <CheckCircle2 className="size-4 shrink-0" />
              Dataset uploaded — redirecting to preview…
            </motion.div>
          )}

          {state === 'error' && errorMsg && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              {errorMsg}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Upload button */}
        {file && (state === 'idle' || state === 'error') && (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={upload}
            className="mt-4 w-full rounded-xl bg-violet-600 py-3 text-sm font-semibold text-white hover:bg-violet-500 transition-colors"
          >
            Upload & analyse
          </motion.button>
        )}
      </div>
    </DashboardLayout>
  );
}
