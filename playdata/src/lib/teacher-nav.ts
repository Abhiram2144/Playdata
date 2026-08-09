import {
  LayoutDashboard, Database, BarChart3, BookOpen, Users,
  TrendingUp, UserCircle, GraduationCap, Tag,
} from 'lucide-react';
import type { NavItem } from '@/components/layout/Sidebar';

export const TEACHER_NAV: NavItem[] = [
  { href: '/teacher/dashboard',      label: 'Dashboard',      icon: LayoutDashboard },
  { href: '/teacher/datasets',       label: 'Datasets',       icon: Database },
  { href: '/teacher/visualisations', label: 'Visualisations', icon: BarChart3 },
  { href: '/teacher/quizzes',        label: 'Quizzes',        icon: BookOpen },
  { href: '/teacher/question-bank',  label: 'Tags',           icon: Tag },
  { href: '/teacher/sessions',       label: 'Sessions',       icon: Users },
  { href: '/teacher/classrooms',     label: 'Classrooms',     icon: GraduationCap },
  { href: '/teacher/analytics',      label: 'Analytics',      icon: TrendingUp },
  { href: '/profile',                label: 'Profile',        icon: UserCircle },
];
