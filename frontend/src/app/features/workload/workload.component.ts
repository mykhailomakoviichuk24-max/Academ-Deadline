import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import {
  BreakdownItem,
  DayWorkload,
  PRIORITIES,
  ReviewStatus,
  STATUSES,
  TASK_TYPES,
  TaskBrief,
  Workload,
} from '../../core/models';
import { progressClass, spanLabel, TYPE_COLOR } from '../../core/task-utils';

type Range = 'day' | 'week' | 'month';

@Component({
  selector: 'app-workload',
  standalone: true,
  imports: [DatePipe, NgTemplateOutlet],
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
        <div class="card stat">
          <span class="muted">Середнє на день</span>
          <strong class="num">{{ d.avg_hours_per_day }}<small> год</small></strong>
        </div>
        <div class="card stat">
          <span class="muted">Найзавантаженіший день</span>
          @if (d.busiest_day; as b) {
            <strong class="num">{{ b.date | date: 'dd.MM' }}<small> · {{ b.total_hours }} год</small></strong>
          } @else {
            <strong class="num">—</strong>
          }
        </div>
        <div class="card stat">
          <span class="muted">Днів без дедлайнів</span>
          <strong class="num">{{ d.free_days }}<small> з {{ d.days.length }}</small></strong>
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
            <div class="col" [title]="dayTitle(day)">
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

      <div class="two">
        <section class="card">
          <h3>Прострочені <span class="count num">{{ d.overdue.length }}</span></h3>
          @if (d.overdue.length) {
            <ul class="tasks">
              @for (t of d.overdue; track t.id) { <ng-container *ngTemplateOutlet="brief; context: { $implicit: t }"></ng-container> }
            </ul>
          } @else {
            <p class="muted">Прострочених завдань немає.</p>
          }
        </section>

        <section class="card">
          <h3>Найближчі дедлайни</h3>
          @if (d.upcoming.length) {
            <ul class="tasks">
              @for (t of d.upcoming; track t.id) { <ng-container *ngTemplateOutlet="brief; context: { $implicit: t }"></ng-container> }
            </ul>
          } @else {
            <p class="muted">Найближчих дедлайнів немає.</p>
          }
        </section>
      </div>

      <section class="card block">
        <div class="head">
          <h3>Прогрес курсових робіт</h3>
          @if (d.coursework.length) {
            <span class="muted">Середня готовність: <strong class="num">{{ d.coursework_avg_progress }}%</strong></span>
          }
        </div>
        @if (d.coursework.length) {
          <ul class="cw-list">
            @for (t of d.coursework; track t.id) {
              <li>
                <div class="cw-top">
                  <strong>{{ t.title }}</strong>
                  <span class="muted">{{ t.subject }}</span>
                </div>
                <div class="progress">
                  <div class="track"><span class="fill {{ progressClass(t.progress) }}" [style.width.%]="t.progress"></span></div>
                  <div class="label">
                    <span>{{ t.deadline | date: 'dd.MM.yyyy' }} · {{ leftLabel(t) }}</span>
                    <strong class="num">{{ t.progress }}%</strong>
                  </div>
                </div>
              </li>
            }
          </ul>
        } @else {
          <p class="muted">Курсових робіт ще немає. Додайте завдання типу «Курсова» в Канбані та вказуйте готовність у відсотках.</p>
        }
      </section>

      @if (d.completion; as c) {
        <section class="card block">
          <h3>Виконання за весь час</h3>
          <div class="two inner">
            <div class="meter">
              <div class="progress">
                <div class="label"><span>Прийнято робіт</span><strong class="num">{{ c.accepted_tasks }} із {{ c.total_tasks }} ({{ c.completion_percent }}%)</strong></div>
                <div class="track"><span class="fill p-done" [style.width.%]="c.completion_percent"></span></div>
              </div>
              <div class="progress">
                <div class="label"><span>Готовність за годинами</span><strong class="num">{{ c.hours_done }} із {{ c.hours_total }} год ({{ c.progress_percent }}%)</strong></div>
                <div class="track"><span class="fill" [style.width.%]="c.progress_percent"></span></div>
              </div>
            </div>
            <div>
              <div class="stack" role="img" aria-label="Розподіл завдань за статусами">
                @for (s of statusParts(); track s.key) {
                  @if (s.count) { <span class="seg-{{ s.key }}" [style.flex-grow]="s.count" [title]="s.label + ': ' + s.count"></span> }
                }
              </div>
              <div class="legend">
                @for (s of statusParts(); track s.key) {
                  <span><i class="key seg-{{ s.key }}"></i>{{ s.label }}: <strong class="num">{{ s.count }}</strong></span>
                }
              </div>
            </div>
          </div>
        </section>
      }

      <div class="three">
        <ng-container *ngTemplateOutlet="breakdown; context: { title: 'За предметами', items: subjectItems(), tone: 'info' }"></ng-container>
        <ng-container *ngTemplateOutlet="breakdown; context: { title: 'За типом роботи', items: typeItems(), tone: 'violet' }"></ng-container>
        <ng-container *ngTemplateOutlet="breakdown; context: { title: 'За пріоритетом', items: prioItems(), tone: 'warn' }"></ng-container>
      </div>
    } @else {
      <p class="muted">Рахуємо навантаження…</p>
    }

    <ng-template #brief let-t>
      <li class="brief">
        <div class="top">
          <strong>{{ t.title }}</strong>
          @if (t.priority === 'HIGH' || t.priority === 'CRITICAL') {
            <span class="prio prio-{{ t.priority }}">{{ prioLabel(t.priority) }}</span>
          }
        </div>
        <div class="meta muted">{{ t.subject }} · <span class="type-tag type-{{ t.task_type }}">{{ typeLabel(t.task_type) }}</span> · {{ t.estimated_hours }} год</div>
        <div class="when">
          <span class="left" [class.late]="t.hours_left < 0">{{ leftLabel(t) }}</span>
          <span class="muted num">{{ t.deadline | date: 'dd.MM, HH:mm' }}</span>
        </div>
        @if (t.task_type === 'COURSEWORK') {
          <div class="progress">
            <div class="track"><span class="fill {{ progressClass(t.progress) }}" [style.width.%]="t.progress"></span></div>
            <div class="label"><span>Готовність</span><strong class="num">{{ t.progress }}%</strong></div>
          </div>
        }
      </li>
    </ng-template>

    <ng-template #breakdown let-title="title" let-items="items" let-tone="tone">
      <section class="card">
        <h3>{{ title }}</h3>
        @if (items.length) {
          <ul class="hbars">
            @for (i of items; track i.key) {
              <li>
                <div class="hb-top"><span>{{ i.label }}</span><span class="muted num">{{ i.hours }} год · {{ i.tasks }} завд.</span></div>
                <div class="progress"><div class="track"><span class="fill tone-{{ tone }}" [style.width.%]="share(i, items)" [style.background]="i.color ?? null"></span></div></div>
              </li>
            }
          </ul>
        } @else {
          <p class="muted">Немає даних за цей період.</p>
        }
      </section>
    </ng-template>
  `,
  styles: [
    `
      .toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
      .toolbar h2 { margin: 0; }
      .seg { display: inline-flex; padding: 3px; gap: 2px; border: 1px solid var(--border); border-radius: 99px; background: var(--surface); }
      .seg button { border: 0; background: transparent; border-radius: 99px; padding: 6px 16px; color: var(--muted); }
      .seg button.on { background: var(--accent); color: var(--accent-ink); font-weight: 600; }

      .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 12px; }
      @media (max-width: 760px) { .summary { grid-template-columns: repeat(2, 1fr); } }
      @media (max-width: 480px) { .summary { grid-template-columns: 1fr; } }
      .stat { display: grid; gap: 4px; align-content: start; }
      .stat strong { font-size: 30px; font-weight: 700; line-height: 1.1; letter-spacing: -0.02em; }
      .stat small { font-size: 14px; font-weight: 500; color: var(--muted); letter-spacing: 0; }
      .stat .level { font-size: 26px; }
      .stat.risk-LOW .level { color: var(--accent); }
      .stat.risk-MEDIUM .level { color: var(--warn); }
      .stat.risk-HIGH .level { color: var(--danger); }

      .note { margin-bottom: 12px; }
      .note.warn { border-color: var(--danger); background: color-mix(in srgb, var(--danger) 9%, var(--surface)); }

      .chart { margin-bottom: 12px; }
      .bars { display: flex; gap: 6px; align-items: flex-end; height: 240px; margin-top: 8px; overflow-x: auto; }
      .col { flex: 1; min-width: 28px; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 6px; }
      .bar { width: 100%; max-width: 44px; border-radius: 6px 6px 2px 2px; min-height: 3px; transition: height 0.3s; }
      .val, .lbl { font-size: 12px; color: var(--muted); min-height: 16px; }
      .bar.risk-LOW, .key.risk-LOW { background: var(--accent); }
      .bar.risk-MEDIUM, .key.risk-MEDIUM { background: var(--warn); }
      .bar.risk-HIGH, .key.risk-HIGH { background: var(--danger); }

      .legend { display: flex; gap: 18px; margin-top: 14px; font-size: 13px; color: var(--muted); flex-wrap: wrap; }
      .key { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; }

      .two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; align-items: start; }
      .two.inner { margin: 12px 0 0; align-items: center; }
      .three { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
      @media (max-width: 1000px) { .three { grid-template-columns: 1fr; } }
      @media (max-width: 800px) { .two { grid-template-columns: 1fr; } }
      .block { margin-bottom: 12px; }
      .head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
      .count { margin-left: 6px; color: var(--muted); font-weight: 500; font-size: 13px; }

      .tasks, .cw-list, .hbars { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
      .brief { padding: 10px 12px; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); }
      .top { display: flex; justify-content: space-between; gap: 8px; align-items: flex-start; }
      .meta { font-size: 13px; margin: 2px 0 6px; }
      .when { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; }
      .left { font-weight: 600; color: var(--accent); }
      .left.late { color: var(--danger); }
      .brief .progress { margin-top: 8px; }
      .prio { font-size: 12px; font-weight: 600; border-radius: 99px; padding: 0 9px; white-space: nowrap; }
      .prio-HIGH { color: var(--warn); background: color-mix(in srgb, var(--warn) 16%, transparent); }
      .prio-CRITICAL { color: var(--danger); background: color-mix(in srgb, var(--danger) 16%, transparent); }

      .cw-list li { padding: 10px 12px; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); }
      .cw-top { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }

      .meter { display: grid; gap: 16px; }
      .stack { display: flex; height: 14px; border-radius: 99px; overflow: hidden; background: var(--raised); }
      .stack span { min-width: 4px; }
      .seg-TODO { background: var(--muted); }
      .seg-IN_PROGRESS { background: var(--info); }
      .seg-UNDER_REVIEW { background: var(--violet); }
      .seg-REQUIRES_CHANGES { background: var(--danger); }
      .seg-ACCEPTED { background: var(--accent); }

      .hbars li { display: grid; gap: 4px; }
      .hb-top { display: flex; justify-content: space-between; gap: 8px; font-size: 14px; }
      .hb-top span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .hbars .fill.tone-info { background: var(--info); }
      .hbars .fill.tone-violet { background: var(--violet); }
      .hbars .fill.tone-warn { background: var(--warn); }
    `,
  ],
})
export class WorkloadComponent {
  private api = inject(ApiService);

  progressClass = progressClass;
  ranges: { key: Range; label: string }[] = [
    { key: 'day', label: 'День' },
    { key: 'week', label: 'Тиждень' },
    { key: 'month', label: 'Місяць' },
  ];
  range = signal<Range>('week');
  data = signal<Workload | null>(null);
  maxHours = computed(() => Math.max(8, ...(this.data()?.days.map((d) => d.total_hours) ?? [0])));

  subjectItems = computed<BreakdownItem[]>(() => this.data()?.by_subject ?? []);
  typeItems = computed<(BreakdownItem & { color?: string })[]>(() =>
    (this.data()?.by_type ?? []).map((i) => ({ ...i, label: this.typeLabel(i.key), color: TYPE_COLOR[i.key] })),
  );
  prioItems = computed<BreakdownItem[]>(() =>
    (this.data()?.by_priority ?? []).map((i) => ({ ...i, label: this.prioLabel(i.key) })),
  );
  statusParts = computed(() => {
    const by = this.data()?.completion?.by_status;
    return STATUSES.map((s) => ({ key: s.key, label: s.label, count: by?.[s.key as ReviewStatus] ?? 0 }));
  });

  constructor() { this.load(); }

  setRange(r: Range): void { this.range.set(r); this.load(); }
  load(): void { this.api.workload(this.range()).subscribe((d) => this.data.set(d)); }
  barHeight(h: number): number { return Math.min(100, (h / this.maxHours()) * 78); }
  riskLabel(r: string): string { return ({ LOW: 'Низький', MEDIUM: 'Середній', HIGH: 'Високий' } as Record<string, string>)[r]; }
  typeLabel(k: string): string { return TASK_TYPES.find((t) => t.key === k)?.label ?? k; }
  prioLabel(k: string): string { return PRIORITIES.find((p) => p.key === k)?.label ?? k; }

  /** Bar width relative to the largest item of the list. */
  share(item: BreakdownItem, items: BreakdownItem[]): number {
    const max = Math.max(...items.map((i) => i.hours), 0.0001);
    return Math.max(3, (item.hours / max) * 100);
  }

  leftLabel(t: Pick<TaskBrief, 'hours_left' | 'status'>): string {
    if (t.status === 'ACCEPTED') return 'Прийнято';
    const ms = t.hours_left * 3600 * 1000;
    return t.hours_left < 0 ? `Прострочено на ${spanLabel(ms)}` : `Залишилось ${spanLabel(ms)}`;
  }

  dayTitle(d: DayWorkload): string {
    const head = `${d.date}: ${d.tasks_count} завд., ${d.total_hours} год`;
    return d.titles.length ? `${head}\n${d.titles.join('\n')}` : head;
  }
}
