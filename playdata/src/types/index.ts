export type UserRole = 'admin' | 'teacher' | 'student';

export interface AppUser {
  id: string;
  email: string;
  role: UserRole;
  full_name: string;
  created_at: string;
}

export interface Dataset {
  id: string;
  teacher_id: string;
  name: string;
  source_url: string;
  schema: Record<string, string>;
  row_count: number;
  cached_at: string;
  created_at: string;
}

export interface Visualisation {
  id: string;
  teacher_id: string;
  dataset_id: string;
  name: string;
  chart_type: 'bar' | 'line' | 'pie' | 'scatter' | 'histogram';
  config: Record<string, unknown>;
  created_at: string;
}

export interface Quiz {
  id: string;
  teacher_id: string;
  dataset_id: string | null;
  title: string;
  questions: Question[];
  created_at: string;
}

export interface Question {
  id: string;
  quiz_id: string;
  text: string;
  type: 'mcq' | 'short_answer' | 'numerical';
  options?: string[];
  correct_answer: string;
  dataset_column?: string;
}

export interface Session {
  id: string;
  teacher_id: string;
  quiz_id: string | null;
  visualisation_id: string | null;
  join_code: string;
  status: 'waiting' | 'active' | 'ended';
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export interface StudentResponse {
  id: string;
  session_id: string;
  student_id: string;
  question_id: string;
  answer: string;
  is_correct: boolean;
  submitted_at: string;
}
