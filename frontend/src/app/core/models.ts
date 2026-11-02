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
  created_at: string;
  updated_at: string;
}
export type TaskInput = Pick<
  Task,
  'subject_id' | 'title' | 'task_type' | 'description' | 'deadline' | 'estimated_hours' | 'priority'
>;

export interface DayWorkload {
  date: string;
  total_hours: number;
  tasks_count: number;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface Workload {
  range: string;
  days: DayWorkload[];
  total_hours: number;
  total_tasks: number;
  overall_risk: 'LOW' | 'MEDIUM' | 'HIGH';
  burnout_warning: boolean;
  message: string;
}
