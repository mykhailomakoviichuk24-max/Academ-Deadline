import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { STATUSES, Subject, TASK_TYPES, Task } from '../../core/models';
import { Urgency, dayKey, progressClass, spanLabel, urgencyOf } from '../../core/task-utils';

interface DayCell {
  date: Date;
  key: string;
  inMonth: boolean;
  isToday: boolean;
  tasks: Task[];
}

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
const MAX_CHIPS = 3;

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [DatePipe, RouterLink],
  template: `
    <div class="toolbar">
      <div class="titles">
        <h2>Календар</h2>
        <span class="muted">
          Дедлайнів у місяці: {{ monthStats().total }}
          @if (monthStats().late) { · прострочено: {{ monthStats().late }} }
        </span>
      </div>
      <select class="filter" aria-label="Фільтр за предметом" [value]="subjectFilter()" (change)="subjectFilter.set($any($event.target).value)">
        <option value="">Усі предмети</option>
        @for (s of subjects(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }
      </select>
      <label class="check"><input type="checkbox" [checked]="hideDone()" (change)="hideDone.set($any($event.target).checked)" /> Сховати прийняті</label>
    </div>

    <div class="layout">
      <section class="card cal" aria-label="Календар дедлайнів">
        <div class="nav">
          <button class="icon-btn" (click)="shift(-1)" aria-label="Попередній місяць" title="Попередній місяць">
            <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <h3 class="month">{{ monthTitle() }}</h3>
          <button class="icon-btn" (click)="shift(1)" aria-label="Наступний місяць" title="Наступний місяць">
            <svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg>
          </button>
          <button class="today-btn" (click)="goToday()">Сьогодні</button>
        </div>

        <div class="weekdays" aria-hidden="true">
          @for (w of weekdays; track w) { <span>{{ w }}</span> }
        </div>

        <div class="grid">
          @for (c of cells(); track c.key) {
            <button
              class="day"
              [class.out]="!c.inMonth"
              [class.today]="c.isToday"
              [class.sel]="c.key === selected()"
              (click)="select(c)"
              [attr.aria-label]="dayLabel(c)"
              [attr.aria-pressed]="c.key === selected()"
            >
              <span class="num-day num">{{ c.date.getDate() }}</span>
              <span class="chips">
                @for (t of c.tasks.slice(0, maxChips); track t.id) {
                  <span class="chip u-{{ urgency(t) }}" [title]="t.title">
                    <i class="dot"></i><span class="txt">{{ t.title }}</span>
                  </span>
                }
                @if (c.tasks.length > maxChips) {
                  <span class="more">+{{ c.tasks.length - maxChips }} ще</span>
                }
              </span>
            </button>
          }
        </div>

        <div class="legend">
          <span><i class="dot u-calm"></i>спокійно</span>
          <span><i class="dot u-soon"></i>менше 3 днів</span>
          <span><i class="dot u-hot"></i>менше доби</span>
          <span><i class="dot u-late"></i>прострочено</span>
          <span><i class="dot u-done"></i>прийнято</span>
        </div>
      </section>

      <aside class="card details" aria-live="polite">
        @if (selectedCell(); as c) {
          <h3>{{ c.date | date: 'd.MM.yyyy' }} · {{ weekdayName(c.date) }}</h3>
          @if (c.tasks.length) {
            <ul>
              @for (t of c.tasks; track t.id) {
                <li class="item u-{{ urgency(t) }}">
                  <div class="top">
                    <strong>{{ t.title }}</strong>
                    <span class="time num">{{ t.deadline | date: 'HH:mm' }}</span>
                  </div>
                  <div class="meta">
                    <span>{{ subjectName(t.subject_id) }}</span>
                    <span class="pill">{{ typeLabel(t.task_type) }}</span>
                    <span class="pill st">{{ statusLabel(t.status) }}</span>
                  </div>
                  <div class="left">{{ timeLabel(t) }}</div>
                  @if (t.task_type === 'COURSEWORK') {
                    <div class="progress">
                      <div class="label"><span>Готовність</span><strong class="num">{{ t.progress }}%</strong></div>
                      <div class="track"><span class="fill {{ progressClass(t.progress) }}" [style.width.%]="t.progress"></span></div>
                    </div>
                  }
                </li>
              }
            </ul>
            <a routerLink="/kanban" class="to-board">Відкрити на дошці</a>
          } @else {
            <p class="muted">На цей день дедлайнів немає.</p>
          }
        } @else {
          <p class="muted">Оберіть день у календарі, щоб побачити завдання.</p>
        }
      </aside>
    </div>
  `,
  styles: [
    `
      .toolbar { display: flex; gap: 12px; align-items: center; margin-bottom: 20px; flex-wrap: wrap; }
      .titles { flex: 1; display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
      .titles h2 { margin: 0; }
      .filter { width: 220px; }
      .check { display: inline-flex; align-items: center; gap: 8px; color: var(--muted); font-size: 14px; cursor: pointer; }
      .check input { width: auto; margin: 0; }
      .check { white-space: nowrap; }

      .layout { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 16px; align-items: start; }
      @media (max-width: 1000px) { .layout { grid-template-columns: 1fr; } }

      .nav { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
      .month { flex: 1; margin: 0; text-align: center; font-size: 18px; text-transform: capitalize; }
      .today-btn { padding: 6px 14px; }

      .weekdays { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; margin-bottom: 6px; }
      .weekdays span { text-align: center; font-size: 12px; font-weight: 600; color: var(--muted); }

      .grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; }
      .day {
        display: flex; flex-direction: column; align-items: stretch; gap: 4px;
        min-height: 104px; padding: 6px; text-align: left; cursor: pointer;
        background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm);
        color: var(--text); font: inherit; overflow: hidden;
        transition: border-color 0.15s, background 0.15s;
      }
      .day:hover { border-color: var(--muted); }
      .day.out { opacity: 0.45; }
      .day.today .num-day { background: var(--accent); color: var(--accent-ink); border-radius: 99px; font-weight: 700; }
      .day.sel { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
      .num-day { align-self: flex-start; min-width: 24px; padding: 0 6px; text-align: center; font-size: 13px; line-height: 24px; }

      .chips { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
      .chip { display: flex; align-items: center; gap: 5px; min-width: 0; padding: 1px 6px; border-radius: 6px; font-size: 12px; line-height: 1.5; background: var(--surface); }
      .chip .txt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .more { font-size: 12px; color: var(--muted); padding-left: 6px; }

      .dot { display: inline-block; flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
      .u-calm .dot, .dot.u-calm { background: var(--accent); }
      .u-soon .dot, .dot.u-soon { background: var(--warn); }
      .u-hot .dot, .dot.u-hot { background: var(--danger); }
      .u-late .dot, .dot.u-late { background: var(--danger); box-shadow: 0 0 0 2px color-mix(in srgb, var(--danger) 35%, transparent); }
      .u-done .dot, .dot.u-done { background: var(--border); }
      .chip.u-done .txt { text-decoration: line-through; color: var(--muted); }

      .legend { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 14px; font-size: 13px; color: var(--muted); }
      .legend .dot { margin-right: 6px; }

      .details h3 { margin-bottom: 14px; }
      .details ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
      .item { position: relative; padding: 10px 12px 10px 16px; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); overflow: hidden; }
      .item::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--accent); }
      .item.u-soon::before { background: var(--warn); }
      .item.u-hot::before, .item.u-late::before { background: var(--danger); }
      .item.u-done::before { background: var(--border); }
      .top { display: flex; justify-content: space-between; gap: 8px; }
      .time { color: var(--muted); font-size: 13px; }
      .meta { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin: 4px 0; font-size: 13px; color: var(--muted); }
      .pill { border: 1px solid var(--border); border-radius: 99px; padding: 0 8px; font-size: 12px; }
      .left { font-size: 13px; font-weight: 600; color: var(--accent); }
      .item.u-soon .left { color: var(--warn); }
      .item.u-hot .left, .item.u-late .left { color: var(--danger); }
      .item.u-done .left { color: var(--muted); }
      .item .progress { margin-top: 8px; }
      .to-board { display: inline-block; margin-top: 12px; font-size: 14px; }

      @media (max-width: 640px) {
        .day { min-height: 58px; padding: 4px; }
        .chips { flex-direction: row; flex-wrap: wrap; gap: 3px; }
        .chip { padding: 0; background: transparent; }
        .chip .txt, .more { display: none; }
        .filter { width: 100%; }
      }
    `,
  ],
})
export class CalendarComponent {
  private api = inject(ApiService);

  readonly weekdays = WEEKDAYS;
  readonly maxChips = MAX_CHIPS;
  progressClass = progressClass;

  tasks = signal<Task[]>([]);
  subjects = signal<Subject[]>([]);
  subjectFilter = signal('');
  hideDone = signal(false);
  /** First day of the displayed month (local time). */
  month = signal(this.firstOfMonth(new Date()));
  selected = signal<string>(dayKey(new Date()));

  visible = computed(() =>
    this.tasks().filter(
      (t) =>
        (!this.subjectFilter() || t.subject_id === this.subjectFilter()) &&
        (!this.hideDone() || t.status !== 'ACCEPTED'),
    ),
  );

  /** Tasks grouped by local deadline day. */
  private byDay = computed(() => {
    const map = new Map<string, Task[]>();
    for (const t of this.visible()) {
      const key = dayKey(new Date(t.deadline));
      const list = map.get(key);
      if (list) list.push(t);
      else map.set(key, [t]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
    }
    return map;
  });

  /** 6 weeks x 7 days grid starting on Monday. */
  cells = computed<DayCell[]>(() => {
    const first = this.month();
    const offset = (first.getDay() + 6) % 7; // Monday = 0
    const todayKey = dayKey(new Date());
    const byDay = this.byDay();
    const out: DayCell[] = [];
    for (let i = 0; i < 42; i++) {
      const date = new Date(first.getFullYear(), first.getMonth(), 1 - offset + i);
      const key = dayKey(date);
      out.push({
        date,
        key,
        inMonth: date.getMonth() === first.getMonth(),
        isToday: key === todayKey,
        tasks: byDay.get(key) ?? [],
      });
    }
    return out;
  });

  selectedCell = computed(() => this.cells().find((c) => c.key === this.selected()) ?? null);

  monthStats = computed(() => {
    const cells = this.cells().filter((c) => c.inMonth);
    const tasks = cells.flatMap((c) => c.tasks);
    return { total: tasks.length, late: tasks.filter((t) => this.urgency(t) === 'late').length };
  });

  monthTitle = computed(() => {
    const m = this.month();
    return `${new Intl.DateTimeFormat('uk-UA', { month: 'long' }).format(m)} ${m.getFullYear()}`;
  });

  constructor() {
    this.api.listSubjects().subscribe((s) => this.subjects.set(s));
    this.api.listTasks().subscribe((t) => this.tasks.set(t));
  }

  private firstOfMonth(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  shift(delta: number): void {
    const m = this.month();
    this.month.set(new Date(m.getFullYear(), m.getMonth() + delta, 1));
  }

  goToday(): void {
    const now = new Date();
    this.month.set(this.firstOfMonth(now));
    this.selected.set(dayKey(now));
  }

  select(c: DayCell): void {
    this.selected.set(c.key);
    if (!c.inMonth) this.month.set(this.firstOfMonth(c.date)); // jump to that month
  }

  urgency(t: Task): Urgency { return urgencyOf(t); }
  subjectName(id: string): string { return this.subjects().find((s) => s.id === id)?.name ?? 'Без предмета'; }
  typeLabel(k: string): string { return TASK_TYPES.find((t) => t.key === k)?.label ?? k; }
  statusLabel(k: string): string { return STATUSES.find((s) => s.key === k)?.label ?? k; }
  weekdayName(d: Date): string { return new Intl.DateTimeFormat('uk-UA', { weekday: 'long' }).format(d); }

  timeLabel(t: Task): string {
    if (t.status === 'ACCEPTED') return 'Прийнято';
    const left = new Date(t.deadline).getTime() - Date.now();
    return left < 0 ? `Прострочено на ${spanLabel(left)}` : `Залишилось ${spanLabel(left)}`;
  }

  dayLabel(c: DayCell): string {
    const n = c.tasks.length;
    return `${c.date.getDate()} ${this.monthTitle()}, дедлайнів: ${n}`;
  }
}
