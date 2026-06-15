import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import {
  BarChart3,
  Users,
  TrendingUp,
  Calendar,
  Loader2,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  Search,
} from 'lucide-react';
import { Sidebar, Navbar, LoadingState } from '@/components/admin';
import { useAdmin } from '@/contexts/AdminContext';
import { toast } from 'sonner';
import type { TeacherAnalytics } from '@/pages/api/admin/analytics';

type SortKey = 'full_name' | 'session_count' | 'total_students' | 'avg_score';

export default function AdminAnalytics() {
  const router = useRouter();
  const { isAuthenticated, onboardingCompleted, isLoading } = useAdmin();

  const [analytics, setAnalytics] = useState<TeacherAnalytics[]>([]);
  const [fetching, setFetching] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('session_count');
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/admin/login');
    else if (!isLoading && isAuthenticated && !onboardingCompleted) router.replace('/admin/onboarding');
  }, [isAuthenticated, isLoading, onboardingCompleted, router]);

  const fetchAnalytics = useCallback(async () => {
    setFetching(true);
    try {
      const res = await fetch('/api/admin/analytics');
      const json = await res.json() as { analytics?: TeacherAnalytics[]; error?: string };
      if (json.error) { toast.error(json.error); return; }
      setAnalytics(json.analytics ?? []);
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && onboardingCompleted) fetchAnalytics();
  }, [isAuthenticated, onboardingCompleted, fetchAnalytics]);

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

  const filtered = analytics
    .filter((t) => {
      const q = search.toLowerCase();
      return t.full_name.toLowerCase().includes(q) || t.email.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'full_name') cmp = a.full_name.localeCompare(b.full_name);
      else if (sortKey === 'session_count') cmp = a.session_count - b.session_count;
      else if (sortKey === 'total_students') cmp = a.total_students - b.total_students;
      else if (sortKey === 'avg_score') cmp = (a.avg_score ?? -1) - (b.avg_score ?? -1);
      return sortAsc ? cmp : -cmp;
    });

  const totalSessions = analytics.reduce((s, t) => s + t.session_count, 0);
  const totalStudents = analytics.reduce((s, t) => s + t.total_students, 0);
  const scoresWithData = analytics.filter((t) => t.avg_score !== null);
  const overallAvg =
    scoresWithData.length > 0
      ? Math.round(scoresWithData.reduce((s, t) => s + (t.avg_score ?? 0), 0) / scoresWithData.length)
      : null;

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
              <h1 className="text-3xl font-bold text-slate-900">Analytics</h1>
              <p className="text-slate-600 mt-1">Teacher performance and student outcomes</p>
            </div>
            <button
              onClick={fetchAnalytics}
              disabled={fetching}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-all font-medium disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${fetching ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </motion.div>

          {/* Summary cards */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-4 gap-4 mb-8"
          >
            {[
              { label: 'Teachers', value: analytics.length, Icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-50' },
              { label: 'Total Sessions', value: totalSessions, Icon: BarChart3, color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: 'Total Students Reached', value: totalStudents, Icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-50' },
              {
                label: 'Platform Avg Score',
                value: overallAvg !== null ? `${overallAvg}%` : '—',
                Icon: TrendingUp,
                color: 'text-green-600',
                bg: 'bg-green-50',
              },
            ].map(({ label, value, Icon, color, bg }) => (
              <div key={label} className={`${bg} rounded-xl p-5 border border-slate-200`}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-slate-600">{label}</p>
                  <Icon className={`w-4 h-4 ${color} opacity-70`} />
                </div>
                <p className={`text-3xl font-bold ${color}`}>{value}</p>
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
              placeholder="Search teachers…"
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
                <BarChart3 className="w-10 h-10 mb-3 opacity-30" />
                <p className="font-medium">No data yet</p>
                <p className="text-sm mt-1">Analytics will populate as teachers run sessions.</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {[
                      { key: 'full_name', label: 'Teacher' },
                      { key: 'session_count', label: 'Sessions' },
                      { key: 'total_students', label: 'Students Reached' },
                      { key: 'avg_score', label: 'Avg Score' },
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
                    <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Last Session
                    </th>
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
                            {teacher.full_name[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">{teacher.full_name}</p>
                            <p className="text-xs text-slate-500">{teacher.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                          {teacher.session_count}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-700">{teacher.total_students}</td>
                      <td className="px-5 py-4">
                        {teacher.avg_score !== null ? (
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-green-500 rounded-full"
                                style={{ width: `${teacher.avg_score}%` }}
                              />
                            </div>
                            <span className="text-sm font-semibold text-slate-700">{teacher.avg_score}%</span>
                          </div>
                        ) : (
                          <span className="text-sm text-slate-400">No data</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-500">
                        {teacher.last_session_at
                          ? new Date(teacher.last_session_at).toLocaleDateString('en-GB', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })
                          : '—'}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            )}
          </motion.div>

          {/* Note */}
          {!fetching && analytics.length > 0 && (
            <p className="text-xs text-slate-400 mt-4 text-center">
              Scores are calculated from correct responses across all quiz questions in ended sessions.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
