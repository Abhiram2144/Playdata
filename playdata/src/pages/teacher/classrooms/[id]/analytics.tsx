import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { GetServerSidePropsResult } from 'next';
import {
  ArrowLeft, TrendingUp, TrendingDown, Minus, Users, BarChart2,
  BookOpen, ChevronUp, ChevronDown, AlertCircle, Download, Zap, Star,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { TEACHER_NAV } from '@/lib/teacher-nav';
import { withAuth } from '@/lib/auth';
import { createClientFromContext } from '@/lib/supabase/server-props';
import { createAdminClient } from '@/lib/supabase/admin';
import type {
  ClassroomAnalytics, StudentStat, TrendPoint,
} from '@/types/classroom-analytics';

// ── Server-side types ─────────────────────────────────────────────────────────

interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

interface Classroom {
  id: string;
  name: string;
  description: string | null;
}

interface Props {
  profile: Profile;
  classroom: Classroom;
}

// ── Server-side ───────────────────────────────────────────────────────────────

export const getServerSideProps = withAuth(
  async (context, userId): Promise<GetServerSidePropsResult<Props>> => {
    const supabase = createClientFromContext(context);
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .eq('id', userId)
      .single();

    if (!profile) return { redirect: { destination: '/auth/login', permanent: false } };

    const classroomId = context.params?.id as string;
    const admin = createAdminClient();

    const { data: classroom } = await admin
      .from('classrooms')
      .select('id, teacher_id, name, description')
      .eq('id', classroomId)
      .single();

    if (!classroom || classroom.teacher_id !== userId) {
      return { redirect: { destination: '/teacher/classrooms', permanent: false } };
    }

    return {
      props: {
        profile,
        classroom: {
          id: classroom.id,
          name: classroom.name,
          description: classroom.description,
        },
      },
    };
  },
  { allowedRoles: ['teacher'] }
);

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtPct(n: number | null, decimals = 1): string {
  if (n === null) return '—';
  return `${n.toFixed(decimals)}%`;
}

function fmtDelta(n: number | null): string {
  if (n === null) return '';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(1)} pp`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtShortDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ── CSV export ────────────────────────────────────────────────────────────────

function exportCsv(students: StudentStat[], totalSessions: number, classroomName: string) {
  const hasStreak = students.some(s => s.current_streak !== null);
  const hasPoints = students.some(s => s.total_points !== null);

  const headers = ['Name', 'Email', 'Sessions Attended', 'Total Sessions', 'Avg Score (%)', 'Last Active'];
  if (hasStreak) headers.push('Current Streak');
  if (hasPoints) headers.push('Total Points');

  const rows = students.map(s => {
    const row: string[] = [
      s.full_name ?? '',
      s.email,
      String(s.sessions_attended),
      String(totalSessions),
      s.avg_score !== null ? s.avg_score.toFixed(1) : '',
      s.last_session_date ? fmtDate(s.last_session_date) : '',
    ];
    if (hasStreak) row.push(s.current_streak !== null ? String(s.current_streak) : '');
    if (hasPoints) row.push(s.total_points !== null ? String(s.total_points) : '');
    return row;
  });

  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${classroomName.replace(/[^a-z0-9]/gi, '_')}_analytics.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon, borderColour,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon: React.ReactNode;
  borderColour: string;
}) {
  return (
    <div className={`rounded-2xl border bg-white p-5 shadow-sm flex items-start gap-4 ${borderColour}`}>
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</p>
        <p className="mt-0.5 text-2xl font-bold text-gray-900 leading-tight">{value}</p>
        {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

// ── Trend card ────────────────────────────────────────────────────────────────

function TrendCard({ trend, deltaPp }: { trend: 'up' | 'down' | 'flat' | null; deltaPp: number | null }) {
  if (!trend) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm flex items-start gap-4">
        <div className="mt-0.5 shrink-0">
          <Minus className="size-5 text-gray-300" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Trend</p>
          <p className="mt-0.5 text-sm text-gray-400">Need 4+ sessions</p>
          <p className="text-xs text-gray-300 mt-0.5">last 3 vs prior 3</p>
        </div>
      </div>
    );
  }

  const config = {
    up: {
      icon: <TrendingUp className="size-5 text-emerald-500" />,
      label: 'Improving',
      labelColour: 'text-emerald-700',
      deltaColour: 'text-emerald-600 bg-emerald-50',
      border: 'border-emerald-100',
    },
    down: {
      icon: <TrendingDown className="size-5 text-rose-500" />,
      label: 'Declining',
      labelColour: 'text-rose-700',
      deltaColour: 'text-rose-600 bg-rose-50',
      border: 'border-rose-100',
    },
    flat: {
      icon: <Minus className="size-5 text-amber-500" />,
      label: 'Stable',
      labelColour: 'text-amber-700',
      deltaColour: 'text-amber-600 bg-amber-50',
      border: 'border-amber-100',
    },
  } as const;

  const c = config[trend];

  return (
    <div className={`rounded-2xl border bg-white p-5 shadow-sm flex items-start gap-4 ${c.border}`}>
      <div className="mt-0.5 shrink-0">{c.icon}</div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Trend</p>
        <div className="mt-0.5 flex items-baseline gap-2 flex-wrap">
          <span className={`text-2xl font-bold ${c.labelColour}`}>{c.label}</span>
          {deltaPp !== null && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full tabular-nums ${c.deltaColour}`}>
              {fmtDelta(deltaPp)}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-0.5">last 3 vs prior 3 sessions</p>
      </div>
    </div>
  );
}

// ── Trend line chart ──────────────────────────────────────────────────────────

function TrendChart({ data, avgScore }: { data: TrendPoint[]; avgScore: number | null }) {
  const chartData = data.map(p => ({
    name: fmtShortDate(p.date),
    score: Math.round(p.avg_score * 10) / 10,
    fullTitle: p.title,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={chartData} margin={{ top: 8, right: 20, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          tickLine={false}
          axisLine={false}
          unit="%"
        />
        {avgScore !== null && (
          <ReferenceLine
            y={Math.round(avgScore * 10) / 10}
            stroke="#c4b5fd"
            strokeDasharray="4 4"
            label={{ value: 'avg', position: 'insideTopRight', fontSize: 10, fill: '#a78bfa' }}
          />
        )}
        <Tooltip
          formatter={(v) => [`${Number(v).toFixed(1)}%`, 'Avg accuracy']}
          labelFormatter={(_, payload) => payload?.[0]?.payload?.fullTitle ?? ''}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 2px 8px #0001' }}
        />
        <Line
          type="monotone"
          dataKey="score"
          stroke="#7c3aed"
          strokeWidth={2.5}
          dot={{ r: 4, fill: '#7c3aed', strokeWidth: 0 }}
          activeDot={{ r: 6, strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Topic accuracy bars ───────────────────────────────────────────────────────

function TopicBar({
  topic, accuracyPct, totalResponses, correctResponses, rank,
}: {
  topic: string;
  accuracyPct: number;
  totalResponses: number;
  correctResponses: number;
  rank: number;
}) {
  const pct = Math.round(accuracyPct);
  // Colour: red for weak, amber for mid, green for strong
  const barColour = pct < 45 ? 'bg-rose-500' : pct < 70 ? 'bg-amber-400' : 'bg-emerald-500';
  const labelColour = pct < 45 ? 'text-rose-600' : pct < 70 ? 'text-amber-600' : 'text-emerald-600';

  return (
    <div className="flex items-center gap-3 group">
      <div className="w-5 shrink-0 text-xs font-bold text-gray-300 tabular-nums text-right">{rank}</div>
      <div className="w-32 shrink-0 text-sm text-gray-700 font-medium truncate" title={topic}>{topic}</div>
      <div className="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColour}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="w-24 shrink-0 text-right text-sm tabular-nums flex items-center justify-end gap-1.5">
        <span className={`font-semibold ${labelColour}`}>{pct}%</span>
        <span className="text-gray-300 text-xs">({correctResponses}/{totalResponses})</span>
      </div>
    </div>
  );
}

// ── Student table ─────────────────────────────────────────────────────────────

type StudentSortKey = 'name' | 'sessions' | 'score' | 'last' | 'streak' | 'points';
type SortDir = 'asc' | 'desc';

function StudentTable({
  students,
  totalSessions,
  classroomName,
}: {
  students: StudentStat[];
  totalSessions: number;
  classroomName: string;
}) {
  const [sortKey, setSortKey] = useState<StudentSortKey>('sessions');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const hasStreak = students.some(s => s.current_streak !== null);
  const hasPoints = students.some(s => s.total_points !== null);
  const nonParticipatingCount = students.filter(s => s.sessions_attended === 0).length;

  const sorted = useMemo(() => {
    return [...students].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name': {
          const na = (a.full_name ?? a.email).toLowerCase();
          const nb = (b.full_name ?? b.email).toLowerCase();
          cmp = na < nb ? -1 : na > nb ? 1 : 0;
          break;
        }
        case 'sessions':
          cmp = a.sessions_attended - b.sessions_attended;
          break;
        case 'score':
          cmp = (a.avg_score ?? -1) - (b.avg_score ?? -1);
          break;
        case 'last': {
          const da = a.last_session_date ?? '';
          const db = b.last_session_date ?? '';
          cmp = da < db ? -1 : da > db ? 1 : 0;
          break;
        }
        case 'streak':
          cmp = (a.current_streak ?? -1) - (b.current_streak ?? -1);
          break;
        case 'points':
          cmp = (a.total_points ?? -1) - (b.total_points ?? -1);
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [students, sortKey, sortDir]);

  function toggleSort(key: StudentSortKey) {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const handleExport = useCallback(() => {
    exportCsv(sorted, totalSessions, classroomName);
  }, [sorted, totalSessions, classroomName]);

  function SortIcon({ col }: { col: StudentSortKey }) {
    if (sortKey !== col) return <ChevronUp className="size-3 text-gray-300 shrink-0" />;
    return sortDir === 'asc'
      ? <ChevronUp className="size-3 text-violet-500 shrink-0" />
      : <ChevronDown className="size-3 text-violet-500 shrink-0" />;
  }

  function TH({ col, label, cls = '' }: { col: StudentSortKey; label: string; cls?: string }) {
    return (
      <th className={`px-4 py-3 text-left whitespace-nowrap ${cls}`}>
        <button
          onClick={() => toggleSort(col)}
          className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-700 transition-colors"
        >
          {label}
          <SortIcon col={col} />
        </button>
      </th>
    );
  }

  if (students.length === 0) {
    return (
      <div className="py-12 flex flex-col items-center gap-2 text-gray-400">
        <Users className="size-8" />
        <p className="text-sm">No active students yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          {nonParticipatingCount > 0 && (
            <div className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 border border-rose-100 px-3 py-1.5 text-xs font-medium text-rose-600">
              <span className="size-2 rounded-full bg-rose-400 shrink-0" />
              {nonParticipatingCount} student{nonParticipatingCount !== 1 ? 's' : ''} not attended — highlighted below
            </div>
          )}
        </div>
        <button
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-600 transition-colors shadow-sm"
        >
          <Download className="size-3.5" />
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-gray-100">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100 bg-gray-50/60">
            <tr>
              <TH col="name" label="Student" />
              <TH col="sessions" label="Attended" />
              <TH col="score" label="Avg Score" cls="hidden sm:table-cell" />
              <TH col="last" label="Last Active" cls="hidden md:table-cell" />
              {hasStreak && <TH col="streak" label="Streak" cls="hidden lg:table-cell" />}
              {hasPoints && <TH col="points" label="Points" cls="hidden lg:table-cell" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 bg-white">
            {sorted.map(s => {
              const attendedPct = totalSessions > 0 ? (s.sessions_attended / totalSessions) * 100 : 0;
              const never = s.sessions_attended === 0;
              return (
                <tr
                  key={s.student_id ?? s.email}
                  className={never ? 'bg-rose-50/50' : 'hover:bg-gray-50/60 transition-colors'}
                >
                  {/* Name */}
                  <td className="px-4 py-3.5">
                    {s.full_name ? (
                      <div>
                        <p className="font-medium text-gray-800 leading-snug">{s.full_name}</p>
                        <p className="text-xs text-gray-400">{s.email}</p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-gray-400 italic text-sm">No account</span>
                        <span className="text-xs text-gray-400">· {s.email}</span>
                      </div>
                    )}
                  </td>

                  {/* Sessions attended */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="w-14 h-1.5 rounded-full bg-gray-100 overflow-hidden hidden sm:block shrink-0">
                        <div
                          className={`h-full rounded-full ${never ? 'bg-rose-400' : 'bg-violet-500'}`}
                          style={{ width: `${attendedPct}%` }}
                        />
                      </div>
                      <span className={`font-semibold tabular-nums text-sm ${never ? 'text-rose-600' : 'text-gray-800'}`}>
                        {s.sessions_attended}/{totalSessions}
                      </span>
                    </div>
                  </td>

                  {/* Avg score */}
                  <td className="px-4 py-3.5 hidden sm:table-cell">
                    <span className="font-medium text-gray-800 tabular-nums">{fmtPct(s.avg_score)}</span>
                  </td>

                  {/* Last active */}
                  <td className="px-4 py-3.5 hidden md:table-cell text-xs text-gray-400 tabular-nums">
                    {fmtDate(s.last_session_date)}
                  </td>

                  {/* Streak (gamification) */}
                  {hasStreak && (
                    <td className="px-4 py-3.5 hidden lg:table-cell">
                      {s.current_streak !== null ? (
                        <span className="inline-flex items-center gap-1 text-sm font-semibold text-orange-600">
                          <Zap className="size-3.5 text-orange-400" />
                          {s.current_streak}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-sm">—</span>
                      )}
                    </td>
                  )}

                  {/* Points (gamification) */}
                  {hasPoints && (
                    <td className="px-4 py-3.5 hidden lg:table-cell">
                      {s.total_points !== null ? (
                        <span className="inline-flex items-center gap-1 text-sm font-semibold text-violet-600">
                          <Star className="size-3.5 text-violet-400" />
                          {s.total_points.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-sm">—</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-gray-100" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="h-64 rounded-2xl bg-gray-100" />
        <div className="h-64 rounded-2xl bg-gray-100" />
      </div>
      <div className="h-72 rounded-2xl bg-gray-100" />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ClassroomAnalyticsPage({ profile, classroom }: Props) {
  const [analytics, setAnalytics] = useState<ClassroomAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/teacher/classrooms/${classroom.id}/analytics`)
      .then(async r => {
        if (!r.ok) throw new Error((await r.json()).error ?? 'Failed to load analytics');
        return r.json() as Promise<ClassroomAnalytics>;
      })
      .then(setAnalytics)
      .catch(e => setError(String(e.message)))
      .finally(() => setLoading(false));
  }, [classroom.id]);

  const ov = analytics?.overview;
  const noData = !loading && !error && ov?.total_sessions === 0;

  return (
    <DashboardLayout profile={profile} navItems={TEACHER_NAV}>
      <div className="space-y-7">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-2 text-xs text-gray-400">
            <Link href="/teacher/classrooms" className="hover:text-gray-700 transition-colors">
              Classrooms
            </Link>
            <span>/</span>
            <Link href={`/teacher/classrooms/${classroom.id}`} className="hover:text-gray-700 transition-colors">
              {classroom.name}
            </Link>
            <span>/</span>
            <span className="text-gray-600 font-medium">Analytics</span>
          </div>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/teacher/classrooms/${classroom.id}`}
                  className="inline-flex items-center gap-1.5 text-gray-400 hover:text-gray-700 transition-colors"
                >
                  <ArrowLeft className="size-4" />
                </Link>
                <h1 className="text-2xl font-bold text-gray-900">{classroom.name}</h1>
              </div>
              {classroom.description && (
                <p className="text-sm text-gray-400 mt-0.5 ml-6">{classroom.description}</p>
              )}
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2.5 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <AlertCircle className="size-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && <Skeleton />}

        {/* No sessions */}
        {noData && (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
            <div className="rounded-full bg-gray-100 p-5">
              <BookOpen className="size-9 text-gray-300" />
            </div>
            <p className="text-base font-semibold text-gray-700">No sessions run yet</p>
            <p className="text-sm text-gray-400 max-w-xs">
              Run a quiz session for this classroom and analytics will appear here automatically.
            </p>
            <Link
              href={`/teacher/classrooms/${classroom.id}`}
              className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:border-violet-300 hover:text-violet-600 transition-colors"
            >
              <ArrowLeft className="size-4" />
              Back to roster
            </Link>
          </div>
        )}

        {analytics && !noData && ov && (
          <>
            {/* ── Overview cards ─────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard
                label="Sessions run"
                value={ov.total_sessions}
                icon={<div className="rounded-xl bg-violet-100 p-2.5"><BookOpen className="size-4 text-violet-600" /></div>}
                borderColour="border-violet-100"
              />
              <StatCard
                label="Students participated"
                value={ov.total_students}
                sub="who attended ≥ 1 session"
                icon={<div className="rounded-xl bg-indigo-100 p-2.5"><Users className="size-4 text-indigo-600" /></div>}
                borderColour="border-indigo-100"
              />
              <StatCard
                label="Avg class score"
                value={fmtPct(ov.avg_score)}
                sub="correct answers across all sessions"
                icon={<div className="rounded-xl bg-sky-100 p-2.5"><BarChart2 className="size-4 text-sky-600" /></div>}
                borderColour="border-sky-100"
              />
              <TrendCard trend={ov.trend} deltaPp={ov.trend_delta_pp} />
            </div>

            {/* ── Trend chart + Topic breakdown ──────────────────────────── */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

              {/* Score over time */}
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-sm font-semibold text-gray-800">Score over time</h2>
                  <span className="text-xs text-gray-400">avg accuracy per session</span>
                </div>
                {analytics.trend.length < 2 ? (
                  <div className="flex flex-col items-center justify-center h-[220px] gap-2 text-gray-400">
                    <BarChart2 className="size-8 text-gray-200" />
                    <p className="text-sm">Need at least 2 sessions with responses</p>
                  </div>
                ) : (
                  <TrendChart data={analytics.trend} avgScore={ov.avg_score} />
                )}
              </div>

              {/* Topic accuracy — weakest first */}
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-sm font-semibold text-gray-800">Topic accuracy</h2>
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-600">
                    weakest first
                  </span>
                </div>
                <p className="text-xs text-gray-400 mb-4">where the class is struggling — topics with lowest correct-answer rate surface first</p>
                {analytics.topics.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[180px] gap-2 text-gray-400">
                    <BarChart2 className="size-8 text-gray-200" />
                    <p className="text-sm">No question responses yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {analytics.topics.map((t, i) => (
                      <TopicBar
                        key={t.topic}
                        rank={i + 1}
                        topic={t.topic}
                        accuracyPct={t.accuracy_pct}
                        totalResponses={t.total_responses}
                        correctResponses={t.correct_responses}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Per-student breakdown ──────────────────────────────────── */}
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-gray-800">Student breakdown</h2>
                <p className="text-xs text-gray-400 mt-0.5">all active roster members · click column headers to sort</p>
              </div>
              <StudentTable
                students={analytics.students}
                totalSessions={ov.total_sessions}
                classroomName={classroom.name}
              />
            </div>
          </>
        )}

      </div>
    </DashboardLayout>
  );
}
