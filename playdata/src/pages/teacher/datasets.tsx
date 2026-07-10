import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import {
  Database, FolderPlus, BarChart3,
  UploadCloud, HardDrive, Cloud, CloudDownload,
  CheckCircle2, AlertCircle,
} from 'lucide-react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { type NavItem } from '@/components/layout/Sidebar';
import { withAuth } from '@/lib/auth';
import { createClientFromContext } from '@/lib/supabase/server-props';
import { createAdminClient } from '@/lib/supabase/admin';

// ── Google / Dropbox SDK type shims ──────────────────────────────────────────
interface GPickerResponse { action: string; docs?: Array<{ id: string; name: string }> }
interface DBChooserFile { name: string; link: string; directLink?: string }
interface GPickerBuilderI {
  addView(v: unknown): GPickerBuilderI;
  setOAuthToken(t: string): GPickerBuilderI;
  setDeveloperKey(k: string): GPickerBuilderI;
  setCallback(cb: (d: GPickerResponse) => void): GPickerBuilderI;
  build(): { setVisible(v: boolean): void };
}
interface GDocsViewI {
  setMimeTypes(m: string): GDocsViewI;
  setParent(id: string): GDocsViewI;
}
declare global {
  interface Window {
    gapi?: { load: (lib: string, cb: () => void) => void };
    google?: {
      picker: {
        PickerBuilder: new () => GPickerBuilderI;
        DocsView: new () => GDocsViewI;
        Action: { PICKED: string; CANCEL: string };
      };
    };
    Dropbox?: {
      choose(opts: {
        success(files: DBChooserFile[]): void;
        cancel?(): void;
        linkType: 'direct' | 'preview';
        multiselect: boolean;
        extensions?: string[];
      }): void;
    };
  }
}
// ─────────────────────────────────────────────────────────────────────────────

interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: string;
  subject_taught: string | null;
  institution_role: string | null;
  created_at: string;
}

interface DatasetItem {
  id: string;
  name: string;
  row_count: number;
  provider: string | null;
  created_at: string;
}

interface Props {
  profile: Profile;
  googleConnected: boolean;
  dropboxConnected: boolean;
}

export const getServerSideProps = withAuth(
  async (context, userId): Promise<import('next').GetServerSidePropsResult<Props>> => {
    const supabase = createClientFromContext(context);
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, subject_taught, institution_role, created_at')
      .eq('id', userId)
      .single();

    if (!profile) return { redirect: { destination: '/auth/login', permanent: false } };

    const admin = createAdminClient();
    const { data: conns } = await admin
      .from('drive_connections')
      .select('provider, access_token, expires_at')
      .eq('teacher_id', userId);

    const googleConn = conns?.find((c) => c.provider === 'google_drive');
    const dropboxConn = conns?.find((c) => c.provider === 'dropbox');

    return {
      props: {
        profile,
        // Connected = has a token row; expiry is handled transparently via refresh in access-token.ts
        googleConnected: !!googleConn?.access_token,
        dropboxConnected: !!dropboxConn?.access_token,
      },
    };
  },
  { allowedRoles: ['teacher'] }
);

const NAV_ITEMS: NavItem[] = [
  { href: '/teacher/dashboard', label: 'Dashboard', icon: Database },
  { href: '/teacher/datasets', label: 'Datasets', icon: FolderPlus },
  { href: '/teacher/visualisations', label: 'Visualisations', icon: BarChart3 },
];

const CSV_MIME = 'text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';

export default function TeacherDatasets({ profile, googleConnected: initGoogle, dropboxConnected: initDropbox }: Props) {
  const router = useRouter();
  const [datasets, setDatasets] = useState<DatasetItem[]>([]);
  const [loadingDatasets, setLoadingDatasets] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(initGoogle);
  const [dropboxConnected, setDropboxConnected] = useState(initDropbox);
  const [importing, setImporting] = useState<'google' | 'dropbox' | null>(null);
  const [importMsg, setImportMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const pickerScriptLoaded = useRef(false);
  const dropboxScriptLoaded = useRef(false);

  useEffect(() => { fetchDatasets(); }, []);

  useEffect(() => {
    const { success, error } = router.query;
    if (success === 'google-connected') {
      setGoogleConnected(true);
      setImportMsg({ type: 'success', text: 'Google Drive connected! Click "Open Google Picker" to import a file.' });
    } else if (success === 'dropbox-connected') {
      setDropboxConnected(true);
      setImportMsg({ type: 'success', text: 'Dropbox connected! Click "Open Dropbox Chooser" to import a file.' });
    } else if (error) {
      setImportMsg({ type: 'error', text: `Error: ${error}` });
    }
  }, [router.query]);

  const fetchDatasets = async () => {
    setLoadingDatasets(true);
    const res = await fetch('/api/teacher/datasets');
    const data = await res.json();
    setDatasets(res.ok ? (data.datasets ?? []) : []);
    setLoadingDatasets(false);
  };

  // ── Google Picker ────────────────────────────────────────────────────────────
  const loadGapiScript = useCallback((): Promise<void> => {
    if (pickerScriptLoaded.current) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://apis.google.com/js/api.js';
      s.onload = () => { pickerScriptLoaded.current = true; resolve(); };
      s.onerror = () => reject(new Error('Failed to load Google API script'));
      document.head.appendChild(s);
    });
  }, []);

  const openGooglePicker = useCallback(async () => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY;
    if (!apiKey) {
      setImportMsg({ type: 'error', text: 'Google Picker API key not configured.' });
      return;
    }
    setImportMsg(null);
    setImporting('google');

    try {
      const tokenRes = await fetch('/api/teacher/drive/access-token?provider=google_drive');
      const tokenData = await tokenRes.json();

      if (!tokenRes.ok) {
        setImportMsg({ type: 'error', text: tokenData.error ?? 'Failed to retrieve access token — try again or reconnect.' });
        setImporting(null);
        return;
      }

      const { accessToken, externalFolderId } = tokenData as { accessToken: string; externalFolderId: string | null };

      await loadGapiScript();

      window.gapi!.load('picker', () => {
        setImporting(null);
        const view = new window.google!.picker.DocsView().setMimeTypes(CSV_MIME);
        if (externalFolderId) (view as { setParent(id: string): unknown }).setParent(externalFolderId);

        const picker = new window.google!.picker.PickerBuilder()
          .addView(view)
          .setOAuthToken(accessToken)
          .setDeveloperKey(apiKey)
          .setCallback((data: GPickerResponse) => {
            if (data.action === window.google!.picker.Action.PICKED && data.docs?.[0]) {
              const doc = data.docs[0];
              doImport({ provider: 'google_drive', fileId: doc.id, fileName: doc.name });
            }
          })
          .build();

        picker.setVisible(true);
      });
    } catch (err) {
      setImporting(null);
      setImportMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to open picker.' });
    }
  }, [loadGapiScript]);

  // ── Dropbox Chooser ──────────────────────────────────────────────────────────
  const loadDropboxScript = useCallback((): Promise<void> => {
    if (dropboxScriptLoaded.current || window.Dropbox) {
      dropboxScriptLoaded.current = true;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const appKey = process.env.NEXT_PUBLIC_DROPBOX_APP_KEY ?? '';
      if (!appKey) { reject(new Error('NEXT_PUBLIC_DROPBOX_APP_KEY not configured')); return; }
      const s = document.createElement('script');
      s.src = 'https://www.dropbox.com/static/api/2/dropins.js';
      s.setAttribute('id', 'dropboxjs');
      s.setAttribute('data-app-key', appKey);
      s.onload = () => { dropboxScriptLoaded.current = true; resolve(); };
      s.onerror = () => reject(new Error('Failed to load Dropbox SDK'));
      document.head.appendChild(s);
    });
  }, []);

  const openDropboxChooser = useCallback(async () => {
    if (!process.env.NEXT_PUBLIC_DROPBOX_APP_KEY) {
      setImportMsg({ type: 'error', text: 'Dropbox app key not configured.' });
      return;
    }
    setImportMsg(null);
    setImporting('dropbox');

    try {
      await loadDropboxScript();
      setImporting(null);

      window.Dropbox!.choose({
        linkType: 'direct',
        multiselect: false,
        extensions: ['.csv', '.xlsx', '.xls'],
        success(files) {
          const file = files[0];
          if (!file.directLink) {
            setImportMsg({ type: 'error', text: 'Dropbox did not return a direct link. Check your app settings.' });
            return;
          }
          doImport({ provider: 'dropbox', fileName: file.name, downloadUrl: file.directLink });
        },
        cancel() {},
      });
    } catch (err) {
      setImporting(null);
      setImportMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to open Dropbox chooser.' });
    }
  }, [loadDropboxScript]);

  // ── Shared import ────────────────────────────────────────────────────────────
  const doImport = useCallback(async (params: {
    provider: string;
    fileName: string;
    fileId?: string;
    downloadUrl?: string;
  }) => {
    setImporting(params.provider === 'google_drive' ? 'google' : 'dropbox');
    setImportMsg(null);

    const res = await fetch('/api/teacher/drive/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    setImporting(null);

    if (!res.ok) {
      setImportMsg({ type: 'error', text: data.error ?? 'Import failed — try again.' });
      return;
    }

    setImportMsg({ type: 'success', text: `"${data.dataset.name}" imported — ${data.dataset.row_count.toLocaleString()} rows.` });
    await fetchDatasets();
  }, []);

  return (
    <DashboardLayout navItems={NAV_ITEMS} profile={profile}>
      <div className="max-w-5xl space-y-8">

        {/* Dataset list */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-[#35354a]/60 bg-[#11111f]/80 p-8"
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-[#6a6a80]">Datasets</p>
              <h1 className="mt-3 text-3xl font-bold text-white">My Datasets</h1>
            </div>
          </div>

          {loadingDatasets ? (
            <p className="text-sm text-[#8d8da0]">Loading datasets…</p>
          ) : datasets.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#35354a]/40 bg-[#0f0f1d]/90 p-8 text-center">
              <Database className="mx-auto size-8 text-[#35354a] mb-3" />
              <p className="text-sm text-[#6a6a80]">No datasets yet. Import one below.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {datasets.map((ds) => (
                <Link
                  key={ds.id}
                  href={`/teacher/datasets/${ds.id}`}
                  className="flex items-center justify-between rounded-2xl border border-[#35354a]/40 bg-[#0f0f1d]/90 px-4 py-3 transition hover:border-violet-500/30"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-white truncate">{ds.name}</p>
                    <p className="text-xs text-[#6a6a80]">
                      {ds.provider === 'google_drive' ? 'Google Drive' : ds.provider === 'dropbox' ? 'Dropbox' : 'Desktop upload'}
                      {' · '}{new Date(ds.created_at).toLocaleDateString('en-GB')}
                    </p>
                  </div>
                  <span className="ml-4 shrink-0 text-xs text-[#6a6a80]">
                    {ds.row_count.toLocaleString()} rows
                  </span>
                </Link>
              ))}
            </div>
          )}
        </motion.div>

        {/* Import options */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}
          className="rounded-3xl border border-[#35354a]/60 bg-[#11111f]/80 p-8"
        >
          <p className="text-sm font-semibold uppercase tracking-widest text-[#6a6a80] mb-1">Import</p>
          <h2 className="text-xl font-bold text-white mb-6">Add a dataset</h2>

          {importMsg && (
            <div className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${
              importMsg.type === 'success'
                ? 'border-emerald-500/30 bg-emerald-600/10 text-emerald-300'
                : 'border-red-500/30 bg-red-600/10 text-red-300'
            }`}>
              {importMsg.text}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">

            {/* Desktop upload */}
            <Link
              href="/teacher/datasets/new"
              className="group flex flex-col gap-3 rounded-2xl border border-[#35354a]/60 bg-[#0f0f1d]/90 p-5 transition hover:border-violet-500/40"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 ring-1 ring-violet-500/20">
                <HardDrive className="size-5 text-violet-400" />
              </span>
              <div>
                <p className="text-sm font-semibold text-white">Upload from desktop</p>
                <p className="mt-0.5 text-xs text-[#6a6a80]">CSV or XLSX up to 50 MB</p>
              </div>
            </Link>

            {/* Google Drive */}
            <div className="flex flex-col gap-3 rounded-2xl border border-[#35354a]/60 bg-[#0f0f1d]/90 p-5 transition hover:border-blue-500/40">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 ring-1 ring-blue-500/20">
                <Cloud className="size-5 text-blue-400" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-white">Google Drive</p>
                <p className="mt-0.5 text-xs text-[#6a6a80]">
                  {googleConnected ? (
                    <span className="inline-flex items-center gap-1 text-emerald-400">
                      <CheckCircle2 className="size-3" /> Connected
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[#6a6a80]">
                      <AlertCircle className="size-3" /> Not connected
                    </span>
                  )}
                </p>
              </div>
              {googleConnected ? (
                <button
                  onClick={openGooglePicker}
                  disabled={importing !== null}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <CloudDownload className="size-3.5" />
                  {importing === 'google' ? 'Working…' : 'Open Picker'}
                </button>
              ) : (
                <a
                  href="/api/teacher/drive/connect"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#35354a] px-3 py-2 text-xs font-semibold text-[#c9c9d4] transition hover:border-blue-500/50 hover:text-white"
                >
                  Connect Google Drive
                </a>
              )}
            </div>

            {/* Dropbox */}
            <div className="flex flex-col gap-3 rounded-2xl border border-[#35354a]/60 bg-[#0f0f1d]/90 p-5 transition hover:border-sky-500/40">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 ring-1 ring-sky-500/20">
                <UploadCloud className="size-5 text-sky-400" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-white">Dropbox</p>
                <p className="mt-0.5 text-xs text-[#6a6a80]">
                  {dropboxConnected ? (
                    <span className="inline-flex items-center gap-1 text-emerald-400">
                      <CheckCircle2 className="size-3" /> Connected
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[#6a6a80]">
                      <AlertCircle className="size-3" /> Not connected
                    </span>
                  )}
                </p>
              </div>
              {dropboxConnected ? (
                <button
                  onClick={openDropboxChooser}
                  disabled={importing !== null}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-sky-500 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <CloudDownload className="size-3.5" />
                  {importing === 'dropbox' ? 'Working…' : 'Open Chooser'}
                </button>
              ) : (
                <a
                  href="/api/teacher/drive/dropbox-connect"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#35354a] px-3 py-2 text-xs font-semibold text-[#c9c9d4] transition hover:border-sky-500/50 hover:text-white"
                >
                  Connect Dropbox
                </a>
              )}
            </div>

          </div>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
