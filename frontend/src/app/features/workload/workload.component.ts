import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { Workload } from '../../core/models';

type Range = 'day' | 'week' | 'month';

@Component({
  selector: 'app-workload',
  standalone: true,
  imports: [DatePipe],
  template: `
    <div class="toolbar">
      <h2>Навантаження</h2>
      <div class="seg" role="group" aria-label="Період">
        @for (r of ranges; track r.key) {
          <button [class.on]="range() === r.key" [attr.aria-pressed]="range() === r.key" (click)="setRange(r.key)">{{ r.label }}</button>
        }
      </div>
    </div>

    @if (data(); as d) {
      <div class="summary">
        <div class="card stat">
          <span class="muted">Годин роботи</span>
          <strong class="num">{{ d.total_hours }}</strong>
        </div>
        <div class="card stat">
          <span class="muted">Завдань із дедлайном</span>
          <strong class="num">{{ d.total_tasks }}</strong>
        </div>
        <div class="card stat risk-{{ d.overall_risk }}">
          <span class="muted">Рівень ризику</span>
          <strong class="level">{{ riskLabel(d.overall_risk) }}</strong>
        </div>
      </div>

      <div class="card note" [class.warn]="d.burnout_warning" role="status">
        @if (d.burnout_warning) { <strong>Є ризик вигорання.</strong> }
        {{ d.message }}
      </div>

      <div class="card chart">
        <h3>Годин на день</h3>
        <div class="bars">
          @for (day of d.days; track day.date) {
            <div class="col" [title]="day.tasks_count + ' завд., ' + day.total_hours + ' год'">
              <span class="val num">{{ day.total_hours || '' }}</span>
              <div class="bar risk-{{ day.risk }}" [style.height.%]="barHeight(day.total_hours)"></div>
              <span class="lbl num">{{ day.date | date: 'dd.MM' }}</span>
            </div>
          }
        </div>
        <div class="legend">
          <span><i class="key risk-LOW"></i>до 4 год</span>
          <span><i class="key risk-MEDIUM"></i>4–8 год</span>
          <span><i class="key risk-HIGH"></i>від 8 год</span>
        </div>
      </div>
    } @else {
      <p class="muted">Рахуємо навантаження…</p>
    }
  `,
  styles: [
    `
      .toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
      .toolbar h2 { margin: 0; }
      .seg { display: inline-flex; padding: 3px; gap: 2px; border: 1px solid var(--border); border-radius: 99px; background: var(--surface); }
      .seg button { border: 0; background: transparent; border-radius: 99px; padding: 6px 16px; color: var(--muted); }
      .seg button.on { background: var(--accent); color: var(--accent-ink); font-weight: 600; }

      .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 12px; }
      @media (max-width: 640px) { .summary { grid-template-columns: 1fr; } }
      .stat { display: grid; gap: 4px; }
      .stat strong { font-size: 34px; font-weight: 700; line-height: 1.1; letter-spacing: -0.02em; }
      .stat .level { font-size: 26px; }
      .stat.risk-LOW .level { color: var(--accent); }
      .stat.risk-MEDIUM .level { color: var(--warn); }
      .stat.risk-HIGH .level { color: var(--danger); }

      .note { margin-bottom: 12px; }
      .note.warn { border-color: var(--danger); background: color-mix(in srgb, var(--danger) 9%, var(--surface)); }

      .bars { display: flex; gap: 6px; align-items: flex-end; height: 240px; margin-top: 8px; overflow-x: auto; }
      .col { flex: 1; min-width: 28px; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 6px; }
      .bar { width: 100%; max-width: 44px; border-radius: 6px 6px 2px 2px; min-height: 3px; transition: height 0.3s; }
      .val, .lbl { font-size: 12px; color: var(--muted); min-height: 16px; }
      .bar.risk-LOW, .key.risk-LOW { background: var(--accent); }
      .bar.risk-MEDIUM, .key.risk-MEDIUM { background: var(--warn); }
      .bar.risk-HIGH, .key.risk-HIGH { background: var(--danger); }

      .legend { display: flex; gap: 18px; margin-top: 14px; font-size: 13px; color: var(--muted); flex-wrap: wrap; }
      .key { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; }
    `,
  ],
})
export class WorkloadComponent {
  private api = inject(ApiService);

  ranges: { key: Range; label: string }[] = [
    { key: 'day', label: 'День' },
    { key: 'week', label: 'Тиждень' },
    { key: 'month', label: 'Місяць' },
  ];
  range = signal<Range>('week');
  data = signal<Workload | null>(null);
  maxHours = computed(() => Math.max(8, ...(this.data()?.days.map((d) => d.total_hours) ?? [0])));

  constructor() { this.load(); }

  setRange(r: Range): void { this.range.set(r); this.load(); }
  load(): void { this.api.workload(this.range()).subscribe((d) => this.data.set(d)); }
  barHeight(h: number): number { return Math.min(100, (h / this.maxHours()) * 78); }
  riskLabel(r: string): string { return ({ LOW: 'Низький', MEDIUM: 'Середній', HIGH: 'Високий' } as Record<string, string>)[r]; }
}
