import {
  LayoutDashboard, Users, Trophy, UserCircle, GraduationCap,
} from 'lucide-react';
import type { NavItem } from '@/components/layout/Sidebar';

export const STUDENT_NAV: NavItem[] = [
  { href: '/student/dashboard',   label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/student/join',        label: 'Join Session', icon: Users },
  { href: '/student/results',     label: 'My Results',   icon: Trophy },
  { href: '/student/classrooms',  label: 'Classrooms',   icon: GraduationCap },
  { href: '/profile',             label: 'Profile',      icon: UserCircle },
];
