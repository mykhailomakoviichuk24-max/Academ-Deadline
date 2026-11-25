export type TaskType = 'LABORATORY' | 'PRACTICAL' | 'COURSEWORK';
export type ReviewStatus = 'TODO' | 'IN_PROGRESS' | 'UNDER_REVIEW' | 'REQUIRES_CHANGES' | 'ACCEPTED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export const STATUSES: { key: ReviewStatus; label: string }[] = [
  { key: 'TODO', label: 'До виконання' },
  { key: 'IN_PROGRESS', label: 'В роботі' },
  { key: 'UNDER_REVIEW', label: 'На перевірці' },
  { key: 'REQUIRES_CHANGES', label: 'Потребує правок' },
  { key: 'ACCEPTED', label: 'Прийнято' },
];

export const TASK_TYPES: { key: TaskType; label: string }[] = [
  { key: 'LABORATORY', label: 'Лабораторна' },
  { key: 'PRACTICAL', label: 'Практична' },
  { key: 'COURSEWORK', label: 'Курсова' },
];

export const PRIORITIES: { key: TaskPriority; label: string }[] = [
  { key: 'LOW', label: 'Низький' },
  { key: 'MEDIUM', label: 'Середній' },
  { key: 'HIGH', label: 'Високий' },
  { key: 'CRITICAL', label: 'Критичний' },
];

export interface User {
  id: string;
  email: string;
  full_name: string;
  telegram_linked: boolean;
  role: 'STUDENT' | 'TEACHER';
  group_name: string | null;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
}

export interface Subject {
  id: string;
  name: string;
  teacher_name: string;
  teacher_contact: string;
  resources_url: string | null;
}
export type SubjectInput = Omit<Subject, 'id'>;

export interface Task {
  id: string;
  subject_id: string;
  title: string;
  task_type: TaskType;
  description: string | null;
  deadline: string;
  estimated_hours: number;
  priority: TaskPriority;
  status: ReviewStatus;
  review_notes: string | null;
  progress: number;
  /** set => the task was issued by a teacher (read-only for the student) */
  assigned_by: string | null;
  created_at: string;
  updated_at: string;
}
export type TaskInput = Pick<
  Task,
  'subject_id' | 'title' | 'task_type' | 'description' | 'deadline' | 'estimated_hours' | 'priority' | 'progress'
>;

export interface DayWorkload {
  date: string;
  total_hours: number;
  tasks_count: number;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  titles: string[];
}

export interface TaskBrief {
  id: string;
  title: string;
  subject: string;
  task_type: TaskType;
  priority: TaskPriority;
  status: ReviewStatus;
  deadline: string;
  estimated_hours: number;
  progress: number;
  /** negative = overdue */
  hours_left: number;
}

export interface BreakdownItem {
  key: string;
  label: string;
  hours: number;
  tasks: number;
}

export interface CompletionStats {
  total_tasks: number;
  accepted_tasks: number;
  completion_percent: number;
  hours_total: number;
  hours_done: number;
  progress_percent: number;
  by_status: Record<ReviewStatus, number>;
}

export interface Workload {
  range: string;
  days: DayWorkload[];
  total_hours: number;
  total_tasks: number;
  overall_risk: 'LOW' | 'MEDIUM' | 'HIGH';
  burnout_warning: boolean;
  message: string;
  avg_hours_per_day: number;
  busiest_day: DayWorkload | null;
  free_days: number;
  by_subject: BreakdownItem[];
  by_type: BreakdownItem[];
  by_priority: BreakdownItem[];
  completion: CompletionStats | null;
  overdue: TaskBrief[];
  upcoming: TaskBrief[];
  coursework: TaskBrief[];
  coursework_avg_progress: number;
}

// ---- Teacher ----
export interface Group {
  id: string;
  name: string;
  invite_code: string;
  students_count: number;
}

export interface StudentStats {
  id: string;
  full_name: string;
  email: string;
  total_tasks: number;
  accepted: number;
  under_review: number;
  overdue: number;
  avg_progress: number;
}

export interface TeacherTask {
  id: string;
  student_id: string;
  student_name: string;
  subject_name: string;
  title: string;
  task_type: TaskType;
  deadline: string;
  estimated_hours: number;
  priority: TaskPriority;
  status: ReviewStatus;
  review_notes: string | null;
  progress: number;
}

export interface AssignmentInput {
  group_id: string;
  subject_name: string;
  title: string;
  task_type: TaskType;
  description: string | null;
  deadline: string;
  estimated_hours: number;
  priority: TaskPriority;
  student_ids?: string[] | null;
}

export interface TypeStat { key: TaskType; total: number; accepted: number; avg_progress: number }
export interface SubjectStat { subject: string; total: number; accepted: number; overdue: number; avg_progress: number }
export interface GroupDayLoad { date: string; tasks: number; hours: number; hours_per_student: number; risk: 'LOW' | 'MEDIUM' | 'HIGH' }
export interface TeacherAnalytics {
  students_count: number;
  tasks_total: number;
  by_status: Record<string, number>;
  overdue: number;
  completion_percent: number;
  avg_progress: number;
  review_queue: number;
  by_type: TypeStat[];
  by_subject: SubjectStat[];
  load: GroupDayLoad[];
  busiest_day: GroupDayLoad | null;
  students: StudentStats[];
}
