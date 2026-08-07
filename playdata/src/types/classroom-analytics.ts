export type TrendDir = 'up' | 'down' | 'flat'

export interface AnalyticsOverview {
  total_sessions: number
  total_students: number
  avg_score: number | null
  trend: TrendDir | null
  trend_delta_pp: number | null
}

export interface StudentStat {
  student_id: string | null
  email: string
  full_name: string | null
  sessions_attended: number
  total_sessions: number
  avg_score: number | null
  last_session_date: string | null
  current_streak: number | null
  total_points: number | null
}

export interface TopicStat {
  topic: string
  accuracy_pct: number
  total_responses: number
  correct_responses: number
}

export interface TrendPoint {
  session_id: string
  title: string
  date: string | null
  avg_score: number
}

export interface ClassroomAnalytics {
  overview: AnalyticsOverview
  students: StudentStat[]
  topics: TopicStat[]
  trend: TrendPoint[]
}
