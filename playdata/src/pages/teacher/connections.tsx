import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import { Database, FolderPlus, BarChart3, Cable, CheckCircle2, Clock, AlertCircle, Plus, X } from 'lucide-react';
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

interface Props { profile: Profile }

interface Connection {
  id: string;
  name: string;
  provider: 'google_drive' | 'dropbox';
  is_approved: boolean;
  approved_at: string | null;
  external_folder_id: string | null;
  created_at: string;
  has_token: boolean;
  token_expired: boolean;
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
    return { props: { profile } };
  },
  { allowedRoles: ['teacher'] }
);

const NAV_ITEMS: NavItem[] = [
  { href: '/teacher/dashboard', label: 'Dashboard', icon: Database },
  { href: '/teacher/datasets', label: 'Datasets', icon: FolderPlus },
  { href: '/teacher/connections', label: 'Connections', icon: Cable },
  { href: '/teacher/visualisations', label: 'Visualisations', icon: BarChart3 },
];

const PROVIDER_LABELS: Record<string, string> = {
  google_drive: 'Google Drive',
  dropbox: 'Dropbox',
};

function StatusBadge({ conn }: { conn: Connection }) {
  if (!conn.is_approved) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-400 ring-1 ring-inset ring-amber-500/20">
        <Clock className="size-3" /> Pending approval
      </span>
    );
  }
  if (!conn.has_token) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-semibold text-blue-400 ring-1 ring-inset ring-blue-500/20">
        <AlertCircle className="size-3" /> Approved — not connected
      </span>
    );
  }
  if (conn.token_expired) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-400 ring-1 ring-inset ring-red-500/20">
        <AlertCircle className="size-3" /> Token expired
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
      <CheckCircle2 className="size-3" /> Connected
    </span>
  );
}

export default function TeacherConnections({ profile }: Props) {
  const router = useRouter();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formProvider, setFormProvider] = useState<'google_drive' | 'dropbox'>('google_drive');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchConnections();
  }, []);

  useEffect(() => {
    const { success, error } = router.query;
    if (success === 'google-connected') {
      setMessage({ type: 'success', text: 'Google Drive connected successfully!' });
    } else if (success === 'dropbox-connected') {
      setMessage({ type: 'success', text: 'Dropbox connected successfully!' });
    } else if (error) {
      setMessage({ type: 'error', text: `Error: ${error}` });
    }
  }, [router.query]);

  const fetchConnections = async () => {
    setLoading(true);
    const res = await fetch('/api/teacher/connections');
    const data = await res.json();
    setConnections(res.ok ? (data.connections ?? []) : []);
    setLoading(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;
    setSubmitting(true);
    setMessage(null);

    const res = await fetch('/api/teacher/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: formName.trim(), provider: formProvider }),
    });

    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setMessage({ type: 'error', text: data.error ?? 'Failed to create connection' });
      return;
    }

    setMessage({ type: 'success', text: 'Connection request submitted. Awaiting admin approval.' });
    setFormName('');
    setShowForm(false);
    await fetchConnections();
  };

  const handleConnect = (conn: Connection) => {
    if (conn.provider === 'google_drive') {
      window.location.assign(`/api/teacher/drive/connect?connectionId=${conn.id}`);
    } else {
      window.location.assign(`/api/teacher/drive/dropbox-connect?connectionId=${conn.id}`);
    }
  };

  return (
    <DashboardLayout navItems={NAV_ITEMS} profile={profile}>
      <div className="max-w-3xl space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-[#35354a]/60 bg-[#11111f]/80 p-8"
        >
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-[#6a6a80]">Drive connections</p>
              <h1 className="mt-3 text-3xl font-bold text-white">Connections</h1>
              <p className="mt-2 text-sm text-[#8d8da0]">
                Request a cloud storage connection. Once approved by an admin, connect via OAuth to import datasets.
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setShowForm((s) => !s); setMessage(null); }}
              className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500"
            >
              {showForm ? <X className="size-4" /> : <Plus className="size-4" />}
              {showForm ? 'Cancel' : 'New connection'}
            </button>
          </div>

          {message ? (
            <div className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${
              message.type === 'success'
                ? 'border-emerald-500/30 bg-emerald-600/10 text-emerald-300'
                : 'border-red-500/30 bg-red-600/10 text-red-300'
            }`}>
              {message.text}
            </div>
          ) : null}

          {showForm && (
            <motion.form
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              onSubmit={handleCreate}
              className="mb-6 rounded-2xl border border-[#35354a]/60 bg-[#151526]/80 p-5 space-y-4"
            >
              <p className="text-sm font-semibold text-[#c9c9d4]">Request a new connection</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[#8d8da0]">Connection name</label>
                  <input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Year 10 Science Drive"
                    required
                    className="w-full rounded-xl border border-[#35354a] bg-[#0f0f1d] px-3 py-2 text-sm text-white placeholder-[#4a4a60] focus:border-violet-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[#8d8da0]">Provider</label>
                  <select
                    value={formProvider}
                    onChange={(e) => setFormProvider(e.target.value as 'google_drive' | 'dropbox')}
                    className="w-full rounded-xl border border-[#35354a] bg-[#0f0f1d] px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                  >
                    <option value="google_drive">Google Drive</option>
                    <option value="dropbox">Dropbox</option>
                  </select>
                </div>
              </div>
              <button
                type="submit"
                disabled={submitting || !formName.trim()}
                className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-violet-500/50"
              >
                {submitting ? 'Submitting…' : 'Submit request'}
              </button>
            </motion.form>
          )}

          {loading ? (
            <p className="text-sm text-[#8d8da0]">Loading connections…</p>
          ) : connections.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#35354a]/40 bg-[#0f0f1d]/90 p-8 text-center">
              <Cable className="mx-auto size-8 text-[#35354a] mb-3" />
              <p className="text-sm text-[#6a6a80]">No connections yet. Request one above.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {connections.map((conn) => (
                <div
                  key={conn.id}
                  className="rounded-2xl border border-[#35354a]/40 bg-[#0f0f1d]/90 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-white truncate">{conn.name}</p>
                      <p className="text-xs text-[#6a6a80] mt-0.5">
                        {PROVIDER_LABELS[conn.provider] ?? conn.provider}
                        {' · '}Requested {new Date(conn.created_at).toLocaleDateString('en-GB')}
                      </p>
                    </div>
                    <StatusBadge conn={conn} />
                  </div>

                  {/* Action row */}
                  {conn.is_approved && (!conn.has_token || conn.token_expired) && (
                    <div className="mt-3 flex items-center gap-2">
                      {conn.token_expired && (
                        <p className="text-xs text-red-400 mr-2">Your OAuth token expired.</p>
                      )}
                      <button
                        type="button"
                        onClick={() => handleConnect(conn)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600/20 border border-violet-500/30 px-3 py-1.5 text-xs font-semibold text-violet-300 transition hover:bg-violet-600/30"
                      >
                        {conn.token_expired ? 'Reconnect' : 'Connect via OAuth'}
                      </button>
                    </div>
                  )}

                  {conn.is_approved && conn.has_token && !conn.token_expired && conn.external_folder_id && (
                    <p className="mt-2 text-xs text-[#4a4a60]">
                      Folder: <span className="text-[#6a6a80] font-mono">{conn.external_folder_id}</span>
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </motion.div>

        <div className="rounded-2xl border border-[#35354a]/30 bg-[#0d0d18]/60 px-5 py-4 text-xs text-[#4a4a60]">
          <strong className="text-[#6a6a80]">How it works:</strong>{' '}
          Submit a connection request → an admin approves it and optionally pins a folder →
          you complete OAuth here → then import files from the Datasets page.
        </div>
      </div>
    </DashboardLayout>
  );
}
