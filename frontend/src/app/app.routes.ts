import { Routes } from '@angular/router';
import { studentGuard, teacherGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'kanban',
    canActivate: [studentGuard],
    loadComponent: () => import('./features/kanban/kanban.component').then((m) => m.KanbanComponent),
  },
  {
    path: 'subjects',
    canActivate: [teacherGuard],
    loadComponent: () =>
      import('./features/subjects/subjects.component').then((m) => m.SubjectsComponent),
  },
  {
    path: 'calendar',
    canActivate: [studentGuard],
    loadComponent: () =>
      import('./features/calendar/calendar.component').then((m) => m.CalendarComponent),
  },
  {
    path: 'workload',
    canActivate: [studentGuard],
    loadComponent: () =>
      import('./features/workload/workload.component').then((m) => m.WorkloadComponent),
  },
  {
    path: 'teacher',
    canActivate: [teacherGuard],
    loadComponent: () =>
      import('./features/teacher/teacher.component').then((m) => m.TeacherComponent),
  },
  { path: '', pathMatch: 'full', redirectTo: 'kanban' },
  { path: '**', redirectTo: 'kanban' },
];
