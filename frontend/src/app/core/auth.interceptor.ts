import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/** Adds the JWT Bearer header and logs out on 401 from protected endpoints. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.token();
  const authed = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(authed).pipe(
    catchError((err: HttpErrorResponse) => {
      const isAuthCall = req.url.includes('/api/auth/login') || req.url.includes('/api/auth/register');
      if (err.status === 401 && !isAuthCall) {
        auth.logout();
      }
      return throwError(() => err);
    }),
  );
};
