import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'kanban',
    canActivate: [authGuard],
    loadComponent: () => import('./features/kanban/kanban.component').then((m) => m.KanbanComponent),
  },
  {
    path: 'subjects',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/subjects/subjects.component').then((m) => m.SubjectsComponent),
  },
  {
    path: 'calendar',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/calendar/calendar.component').then((m) => m.CalendarComponent),
  },
  {
    path: 'workload',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/workload/workload.component').then((m) => m.WorkloadComponent),
  },
  { path: '', pathMatch: 'full', redirectTo: 'kanban' },
  { path: '**', redirectTo: 'kanban' },
];
