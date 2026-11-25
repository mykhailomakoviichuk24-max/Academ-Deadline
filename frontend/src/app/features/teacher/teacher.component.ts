import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { TYPE_COLOR } from '../../core/task-utils';
import {
  Group,
  Subject,
  PRIORITIES,
  STATUSES,
  StudentStats,
  TASK_TYPES,
  TaskPriority,
  TaskType,
  TeacherAnalytics,
  TeacherTask,
} from '../../core/models';

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

@Component({
  selector: 'app-teacher',
  standalone: true,
  imports: [ReactiveFormsModule, DatePipe],
  template: `
    <div class="toolbar">
      <div class="titles">
        <h2>Кабінет викладача</h2>
        <span class="muted">Групи, видані завдання та перевірка робіт</span>
      </div>
    </div>

    <div class="tabs" role="tablist">
      <button role="tab" [attr.aria-selected]="tab() === 'work'" [class.on]="tab() === 'work'" (click)="tab.set('work')">Групи і перевірка</button>
      <button role="tab" [attr.aria-selected]="tab() === 'stats'" [class.on]="tab() === 'stats'" (click)="openStats()">Аналітика</button>
    </div>

    @if (tab() === 'work') {
    <section class="card block">
      <h3>Групи</h3>
      <form class="inline" [formGroup]="groupForm" (ngSubmit)="createGroup()">
        <input formControlName="name" placeholder="Назва нової групи, напр. ІПЗ-31" aria-label="Назва групи" />
        <button class="primary" type="submit" [disabled]="groupForm.invalid">Створити групу</button>
      </form>

      <div class="groups">
        @for (g of groups(); track g.id) {
          <button class="group" [class.on]="g.id === selectedId()" (click)="select(g.id)">
            <strong>{{ g.name }}</strong>
            <span class="muted">{{ g.students_count }} студ.</span>
          </button>
        } @empty {
          <p class="muted">Груп ще немає. Створіть першу та передайте студентам її код.</p>
        }
      </div>

      @if (selected(); as g) {
        <div class="code">
          Код для студентів: <strong class="num">{{ g.invite_code }}</strong>
          <button (click)="copy(g.invite_code)">{{ copied() ? 'Скопійовано' : 'Копіювати' }}</button>
          <span class="muted">Студент вводить його під час реєстрації або кнопкою «Вступити в групу».</span>
        </div>
      }
    </section>

    @if (selected(); as g) {
      <section class="card block">
        <div class="row-head">
          <h3>Студенти групи {{ g.name }}</h3>
          <button class="primary" (click)="openAssign()" [disabled]="!students().length">Видати завдання</button>
        </div>
        @if (students().length) {
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>Студент</th><th class="n">Видано</th><th class="n">Прийнято</th><th class="n">На перевірці</th><th class="n">Прострочено</th><th class="n">Готовність</th><th></th></tr>
              </thead>
              <tbody>
                @for (s of students(); track s.id) {
                  <tr>
                    <td><strong>{{ s.full_name }}</strong><br /><span class="muted small">{{ s.email }}</span></td>
                    <td class="n num">{{ s.total_tasks }}</td>
                    <td class="n num">{{ s.accepted }}</td>
                    <td class="n num">{{ s.under_review }}</td>
                    <td class="n num" [class.late]="s.overdue > 0">{{ s.overdue }}</td>
                    <td class="n">
                      <div class="progress"><div class="track"><span class="fill" [style.width.%]="s.avg_progress"></span></div></div>
                      <span class="muted small num">{{ s.avg_progress }}%</span>
                    </td>
                    <td class="n"><button class="danger" (click)="removeStudent(s)">Прибрати</button></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <p class="muted">У групі ще немає студентів.</p>
        }
      </section>

      <section class="card block">
        <h3>Перевірка робіт <span class="count num">{{ queue().length }}</span></h3>
        @for (t of queue(); track t.id) {
          <article class="review">
            <div class="who">
              <strong>{{ t.title }}</strong>
              <span class="muted">{{ t.student_name }} · {{ t.subject_name }}</span>
              <span class="type-tag type-{{ t.task_type }}">{{ typeLabel(t.task_type) }}</span>
              <span class="muted small num">Дедлайн {{ t.deadline | date: 'dd.MM.yyyy, HH:mm' }}</span>
            </div>
            <textarea rows="2" placeholder="Коментар студенту (необов'язково)" [value]="notes()[t.id] ?? ''" (input)="setNote(t.id, $any($event.target).value)"></textarea>
            <div class="btns">
              <button class="primary" (click)="review(t, 'ACCEPTED')">Прийняти</button>
              <button (click)="review(t, 'REQUIRES_CHANGES')">На правки</button>
            </div>
          </article>
        } @empty {
          <p class="muted">Немає робіт, які чекають на перевірку.</p>
        }
      </section>

      <section class="card block">
        <h3>Усі видані завдання</h3>
        @if (tasks().length) {
          <div class="table-wrap">
            <table>
              <thead><tr><th>Завдання</th><th>Студент</th><th>Дедлайн</th><th>Статус</th><th class="n">Готовність</th><th></th></tr></thead>
              <tbody>
                @for (t of tasks(); track t.id) {
                  <tr>
                    <td class="type-bar type-{{ t.task_type }}"><strong>{{ t.title }}</strong><br /><span class="muted small">{{ t.subject_name }} · {{ typeLabel(t.task_type) }}</span></td>
                    <td>{{ t.student_name }}</td>
                    <td class="num">{{ t.deadline | date: 'dd.MM.yyyy, HH:mm' }}</td>
                    <td><span class="st st-{{ t.status }}">{{ statusLabel(t.status) }}</span>
                      @if (t.review_notes) { <br /><span class="muted small">{{ t.review_notes }}</span> }
                    </td>
                    <td class="n num">{{ t.progress }}%</td>
                    <td class="n"><button class="danger" (click)="cancel(t)">Скасувати</button></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <p class="muted">Ви ще не видавали завдань цій групі.</p>
        }
      </section>
    }

    } @else {
      <div class="a-head">
        <select aria-label="Група" [value]="statsGroup()" (change)="setStatsGroup($any($event.target).value)">
          <option value="">Усі групи</option>
          @for (g of groups(); track g.id) { <option [value]="g.id">{{ g.name }}</option> }
        </select>
        <select aria-label="Горизонт навантаження" [value]="days()" (change)="setDays(+$any($event.target).value)">
          <option value="7">Навантаження: 7 днів</option>
          <option value="14">Навантаження: 14 днів</option>
          <option value="30">Навантаження: 30 днів</option>
        </select>
      </div>

      @if (an(); as a) {
        <div class="kpis">
          <div class="card kpi"><span class="muted">Студентів</span><strong class="num">{{ a.students_count }}</strong></div>
          <div class="card kpi"><span class="muted">Видано завдань</span><strong class="num">{{ a.tasks_total }}</strong></div>
          <div class="card kpi"><span class="muted">Прийнято</span><strong class="num">{{ a.completion_percent }}%</strong></div>
          <div class="card kpi"><span class="muted">Середня готовність</span><strong class="num">{{ a.avg_progress }}%</strong></div>
          <div class="card kpi" [class.bad]="a.overdue > 0"><span class="muted">Прострочено</span><strong class="num">{{ a.overdue }}</strong></div>
          <div class="card kpi"><span class="muted">Чекають перевірки</span><strong class="num">{{ a.review_queue }}</strong></div>
        </div>

        @if (!a.tasks_total) {
          <div class="card block"><p class="muted">Ще немає виданих завдань: аналітика з'явиться після першої видачі.</p></div>
        } @else {
          <section class="card block">
            <h3>Статуси завдань</h3>
            <div class="stack" role="img" [attr.aria-label]="'Розподіл завдань за статусами'">
              @for (s of statusSegs(); track s.key) {
                @if (s.count) { <span class="seg seg-{{ s.key }}" [style.flex-grow]="s.count" [title]="s.label + ': ' + s.count"></span> }
              }
            </div>
            <ul class="legend-list">
              @for (s of statusSegs(); track s.key) {
                <li><i class="seg-dot seg-{{ s.key }}"></i>{{ s.label }} <strong class="num">{{ s.count }}</strong></li>
              }
            </ul>
          </section>

          <div class="two">
            <section class="card block">
              <h3>За типом роботи</h3>
              @for (t of a.by_type; track t.key) {
                <div class="trow">
                  <div class="trow-head">
                    <span class="type-tag type-{{ t.key }}">{{ typeLabel(t.key) }}</span>
                    <span class="muted small num">прийнято {{ t.accepted }} з {{ t.total }} · готовність {{ t.avg_progress }}%</span>
                  </div>
                  <div class="progress"><div class="track"><span class="fill" [style.width.%]="t.avg_progress" [style.background]="typeColor(t.key)"></span></div></div>
                </div>
              }
            </section>

            <section class="card block">
              <h3>Навантаження групи</h3>
              <div class="bars" role="img" aria-label="Години роботи за днями дедлайнів">
                @for (d of a.load; track d.date) {
                  <div class="bar-col" [title]="d.date + ': ' + d.hours + ' год, ' + d.tasks + ' завд., ' + d.hours_per_student + ' год на студента'">
                    <span class="bar risk-{{ d.risk }}" [style.height.%]="barHeight(d.hours)"></span>
                    <span class="bar-lbl num">{{ dayNum(d.date) }}</span>
                  </div>
                }
              </div>
              @if (a.busiest_day; as b) {
                <p class="muted small">Найщільніший день: {{ b.date | date: 'dd.MM' }}, {{ b.hours }} год на групу ({{ b.hours_per_student }} год на студента, ризик {{ riskLabel(b.risk) }}). Колір стовпця — ризик за годинами на одного студента.</p>
              } @else {
                <p class="muted small">У цьому періоді немає дедлайнів із невиконаною роботою.</p>
              }
            </section>
          </div>

          <section class="card block">
            <h3>За предметами</h3>
            <div class="table-wrap">
              <table>
                <thead><tr><th>Предмет</th><th class="n">Видано</th><th class="n">Прийнято</th><th class="n">Прострочено</th><th class="n">Готовність</th></tr></thead>
                <tbody>
                  @for (s of a.by_subject; track s.subject) {
                    <tr>
                      <td><strong>{{ s.subject }}</strong></td>
                      <td class="n num">{{ s.total }}</td>
                      <td class="n num">{{ s.accepted }}</td>
                      <td class="n num" [class.late]="s.overdue > 0">{{ s.overdue }}</td>
                      <td class="n num">{{ s.avg_progress }}%</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>

          <section class="card block">
            <h3>Студенти: найпроблемніші зверху</h3>
            <div class="table-wrap">
              <table>
                <thead><tr><th>Студент</th><th class="n">Видано</th><th class="n">Прийнято</th><th class="n">На перевірці</th><th class="n">Прострочено</th><th class="n">Готовність</th></tr></thead>
                <tbody>
                  @for (s of a.students; track s.id) {
                    <tr>
                      <td><strong>{{ s.full_name }}</strong><br /><span class="muted small">{{ s.email }}</span></td>
                      <td class="n num">{{ s.total_tasks }}</td>
                      <td class="n num">{{ s.accepted }}</td>
                      <td class="n num">{{ s.under_review }}</td>
                      <td class="n num" [class.late]="s.overdue > 0">{{ s.overdue }}</td>
                      <td class="n">
                        <div class="progress"><div class="track"><span class="fill" [style.width.%]="s.avg_progress"></span></div></div>
                        <span class="muted small num">{{ s.avg_progress }}%</span>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        }
      }
    }

    @if (assignOpen()) {
      <div class="backdrop" (click)="assignOpen.set(false)">
        <form class="card modal" [formGroup]="assignForm" (ngSubmit)="assign()" (click)="$event.stopPropagation()" role="dialog" aria-modal="true">
          <h3>Нове завдання для групи {{ selected()?.name }}</h3>
          <div class="field"><label for="a-title">Назва</label><input id="a-title" formControlName="title" /></div>
          <div class="grid-2">
            <div class="field">
              <label for="a-subject">Предмет</label>
              <select id="a-subject" formControlName="subject_name">
                @for (s of subjects(); track s.id) { <option [value]="s.name">{{ s.name }}</option> }
              </select>
              @if (!subjects().length) { <span class="muted small">Спершу додайте предмет у вкладці «Предмети».</span> }
            </div>
            <div class="field">
              <label for="a-type">Тип роботи</label>
              <select id="a-type" formControlName="task_type">
                @for (t of types; track t.key) { <option [value]="t.key">{{ t.label }}</option> }
              </select>
            </div>
            <div class="field"><label for="a-deadline">Дедлайн</label><input id="a-deadline" type="datetime-local" formControlName="deadline" /></div>
            <div class="field"><label for="a-hours">Оцінка, годин</label><input id="a-hours" type="number" step="0.5" min="0.5" formControlName="estimated_hours" /></div>
            <div class="field">
              <label for="a-prio">Пріоритет</label>
              <select id="a-prio" formControlName="priority">
                @for (p of priorities; track p.key) { <option [value]="p.key">{{ p.label }}</option> }
              </select>
            </div>
          </div>
          <div class="field"><label for="a-desc">Опис</label><textarea id="a-desc" rows="3" formControlName="description"></textarea></div>

          <fieldset class="who-list">
            <legend>Кому видати</legend>
            <label class="check"><input type="checkbox" [checked]="allSelected()" (change)="toggleAll($any($event.target).checked)" /> Уся група ({{ students().length }})</label>
            @for (s of students(); track s.id) {
              <label class="check"><input type="checkbox" [checked]="recipients().has(s.id)" (change)="toggleOne(s.id, $any($event.target).checked)" /> {{ s.full_name }}</label>
            }
          </fieldset>

          @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
          <div class="modal-actions">
            <button type="button" (click)="assignOpen.set(false)">Скасувати</button>
            <button class="primary" type="submit" [disabled]="assignForm.invalid || !recipients().size">Видати</button>
          </div>
        </form>
      </div>
    }
  `,
  styles: [
    `
      .tabs { display: inline-flex; gap: 6px; padding: 4px; margin-bottom: 18px; border-radius: 99px; background: var(--surface); border: 1px solid var(--border); }
      .tabs button { border: 0; border-radius: 99px; background: transparent; color: var(--muted); }
      .tabs button.on { background: var(--accent); color: var(--accent-ink); font-weight: 600; }
      .a-head { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }
      .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 18px; }
      .kpi { padding: 14px 16px; display: grid; gap: 4px; }
      .kpi strong { font-size: 26px; }
      .kpi.bad strong { color: var(--danger); }
      .two { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
      .two .block { margin-bottom: 18px; }
      .stack { display: flex; height: 18px; border-radius: 99px; overflow: hidden; background: var(--surface-2); gap: 2px; }
      .seg { flex-basis: 0; }
      .seg-TODO { background: var(--muted); }
      .seg-IN_PROGRESS { background: var(--info); }
      .seg-UNDER_REVIEW { background: var(--violet); }
      .seg-REQUIRES_CHANGES { background: var(--warn); }
      .seg-ACCEPTED { background: var(--accent); }
      .seg-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; }
      .legend-list { list-style: none; margin: 12px 0 0; padding: 0; display: flex; gap: 8px 18px; flex-wrap: wrap; font-size: 13px; }
      .trow { margin-bottom: 14px; }
      .trow-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 6px; }
      .bars { display: flex; align-items: flex-end; gap: 4px; height: 150px; padding-top: 8px; }
      .bar-col { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; height: 100%; min-width: 0; }
      .bar { width: 100%; max-width: 22px; min-height: 3px; border-radius: 4px 4px 0 0; }
      .risk-LOW { background: var(--accent); }
      .risk-MEDIUM { background: var(--warn); }
      .risk-HIGH { background: var(--danger); }
      .bar-lbl { font-size: 10px; color: var(--muted); margin-top: 4px; }
      .toolbar { display: flex; align-items: end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 20px; }
      .titles h2 { margin: 0; }
      .block { padding: 20px; margin-bottom: 18px; }
      .block h3 { margin: 0 0 14px; font-size: 17px; display: flex; align-items: center; gap: 10px; }
      .count { font-size: 12px; padding: 2px 9px; border-radius: 99px; background: var(--surface-2); color: var(--muted); }
      .row-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
      .row-head h3 { margin: 0; }
      .inline { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
      .inline input { flex: 1; min-width: 220px; }
      .groups { display: flex; gap: 10px; flex-wrap: wrap; }
      .group { display: grid; gap: 2px; text-align: left; padding: 10px 16px; border-radius: var(--radius-sm); }
      .group.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, var(--surface)); }
      .code { margin-top: 14px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; font-size: 14px; }
      .code strong { font-size: 18px; letter-spacing: 0.12em; padding: 3px 12px; border-radius: 8px; background: var(--surface-2); border: 1px solid var(--border); }
      .table-wrap { overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 14px; }
      th, td { padding: 10px 12px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; }
      th { font-size: 12px; font-weight: 600; color: var(--muted); }
      .n { text-align: right; white-space: nowrap; }
      .late { color: var(--danger); font-weight: 600; }
      .small { font-size: 12px; }
      .progress { min-width: 90px; }
      .st { font-size: 12px; font-weight: 600; padding: 2px 10px; border-radius: 99px; background: var(--surface-2); white-space: nowrap; }
      .st-ACCEPTED { color: var(--accent); }
      .st-UNDER_REVIEW { color: var(--info); }
      .st-REQUIRES_CHANGES { color: var(--warn); }
      .review { display: grid; grid-template-columns: 1.2fr 1.4fr auto; gap: 14px; align-items: start; padding: 14px 0; border-bottom: 1px solid var(--border); }
      .review:last-child { border-bottom: 0; }
      .review .who { display: grid; gap: 2px; }
      .btns { display: flex; gap: 8px; flex-wrap: wrap; }
      .who-list { border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px 14px; margin: 0 0 14px; display: grid; gap: 6px; max-height: 180px; overflow: auto; }
      .who-list legend { font-size: 13px; color: var(--muted); padding: 0 6px; }
      .check { display: flex; gap: 8px; align-items: center; margin: 0; color: var(--text); font-size: 14px; }
      .check input { width: auto; }
      .backdrop { position: fixed; inset: 0; background: var(--overlay); display: grid; place-items: center; padding: 16px; z-index: 20; }
      .modal { width: 100%; max-width: 580px; max-height: 92vh; overflow: auto; padding: 22px; }
      .modal h3 { font-size: 18px; margin-bottom: 16px; }
      .modal-actions { display: flex; justify-content: flex-end; gap: 10px; }
      @media (max-width: 860px) {
        .review { grid-template-columns: 1fr; }
        .two { grid-template-columns: 1fr; }
      }
    `,
  ],
})
export class TeacherComponent {
  private api = inject(ApiService);
  private fb = inject(FormBuilder);

  readonly types = TASK_TYPES;
  readonly priorities = PRIORITIES;

  tab = signal<'work' | 'stats'>('work');
  statsGroup = signal('');
  days = signal(14);
  an = signal<TeacherAnalytics | null>(null);
  statusSegs = computed(() => {
    const by = this.an()?.by_status ?? {};
    return STATUSES.map((s) => ({ key: s.key, label: s.label, count: by[s.key] ?? 0 }));
  });
  maxHours = computed(() => Math.max(1, ...(this.an()?.load ?? []).map((d) => d.hours)));
  groups = signal<Group[]>([]);
  subjects = signal<Subject[]>([]);
  selectedId = signal<string | null>(null);
  students = signal<StudentStats[]>([]);
  tasks = signal<TeacherTask[]>([]);
  notes = signal<Record<string, string>>({});
  assignOpen = signal(false);
  recipients = signal<Set<string>>(new Set());
  error = signal('');
  copied = signal(false);

  selected = computed(() => this.groups().find((g) => g.id === this.selectedId()) ?? null);
  queue = computed(() => this.tasks().filter((t) => t.status === 'UNDER_REVIEW'));
  allSelected = computed(
    () => this.students().length > 0 && this.recipients().size === this.students().length,
  );

  groupForm = this.fb.nonNullable.group({ name: ['', [Validators.required, Validators.maxLength(255)]] });
  assignForm = this.fb.nonNullable.group({
    title: ['', Validators.required],
    subject_name: ['', Validators.required],
    task_type: ['LABORATORY' as TaskType, Validators.required],
    deadline: [toLocalInput(new Date(Date.now() + 7 * 86400000)), Validators.required],
    estimated_hours: [2, [Validators.required, Validators.min(0.5)]],
    priority: ['MEDIUM' as TaskPriority, Validators.required],
    description: [''],
  });

  constructor() {
    this.loadGroups();
  }

  typeColor(k: string): string { return TYPE_COLOR[k] ?? 'var(--accent)'; }
  barHeight(h: number): number { return (h / this.maxHours()) * 100; }
  dayNum(date: string): string { return String(+date.slice(8, 10)); }
  riskLabel(r: string): string { return r === 'HIGH' ? 'високий' : r === 'MEDIUM' ? 'середній' : 'низький'; }

  openStats(): void {
    this.tab.set('stats');
    this.loadStats();
  }
  setStatsGroup(id: string): void { this.statsGroup.set(id); this.loadStats(); }
  setDays(n: number): void { this.days.set(n); this.loadStats(); }
  loadStats(): void {
    this.api.teacherAnalytics(this.statsGroup() || undefined, this.days()).subscribe((a) => this.an.set(a));
  }

  typeLabel(k: string): string {
    return TASK_TYPES.find((t) => t.key === k)?.label ?? k;
  }
  statusLabel(k: string): string {
    return STATUSES.find((s) => s.key === k)?.label ?? k;
  }

  // ---- groups ----
  loadGroups(selectId?: string): void {
    this.api.teacherGroups().subscribe((gs) => {
      this.groups.set(gs);
      const keep = selectId ?? this.selectedId();
      const target = gs.find((g) => g.id === keep) ?? gs[0];
      if (target) this.select(target.id);
    });
  }

  createGroup(): void {
    if (this.groupForm.invalid) return;
    this.api.createGroup(this.groupForm.getRawValue().name.trim()).subscribe((g) => {
      this.groupForm.reset({ name: '' });
      this.loadGroups(g.id);
    });
  }

  select(id: string): void {
    this.selectedId.set(id);
    this.reloadGroup();
  }

  reloadGroup(): void {
    const id = this.selectedId();
    if (!id) return;
    this.api.groupStudents(id).subscribe((s) => this.students.set(s));
    this.api.teacherTasks({ group_id: id }).subscribe((t) => this.tasks.set(t));
    this.api.teacherGroups().subscribe((gs) => this.groups.set(gs));
  }

  copy(code: string): void {
    navigator.clipboard?.writeText(code).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1800);
    });
  }

  removeStudent(s: StudentStats): void {
    const id = this.selectedId();
    if (!id || !confirm(`Прибрати ${s.full_name} з групи? Видані завдання залишаться в студента.`)) return;
    this.api.removeStudent(id, s.id).subscribe(() => this.reloadGroup());
  }

  // ---- assigning ----
  openAssign(): void {
    this.error.set('');
    this.api.listSubjects().subscribe((s) => {
      this.subjects.set(s);
      if (s.length && !this.assignForm.controls.subject_name.value) {
        this.assignForm.controls.subject_name.setValue(s[0].name);
      }
    });
    this.recipients.set(new Set(this.students().map((s) => s.id)));
    this.assignOpen.set(true);
  }
  toggleAll(on: boolean): void {
    this.recipients.set(on ? new Set(this.students().map((s) => s.id)) : new Set());
  }
  toggleOne(id: string, on: boolean): void {
    const next = new Set(this.recipients());
    if (on) next.add(id); else next.delete(id);
    this.recipients.set(next);
  }

  assign(): void {
    const groupId = this.selectedId();
    if (!groupId || this.assignForm.invalid || !this.recipients().size) return;
    const v = this.assignForm.getRawValue();
    this.api
      .assign({
        group_id: groupId,
        subject_name: v.subject_name.trim(),
        title: v.title.trim(),
        task_type: v.task_type,
        description: v.description || null,
        deadline: new Date(v.deadline).toISOString(),
        estimated_hours: v.estimated_hours,
        priority: v.priority,
        student_ids: this.allSelected() ? null : [...this.recipients()],
      })
      .subscribe({
        next: () => {
          this.assignOpen.set(false);
          this.reloadGroup();
        },
        error: (e) =>
          this.error.set(typeof e.error?.detail === 'string' ? e.error.detail : 'Не вдалося видати завдання.'),
      });
  }

  // ---- review ----
  setNote(id: string, text: string): void {
    this.notes.set({ ...this.notes(), [id]: text });
  }

  review(t: TeacherTask, status: 'ACCEPTED' | 'REQUIRES_CHANGES'): void {
    const note = (this.notes()[t.id] ?? '').trim() || null;
    this.api.reviewTask(t.id, status, note).subscribe(() => this.reloadGroup());
  }

  cancel(t: TeacherTask): void {
    if (!confirm(`Скасувати завдання «${t.title}» для ${t.student_name}?`)) return;
    this.api.cancelAssignedTask(t.id).subscribe(() => this.reloadGroup());
  }
}
