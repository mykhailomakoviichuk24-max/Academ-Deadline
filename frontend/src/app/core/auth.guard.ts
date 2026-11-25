import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isAuthenticated() ? true : inject(Router).createUrlTree(['/login']);
};

/** Teacher-only pages: waits for the profile, then checks the role. */
export const teacherGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) return router.createUrlTree(['/login']);
  if (!auth.user()) {
    try { await firstValueFrom(auth.loadUser()); } catch { return router.createUrlTree(['/login']); }
  }
  return auth.isTeacher() ? true : router.createUrlTree(['/kanban']);
};

/** Student pages: a teacher is sent to the teacher cabinet. */
export const studentGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) return router.createUrlTree(['/login']);
  if (!auth.user()) {
    try { await firstValueFrom(auth.loadUser()); } catch { return router.createUrlTree(['/login']); }
  }
  return auth.isTeacher() ? router.createUrlTree(['/teacher']) : true;
};
