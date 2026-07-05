import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import {
  Users,
  Search,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  UserPlus,
} from 'lucide-react';
import { Sidebar, Navbar, LoadingState, AddTeacherModal } from '@/components/admin';
import { useAdmin } from '@/contexts/AdminContext';
import { toast } from 'sonner';

interface Teacher {
  id: string;
  full_name: string;
  email: string;
  username?: string;
  is_active?: boolean;
  created_at: string;
  session_count: number;
}

type SortKey = 'full_name' | 'email' | 'session_count' | 'created_at';

export default function AdminTeachers() {
  const router = useRouter();
  const { isAuthenticated, onboardingCompleted, isLoading } = useAdmin();

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [fetching, setFetching] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortAsc, setSortAsc] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/admin/login');
    else if (!isLoading && isAuthenticated && !onboardingCompleted) router.replace('/admin/onboarding');
  }, [isAuthenticated, isLoading, onboardingCompleted, router]);

  const fetchTeachers = useCallback(async () => {
    setFetching(true);
    try {
      const res = await fetch('/api/admin/users?role=teacher');
      const json = await res.json() as { users?: Teacher[]; error?: string };
      if (json.error) { toast.error(json.error); return; }
      setTeachers(json.users ?? []);
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && onboardingCompleted) fetchTeachers();
  }, [isAuthenticated, onboardingCompleted, fetchTeachers]);

  const toggleActive = async (teacher: Teacher) => {
    setUpdating(teacher.id);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: teacher.id, is_active: !teacher.is_active }),
      });
      const json = await res.json() as { success?: boolean; error?: string };
      if (json.error) { toast.error(json.error); return; }
      setTeachers((prev) =>
        prev.map((t) => t.id === teacher.id ? { ...t, is_active: !t.is_active } : t)
      );
      toast.success(`${teacher.full_name || teacher.email} ${!teacher.is_active ? 'activated' : 'deactivated'}`);
    } finally {
      setUpdating(null);
    }
  };

  if (isLoading || !isAuthenticated || !onboardingCompleted) {
    return <LoadingState text="Loading…" fullPage />;
  }

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((a) => !a);
    else { setSortKey(key); setSortAsc(true); }
  };

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k
      ? sortAsc ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
      : null;

  const filtered = teachers
    .filter((t) => {
      const q = search.toLowerCase();
      const username = (t.username ?? t.email.split('@')[0].toLowerCase());
      return (
        t.full_name.toLowerCase().includes(q) ||
        t.email.toLowerCase().includes(q) ||
        username.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'session_count') cmp = a.session_count - b.session_count;
      else cmp = String(a[sortKey]).localeCompare(String(b[sortKey]));
      return sortAsc ? cmp : -cmp;
    });

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      <Navbar />
      <main className="ml-64 mt-16 p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 flex items-center justify-between"
          >
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Teachers</h1>
              <p className="text-slate-600 mt-1">{teachers.length} teacher{teachers.length !== 1 ? 's' : ''} registered</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={fetchTeachers}
                disabled={fetching}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-all font-medium disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${fetching ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={() => setAddModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all font-medium"
              >
                <UserPlus className="w-4 h-4" />
                Add Teacher
              </button>
            </div>
          </motion.div>

          {/* Summary cards */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-3 gap-4 mb-8"
          >
            {[
              { label: 'Total Teachers', value: teachers.length, color: 'text-indigo-600', bg: 'bg-indigo-50' },
              { label: 'Active', value: teachers.filter((t) => t.is_active !== false).length, color: 'text-green-600', bg: 'bg-green-50' },
              { label: 'Inactive', value: teachers.filter((t) => t.is_active === false).length, color: 'text-red-600', bg: 'bg-red-50' },
            ].map((card) => (
              <div key={card.label} className={`${card.bg} rounded-xl p-5 border border-slate-200`}>
                <p className="text-sm font-medium text-slate-600">{card.label}</p>
                <p className={`text-3xl font-bold mt-1 ${card.color}`}>{card.value}</p>
              </div>
            ))}
          </motion.div>

          {/* Search */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mb-4 relative"
          >
            <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email or username…"
              className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            />
          </motion.div>

          {/* Table */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-xl border border-slate-200 overflow-hidden"
          >
            {fetching ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <Users className="w-10 h-10 mb-3 opacity-30" />
                <p className="font-medium">No teachers found</p>
                <p className="text-sm mt-1">
                  {search ? 'Try a different search.' : 'Teachers will appear here once they sign up.'}
                </p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {[
                      { key: 'full_name', label: 'Name' },
                      { key: 'email', label: 'Email' },
                      { key: 'session_count', label: 'Sessions' },
                      { key: 'created_at', label: 'Joined' },
                    ].map(({ key, label }) => (
                      <th
                        key={key}
                        onClick={() => toggleSort(key as SortKey)}
                        className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-700 select-none"
                      >
                        <div className="flex items-center gap-1">
                          {label}
                          <SortIcon k={key as SortKey} />
                        </div>
                      </th>
                    ))}
                    <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                    <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((teacher) => (
                    <motion.tr
                      key={teacher.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-semibold text-sm">
                            {(teacher.full_name || teacher.email)[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">{teacher.full_name || '—'}</p>
                            <p className="text-xs text-slate-500">@{teacher.username ?? teacher.email.split('@')[0].toLowerCase()}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-700">{teacher.email}</td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700">
                          {teacher.session_count}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-500">
                        {new Date(teacher.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-5 py-4">
                        {(teacher.is_active ?? true) ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700">
                            <CheckCircle className="w-3 h-3" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-600">
                            <XCircle className="w-3 h-3" /> Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <button
                          onClick={() => toggleActive(teacher)}
                          disabled={updating === teacher.id}
                          className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50 ${
                            (teacher.is_active ?? true)
                              ? 'bg-red-50 text-red-600 hover:bg-red-100'
                              : 'bg-green-50 text-green-700 hover:bg-green-100'
                          }`}
                        >
                          {updating === teacher.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (teacher.is_active ?? true) ? (
                            'Deactivate'
                          ) : (
                            'Activate'
                          )}
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            )}
          </motion.div>
        </div>
      </main>

      <AddTeacherModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onInvited={fetchTeachers}
      />
    </div>
  );
}
