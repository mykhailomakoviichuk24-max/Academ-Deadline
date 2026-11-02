import { Component, effect, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';

type Theme = 'dark' | 'light';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    @if (auth.isAuthenticated()) {
      <header class="topbar">
        <a class="brand" routerLink="/kanban" aria-label="Deadline Tracker">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="2" y="2" width="20" height="20" rx="6" class="mark" />
            <path d="M7.5 12.5l3 3 6-7" />
          </svg>
          <span>Deadline Tracker</span>
        </a>

        <nav aria-label="Основна навігація">
          <a routerLink="/kanban" routerLinkActive="active">Канбан</a>
          <a routerLink="/subjects" routerLinkActive="active">Предмети</a>
          <a routerLink="/workload" routerLinkActive="active">Навантаження</a>
        </nav>

        <div class="right">
          @if (auth.user(); as u) {
            <span class="who">{{ u.full_name }}</span>
            @if (u.telegram_linked) {
              <span class="tg-ok">Telegram підключено</span>
            } @else {
              <button (click)="linkTelegram()">Підключити Telegram</button>
            }
          }
          <button class="icon-btn" (click)="toggleTheme()" [attr.aria-label]="themeLabel()" [title]="themeLabel()">
            @if (theme() === 'dark') {
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
            } @else {
              <svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" /></svg>
            }
          </button>
          <button (click)="auth.logout()">Вийти</button>
        </div>
      </header>

      @if (tgLink(); as link) {
        <div class="tg-banner">
          <span>Відкрийте посилання в Telegram і натисніть Start:</span>
          <a [href]="link" target="_blank" rel="noopener">{{ link }}</a>
          <button (click)="copyLink(link)">{{ copied() ? 'Скопійовано' : 'Копіювати' }}</button>
        </div>
      }
    } @else {
      <button class="icon-btn theme-fab" (click)="toggleTheme()" [attr.aria-label]="themeLabel()" [title]="themeLabel()">
        @if (theme() === 'dark') {
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
        } @else {
          <svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" /></svg>
        }
      </button>
    }
    <main [class.bare]="!auth.isAuthenticated()"><router-outlet /></main>
  `,
  styles: [
    `
      .topbar {
        position: sticky; top: 0; z-index: 5;
        display: flex; align-items: center; gap: 28px; flex-wrap: wrap;
        padding: 12px 28px;
        background: color-mix(in srgb, var(--bg) 86%, transparent);
        backdrop-filter: blur(10px);
        border-bottom: 1px solid var(--border);
      }
      .brand { display: flex; align-items: center; gap: 10px; color: var(--text); text-decoration: none; font-weight: 700; font-size: 16px; }
      .brand svg { width: 26px; height: 26px; }
      .brand .mark { fill: var(--accent); }
      .brand path { fill: none; stroke: var(--accent-ink); stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }

      nav { display: flex; gap: 4px; flex: 1; }
      nav a { padding: 7px 14px; border-radius: 99px; color: var(--muted); text-decoration: none; font-weight: 500; transition: color 0.15s, background 0.15s; }
      nav a:hover { color: var(--text); }
      nav a.active { background: var(--surface-2); color: var(--text); box-shadow: inset 0 0 0 1px var(--border); }

      .right { display: flex; gap: 10px; align-items: center; }
      .who { color: var(--muted); font-size: 14px; }
      .tg-ok { color: var(--accent); font-size: 13px; font-weight: 500; padding: 4px 12px; border-radius: 99px; background: color-mix(in srgb, var(--accent) 14%, transparent); }

      .tg-banner { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; padding: 10px 28px; background: var(--surface-2); border-bottom: 1px solid var(--border); font-size: 14px; }
      .tg-banner a { word-break: break-all; }

      .theme-fab { position: fixed; top: 16px; right: 16px; z-index: 5; }
      main { padding: 28px; max-width: 1480px; margin: 0 auto; }
      main.bare { padding: 0; max-width: none; }
    `,
  ],
})
export class AppComponent {
  auth = inject(AuthService);
  tgLink = signal<string | null>(null);
  copied = signal(false);
  theme = signal<Theme>(this.readTheme());

  constructor() {
    effect(() => {
      const t = this.theme();
      document.documentElement.setAttribute('data-theme', t);
      try { localStorage.setItem('dt_theme', t); } catch { /* storage unavailable */ }
    });
    effect(() => {
      if (this.auth.isAuthenticated() && !this.auth.user()) {
        this.auth.loadUser().subscribe({ error: () => undefined });
      }
    });
  }

  private readTheme(): Theme {
    try { return localStorage.getItem('dt_theme') === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
  }

  themeLabel(): string {
    return this.theme() === 'dark' ? 'Увімкнути світлу тему' : 'Увімкнути темну тему';
  }

  toggleTheme(): void {
    this.theme.set(this.theme() === 'dark' ? 'light' : 'dark');
  }

  linkTelegram(): void {
    this.auth.generateTelegramLink().subscribe((r) => this.tgLink.set(r.deep_link));
  }

  copyLink(link: string): void {
    navigator.clipboard?.writeText(link).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1800);
    });
  }
}
