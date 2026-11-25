import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { TokenResponse, User } from './models';

const TOKEN_KEY = 'dt_access_token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  readonly token = signal<string | null>(localStorage.getItem(TOKEN_KEY));
  readonly user = signal<User | null>(null);
  readonly isAuthenticated = computed(() => !!this.token());
  readonly isTeacher = computed(() => this.user()?.role === 'TEACHER');

  login(email: string, password: string): Observable<TokenResponse> {
    return this.http
      .post<TokenResponse>('/api/auth/login', { email, password })
      .pipe(tap((r) => this.setToken(r.access_token)));
  }

  register(body: {
    email: string;
    password: string;
    full_name: string;
    role: 'STUDENT' | 'TEACHER';
    teacher_code?: string | null;
    group_code?: string | null;
  }): Observable<TokenResponse> {
    return this.http
      .post<TokenResponse>('/api/auth/register', body)
      .pipe(tap((r) => this.setToken(r.access_token)));
  }

  loadUser(): Observable<User> {
    return this.http.get<User>('/api/auth/me').pipe(tap((u) => this.user.set(u)));
  }

  generateTelegramLink(): Observable<{ token: string; deep_link: string }> {
    return this.http.post<{ token: string; deep_link: string }>('/api/telegram/generate-link', {});
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    this.token.set(null);
    this.user.set(null);
    this.router.navigate(['/login']);
  }

  private setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
    this.token.set(token);
  }
}
