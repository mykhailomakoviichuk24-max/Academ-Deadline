import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ReviewStatus,
  Subject,
  SubjectInput,
  Task,
  TaskInput,
  Workload,
} from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  // Subjects
  listSubjects(): Observable<Subject[]> {
    return this.http.get<Subject[]>('/api/subjects');
  }
  createSubject(s: SubjectInput): Observable<Subject> {
    return this.http.post<Subject>('/api/subjects', s);
  }
  updateSubject(id: string, s: SubjectInput): Observable<Subject> {
    return this.http.put<Subject>(`/api/subjects/${id}`, s);
  }
  deleteSubject(id: string): Observable<void> {
    return this.http.delete<void>(`/api/subjects/${id}`);
  }

  // Tasks
  listTasks(filters: { subject_id?: string; status?: ReviewStatus } = {}): Observable<Task[]> {
    let params = new HttpParams();
    if (filters.subject_id) params = params.set('subject_id', filters.subject_id);
    if (filters.status) params = params.set('status', filters.status);
    return this.http.get<Task[]>('/api/tasks', { params });
  }
  createTask(t: TaskInput): Observable<Task> {
    return this.http.post<Task>('/api/tasks', t);
  }
  updateTask(id: string, t: TaskInput): Observable<Task> {
    return this.http.put<Task>(`/api/tasks/${id}`, t);
  }
  updateTaskStatus(
    id: string,
    body: { status: ReviewStatus; review_notes?: string | null; deadline?: string | null },
  ): Observable<Task> {
    return this.http.patch<Task>(`/api/tasks/${id}/status`, body);
  }
  updateTaskProgress(id: string, progress: number): Observable<Task> {
    return this.http.patch<Task>(`/api/tasks/${id}/progress`, { progress });
  }
  deleteTask(id: string): Observable<void> {
    return this.http.delete<void>(`/api/tasks/${id}`);
  }

  // Analytics
  workload(range: 'day' | 'week' | 'month' = 'week'): Observable<Workload> {
    return this.http.get<Workload>('/api/analytics/workload', { params: { range } });
  }
}
