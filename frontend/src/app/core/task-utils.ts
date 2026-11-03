import { Task } from './models';

export type Urgency = 'done' | 'late' | 'hot' | 'soon' | 'calm';

/** How urgent a task is, judging by time left until the deadline. */
export function urgencyOf(t: Pick<Task, 'status' | 'deadline'>, now = Date.now()): Urgency {
  if (t.status === 'ACCEPTED') return 'done';
  const left = new Date(t.deadline).getTime() - now;
  if (left < 0) return 'late';
  if (left < 24 * 3600 * 1000) return 'hot';
  if (left < 72 * 3600 * 1000) return 'soon';
  return 'calm';
}

/** "2 д 3 год" / "5 год 10 хв" / "12 хв" for a duration in milliseconds (sign ignored). */
export function spanLabel(ms: number): string {
  const mins = Math.floor(Math.abs(ms) / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d} д ${h} год`;
  if (h > 0) return `${h} год ${m} хв`;
  return `${Math.max(m, 1)} хв`;
}

/** Local calendar key YYYY-MM-DD of a date (not UTC, so the deadline lands on the user's day). */
export function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Colour class of a progress value. */
export function progressClass(p: number): string {
  if (p >= 100) return 'p-done';
  if (p < 30) return 'p-low';
  if (p < 70) return 'p-mid';
  return '';
}
