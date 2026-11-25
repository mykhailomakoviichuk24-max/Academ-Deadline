import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AssignmentInput,
  Group,
  ReviewStatus,
  StudentStats,
  TeacherAnalytics,
  TeacherTask,
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

  // Teacher
  teacherGroups(): Observable<Group[]> {
    return this.http.get<Group[]>('/api/teacher/groups');
  }
  createGroup(name: string): Observable<Group> {
    return this.http.post<Group>('/api/teacher/groups', { name });
  }
  groupStudents(groupId: string): Observable<StudentStats[]> {
    return this.http.get<StudentStats[]>(`/api/teacher/groups/${groupId}/students`);
  }
  removeStudent(groupId: string, studentId: string): Observable<void> {
    return this.http.delete<void>(`/api/teacher/groups/${groupId}/students/${studentId}`);
  }
  assign(body: AssignmentInput): Observable<{ created: number }> {
    return this.http.post<{ created: number }>('/api/teacher/assignments', body);
  }
  teacherTasks(filters: { group_id?: string; status?: ReviewStatus } = {}): Observable<TeacherTask[]> {
    let params = new HttpParams();
    if (filters.group_id) params = params.set('group_id', filters.group_id);
    if (filters.status) params = params.set('status', filters.status);
    return this.http.get<TeacherTask[]>('/api/teacher/tasks', { params });
  }
  reviewTask(
    id: string,
    status: 'ACCEPTED' | 'REQUIRES_CHANGES',
    review_notes: string | null,
  ): Observable<TeacherTask> {
    return this.http.patch<TeacherTask>(`/api/teacher/tasks/${id}/review`, { status, review_notes });
  }
  cancelAssignedTask(id: string): Observable<void> {
    return this.http.delete<void>(`/api/teacher/tasks/${id}`);
  }
  teacherAnalytics(groupId?: string, days = 14): Observable<TeacherAnalytics> {
    let params = new HttpParams().set('days', days);
    if (groupId) params = params.set('group_id', groupId);
    return this.http.get<TeacherAnalytics>('/api/teacher/analytics', { params });
  }
  joinGroup(code: string): Observable<{ group_id: string; group_name: string }> {
    return this.http.post<{ group_id: string; group_name: string }>('/api/groups/join', { code });
  }

  // Analytics
  workload(range: 'day' | 'week' | 'month' = 'week'): Observable<Workload> {
    return this.http.get<Workload>('/api/analytics/workload', { params: { range } });
  }
}
