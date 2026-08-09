import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Cable, CheckCircle2, Clock, AlertCircle,
  Plus, X, LogOut, Loader2,
} from 'lucide-react';

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

const PROVIDER_LABELS: Record<string, string> = {
  google_drive: 'Google Drive',
  dropbox: 'Dropbox',
};

function StatusBadge({ conn }: { conn: Connection }) {
  if (!conn.is_approved) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
        <Clock className="size-3" /> Pending approval
      </span>
    );
  }
  if (!conn.has_token) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-200">
        <AlertCircle className="size-3" /> Approved — not connected
      </span>
    );
  }
  if (conn.token_expired) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-200">
        <AlertCircle className="size-3" /> Token expired
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
      <CheckCircle2 className="size-3" /> Connected
    </span>
  );
}

export function ConnectionsSection() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formProvider, setFormProvider] = useState<'google_drive' | 'dropbox'>('google_drive');
  const [submitting, setSubmitting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  useEffect(() => { void fetchConnections(); }, []);

  async function fetchConnections() {
    setLoading(true);
    const res = await fetch('/api/teacher/connections');
    const data = await res.json();
    setConnections(res.ok ? (data.connections ?? []) : []);
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
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
    if (!res.ok) { setMessage({ type: 'error', text: data.error ?? 'Failed to create connection' }); return; }
    setMessage({ type: 'success', text: 'Connection request submitted. Awaiting admin approval.' });
    setFormName('');
    setShowForm(false);
    await fetchConnections();
  }

  function handleConnect(conn: Connection) {
    if (conn.provider === 'google_drive') {
      window.location.assign(`/api/teacher/drive/connect?connectionId=${conn.id}`);
    } else {
      window.location.assign(`/api/teacher/drive/dropbox-connect?connectionId=${conn.id}`);
    }
  }

  async function handleDisconnect(connId: string) {
    setDisconnecting(connId);
    setMessage(null);
    const res = await fetch(`/api/teacher/connections/${connId}/disconnect`, { method: 'DELETE' });
    const data = await res.json();
    setDisconnecting(null);
    setConfirmDisconnect(null);
    if (!res.ok) { setMessage({ type: 'error', text: data.error ?? 'Failed to disconnect' }); return; }
    setMessage({ type: 'success', text: 'Account disconnected. You can reconnect anytime.' });
    await fetchConnections();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">Drive connections</h2>
          <p className="mt-1 text-xs text-gray-500">
            Request a cloud storage connection — once approved, connect via OAuth to import datasets.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setShowForm((s) => !s); setMessage(null); }}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-violet-500"
        >
          {showForm ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
          {showForm ? 'Cancel' : 'New connection'}
        </button>
      </div>

      {message && (
        <div className={`rounded-xl border px-4 py-3 text-xs ${
          message.type === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          {message.text}
        </div>
      )}

      <AnimatePresence>
        {showForm && (
          <motion.form
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            onSubmit={handleCreate}
            className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3"
          >
            <p className="text-xs font-semibold text-gray-700">Request a new connection</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-500">Connection name</label>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Year 10 Science Drive"
                  required
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-violet-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-500">Provider</label>
                <select
                  value={formProvider}
                  onChange={(e) => setFormProvider(e.target.value as 'google_drive' | 'dropbox')}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-violet-400 focus:outline-none"
                >
                  <option value="google_drive">Google Drive</option>
                  <option value="dropbox">Dropbox</option>
                </select>
              </div>
            </div>
            <button
              type="submit"
              disabled={submitting || !formName.trim()}
              className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit request'}
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      {loading ? (
        <p className="text-xs text-gray-400">Loading connections…</p>
      ) : connections.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 py-8 text-center">
          <Cable className="mx-auto size-7 text-gray-300 mb-2" />
          <p className="text-xs text-gray-400">No connections yet. Request one above.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm divide-y divide-gray-100">
          {connections.map((conn) => (
            <div key={conn.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{conn.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {PROVIDER_LABELS[conn.provider] ?? conn.provider}
                    {' · '}Requested {new Date(conn.created_at).toLocaleDateString('en-GB')}
                  </p>
                </div>
                <StatusBadge conn={conn} />
              </div>

              {conn.is_approved && conn.has_token && !conn.token_expired && conn.external_folder_id && (
                <p className="mt-2 text-xs text-gray-400">
                  Folder: <span className="font-mono text-gray-600">{conn.external_folder_id}</span>
                </p>
              )}

              {conn.is_approved && (
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  {(!conn.has_token || conn.token_expired) && (
                    <>
                      {conn.token_expired && <p className="text-xs text-red-600">Your OAuth token expired.</p>}
                      <button
                        type="button"
                        onClick={() => handleConnect(conn)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-violet-50 border border-violet-200 px-3 py-1.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-100"
                      >
                        {conn.token_expired ? 'Reconnect' : 'Connect via OAuth'}
                      </button>
                    </>
                  )}
                  {conn.has_token && !conn.token_expired && (
                    <>
                      {confirmDisconnect === conn.id ? (
                        <AnimatePresence>
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5"
                          >
                            <span className="text-xs text-red-700 font-medium">Disconnect this account?</span>
                            <button
                              type="button"
                              onClick={() => handleDisconnect(conn.id)}
                              disabled={disconnecting === conn.id}
                              className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-red-500 disabled:opacity-60"
                            >
                              {disconnecting === conn.id ? <Loader2 className="size-3 animate-spin" /> : <LogOut className="size-3" />}
                              Yes, disconnect
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDisconnect(null)}
                              className="rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50"
                            >
                              Cancel
                            </button>
                          </motion.div>
                        </AnimatePresence>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setConfirmDisconnect(conn.id); setMessage(null); }}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-500 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600"
                        >
                          <LogOut className="size-3" /> Disconnect
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleConnect(conn)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-500 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
                      >
                        Switch account
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-gray-400 leading-relaxed">
        <strong className="text-gray-500">How it works:</strong>{' '}
        Submit a request → admin approves → complete OAuth → import files from the Datasets page.
      </p>
    </div>
  );
}
