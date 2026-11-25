import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div class="page">
      <section class="intro">
        <h1>Семестр під контролем</h1>
        <p class="lead">Лабораторні, практичні й курсові в одній дошці, з нагадуваннями в Telegram до того, як дедлайн стане проблемою.</p>
        <ul>
          <li>
            <strong>Статуси перевірки</strong>
            <span>Від «До виконання» до «Прийнято», з коментарями викладача.</span>
          </li>
          <li>
            <strong>Навантаження по днях</strong>
            <span>Видно, коли дедлайни зійдуться в один тиждень.</span>
          </li>
          <li>
            <strong>Нагадування</strong>
            <span>За 3 дні, за добу й за 2 години до здачі.</span>
          </li>
        </ul>
      </section>

      <section class="form-side">
        <form class="card" [formGroup]="form" (ngSubmit)="submit()">
          <h2>{{ mode() === 'login' ? 'Вхід' : 'Створення акаунта' }}</h2>

          @if (mode() === 'register') {
            <div class="role" role="radiogroup" aria-label="Роль">
              <button type="button" role="radio" [attr.aria-checked]="role() === 'STUDENT'" [class.on]="role() === 'STUDENT'" (click)="setRole('STUDENT')">Студент</button>
              <button type="button" role="radio" [attr.aria-checked]="role() === 'TEACHER'" [class.on]="role() === 'TEACHER'" (click)="setRole('TEACHER')">Викладач</button>
            </div>
            <div class="field">
              <label for="full_name">Повне ім'я</label>
              <input id="full_name" formControlName="full_name" autocomplete="name" />
            </div>
          }
          <div class="field">
            <label for="email">Email</label>
            <input id="email" type="email" formControlName="email" autocomplete="email" />
          </div>
          <div class="field">
            <label for="password">Пароль, мінімум 6 символів</label>
            <input id="password" type="password" formControlName="password"
              [attr.autocomplete]="mode() === 'login' ? 'current-password' : 'new-password'" />
          </div>

          @if (mode() === 'register') {
            @if (role() === 'TEACHER') {
              <div class="field">
                <label for="teacher_code">Код доступу викладача</label>
                <input id="teacher_code" formControlName="teacher_code" autocomplete="off" />
              </div>
            } @else {
              <div class="field">
                <label for="group_code">Код групи, якщо є (від викладача)</label>
                <input id="group_code" formControlName="group_code" autocomplete="off" />
              </div>
            }
          }

          @if (error()) { <p class="error" role="alert">{{ error() }}</p> }

          <button class="primary wide" type="submit" [disabled]="form.invalid || loading()">
            {{ mode() === 'login' ? 'Увійти' : 'Створити акаунт' }}
          </button>

          <p class="switch muted">
            {{ mode() === 'login' ? 'Ще немає акаунта?' : 'Вже зареєстровані?' }}
            <a href="#" (click)="toggle($event)">{{ mode() === 'login' ? 'Створити акаунт' : 'Увійти' }}</a>
          </p>
        </form>
      </section>
    </div>
  `,
  styles: [
    `
      .page { min-height: 100vh; display: grid; grid-template-columns: 1.1fr 1fr; }
      .intro {
        padding: 12vh 7vw 8vh;
        background:
          linear-gradient(160deg, color-mix(in srgb, var(--accent) 12%, var(--bg)) 0%, var(--bg) 60%);
        border-right: 1px solid var(--border);
      }
      h1 { font-size: clamp(32px, 4.4vw, 54px); font-weight: 700; line-height: 1.05; letter-spacing: -0.03em; max-width: 12ch; margin-bottom: 18px; }
      .lead { font-size: 18px; color: var(--muted); max-width: 46ch; margin-bottom: 40px; }
      ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 18px; max-width: 46ch; }
      li { display: grid; gap: 2px; padding-left: 16px; border-left: 2px solid var(--accent); }
      li strong { font-weight: 600; }
      li span { color: var(--muted); font-size: 14px; }

      .form-side { display: grid; place-items: center; padding: 32px; }
      form { width: 100%; max-width: 400px; padding: 28px; }
      form h2 { font-size: 22px; margin-bottom: 20px; }
      .role { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 16px; padding: 4px; border-radius: 99px; background: var(--surface-2); border: 1px solid var(--border); }
      .role button { border: 0; border-radius: 99px; background: transparent; color: var(--muted); }
      .role button.on { background: var(--accent); color: var(--accent-ink); font-weight: 600; }
      .wide { width: 100%; padding: 11px; margin-top: 4px; }
      .switch { margin: 16px 0 0; font-size: 14px; text-align: center; }

      @media (max-width: 860px) {
        .page { grid-template-columns: 1fr; }
        .intro { padding: 56px 24px 32px; border-right: 0; border-bottom: 1px solid var(--border); }
        ul { display: none; }
        .lead { margin-bottom: 0; }
      }
    `,
  ],
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);

  mode = signal<'login' | 'register'>('login');
  error = signal('');
  loading = signal(false);
  role = signal<'STUDENT' | 'TEACHER'>('STUDENT');

  form = this.fb.nonNullable.group({
    full_name: [''],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    teacher_code: [''],
    group_code: [''],
  });

  toggle(e: Event): void {
    e.preventDefault();
    this.error.set('');
    const next = this.mode() === 'login' ? 'register' : 'login';
    this.mode.set(next);
    const name = this.form.controls.full_name;
    name.setValidators(next === 'register' ? [Validators.required] : []);
    name.updateValueAndValidity();
  }

  private translate(detail: string): string {
    const map: Record<string, string> = {
      'Invalid credentials': 'Невірний email або пароль.',
      'Invalid teacher access code': 'Невірний код доступу викладача.',
      'Group not found': 'Групу з таким кодом не знайдено.',
      'Email already registered': 'Цей email уже зареєстровано.',
    };
    return map[detail] ?? detail;
  }

  setRole(r: 'STUDENT' | 'TEACHER'): void {
    this.role.set(r);
    const code = this.form.controls.teacher_code;
    code.setValidators(r === 'TEACHER' ? [Validators.required] : []);
    code.updateValueAndValidity();
  }

  submit(): void {
    if (this.form.invalid) return;
    const { email, password, full_name, teacher_code, group_code } = this.form.getRawValue();
    this.loading.set(true);
    this.error.set('');
    const req =
      this.mode() === 'login'
        ? this.auth.login(email, password)
        : this.auth.register({
            email,
            password,
            full_name,
            role: this.role(),
            teacher_code: this.role() === 'TEACHER' ? teacher_code.trim() : null,
            group_code: this.role() === 'STUDENT' && group_code.trim() ? group_code.trim() : null,
          });
    req.subscribe({
      next: () =>
        this.auth.loadUser().subscribe({
          next: (u) => this.router.navigate([u.role === 'TEACHER' ? '/teacher' : '/kanban']),
          error: () => this.router.navigate(['/kanban']),
        }),
      error: (e) => {
        this.loading.set(false);
        const detail = e.error?.detail;
        this.error.set(
          typeof detail === 'string'
            ? this.translate(detail)
            : 'Не вдалося виконати запит. Перевірте дані й спробуйте ще раз.',
        );
      },
    });
  }
}
