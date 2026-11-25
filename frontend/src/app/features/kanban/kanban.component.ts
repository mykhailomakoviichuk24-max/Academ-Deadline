import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TypeLegendComponent } from '../../core/type-legend.component';
import { ApiService } from '../../core/api.service';
import { progressClass } from '../../core/task-utils';
import {
  PRIORITIES,
  ReviewStatus,
  STATUSES,
  Subject,
  TASK_TYPES,
  Task,
  TaskInput,
} from '../../core/models';

type Urgency = 'done' | 'late' | 'hot' | 'soon' | 'calm';

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function span(ms: number): string {
  const mins = Math.floor(Math.abs(ms) / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d} д ${h} год`;
  if (h > 0) return `${h} год ${m} хв`;
  return `${Math.max(m, 1)} хв`;
}

@Component({
  selector: 'app-kanban',
  standalone: true,
  imports: [CdkDropListGroup, CdkDropList, CdkDrag, ReactiveFormsModule, DatePipe, TypeLegendComponent],
  template: `
    <div class="toolbar">
      <div class="titles">
        <h2>Канбан</h2>
        <span class="muted">Активних завдань: {{ activeCount() }}</span>
        <app-type-legend />
      </div>
      <select class="filter" aria-label="Фільтр за предметом" [value]="subjectFilter()" (change)="subjectFilter.set($any($event.target).value)">
        <option value="">Усі предмети</option>
        @for (s of subjects(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }
      </select>
      <button class="primary" (click)="openForm()" [disabled]="!subjects().length">Нове завдання</button>
    </div>

    @if (!subjects().length) {
      <div class="card hint">Предмети додає викладач: вони з'являться тут, коли вам видадуть перше завдання або додадуть предмет.</div>
    }

    <div class="board" cdkDropListGroup>
      @for (col of statuses; track col.key) {
        <section class="column" [attr.aria-label]="col.label">
          <h3><i class="dot dot-{{ col.key }}"></i>{{ col.label }}<span class="count num">{{ byStatus()[col.key].length }}</span></h3>
          <div class="list" cdkDropList [cdkDropListData]="col.key" (cdkDropListDropped)="drop($event)">
            @for (t of byStatus()[col.key]; track t.id) {
              <article class="task type-bar type-{{ t.task_type }} u-{{ urgency(t) }}" cdkDrag [cdkDragData]="t">
                <div class="head">
                  <strong class="title">{{ t.title }}</strong>
                  @if (t.priority === 'HIGH' || t.priority === 'CRITICAL') {
                    <span class="prio prio-{{ t.priority }}">{{ prioLabel(t.priority) }}</span>
                  }
                </div>

                @if (t.assigned_by) { <span class="from-teacher">Від викладача</span> }

                <div class="meta">
                  <span>{{ subjectName(t.subject_id) }}</span>
                  <span class="type-tag type-{{ t.task_type }}">{{ typeLabel(t.task_type) }}</span>
                </div>

                <div class="when">
                  <span class="left">{{ timeLabel(t) }}</span>
                  <span class="muted num">{{ t.deadline | date: 'dd.MM, HH:mm' }}</span>
                </div>
                <div class="muted small num">Оцінка: {{ t.estimated_hours }} год</div>

                @if (t.task_type === 'COURSEWORK') {
                  <div class="progress cw">
                    <div class="label"><span>Готовність курсової</span><strong class="num">{{ t.progress }}%</strong></div>
                    <div class="track" role="progressbar" aria-label="Готовність курсової" aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="t.progress">
                      <span class="fill {{ progressClass(t.progress) }}" [style.width.%]="t.progress"></span>
                    </div>
                    <div class="steps">
                      <button class="step" (click)="bumpProgress(t, -10)" [disabled]="t.progress <= 0">−10%</button>
                      <button class="step" (click)="bumpProgress(t, 10)" [disabled]="t.progress >= 100">+10%</button>
                    </div>
                  </div>
                }

                @if (t.review_notes) { <div class="notes">{{ t.review_notes }}</div> }

                <div class="actions">
                  <select [value]="t.status" aria-label="Статус" (change)="changeStatus(t, $any($event.target).value)">
                    @for (s of statuses; track s.key) {
                      <option [value]="s.key" [disabled]="!canSet(t, s.key)">{{ s.label }}</option>
                    }
                  </select>
                  @if (!t.assigned_by) {
                    <button class="icon-btn" (click)="openForm(t)" aria-label="Редагувати" title="Редагувати">
                      <svg viewBox="0 0 24 24"><path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16v4z" /></svg>
                    </button>
                    <button class="icon-btn danger" (click)="remove(t)" aria-label="Видалити" title="Видалити">
                      <svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
                    </button>
                  }
                </div>
              </article>
            } @empty {
              <div class="empty">Перетягніть сюди завдання</div>
            }
          </div>
        </section>
      }
    </div>

    @if (formOpen()) {
      <div class="backdrop" (click)="closeForm()">
        <form class="card modal" [formGroup]="form" (ngSubmit)="save()" (click)="$event.stopPropagation()" role="dialog" aria-modal="true">
          <h3>{{ editing() ? 'Редагування завдання' : 'Нове завдання' }}</h3>
          <div class="field"><label for="f-title">Назва</label><input id="f-title" formControlName="title" /></div>
          <div class="grid-2">
            <div class="field">
              <label for="f-subject">Предмет</label>
              <select id="f-subject" formControlName="subject_id">
                @for (s of subjects(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }
              </select>
            </div>
            <div class="field">
              <label for="f-type">Тип роботи</label>
              <select id="f-type" formControlName="task_type">
                @for (t of types; track t.key) { <option [value]="t.key">{{ t.label }}</option> }
              </select>
            </div>
            <div class="field"><label for="f-deadline">Дедлайн</label><input id="f-deadline" type="datetime-local" formControlName="deadline" /></div>
            <div class="field"><label for="f-hours">Оцінка, годин</label><input id="f-hours" type="number" step="0.5" min="0.5" formControlName="estimated_hours" /></div>
            <div class="field">
              <label for="f-prio">Пріоритет</label>
              <select id="f-prio" formControlName="priority">
                @for (p of priorities; track p.key) { <option [value]="p.key">{{ p.label }}</option> }
              </select>
            </div>
          </div>
          @if (form.controls.task_type.value === 'COURSEWORK') {
            <div class="field">
              <label for="f-progress">Готовність курсової: {{ form.controls.progress.value }}%</label>
              <input id="f-progress" type="range" min="0" max="100" step="5" formControlName="progress" />
            </div>
          }
          <div class="field"><label for="f-desc">Опис</label><textarea id="f-desc" rows="3" formControlName="description"></textarea></div>
          @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
          <div class="row end">
            <button type="button" (click)="closeForm()">Скасувати</button>
            <button class="primary" type="submit" [disabled]="form.invalid">Зберегти</button>
          </div>
        </form>
      </div>
    }

    @if (notesFor(); as pending) {
      <div class="backdrop" (click)="cancelNotes()">
        <div class="card modal small-modal" (click)="$event.stopPropagation()" role="dialog" aria-modal="true">
          <h3>Коментар викладача</h3>
          <p class="muted small">Завдання «{{ pending.task.title }}» перейде в статус «{{ statusLabel(pending.status) }}».</p>
          <textarea rows="4" #notes aria-label="Коментар" placeholder="Зауваження до роботи. Поле можна залишити порожнім.">{{ pending.task.review_notes }}</textarea>
          <div class="row end" style="margin-top: 14px">
            <button (click)="cancelNotes()">Скасувати</button>
            <button class="primary" (click)="confirmNotes(notes.value)">Зберегти</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .toolbar { display: flex; gap: 12px; align-items: center; margin-bottom: 20px; flex-wrap: wrap; }
      .titles { flex: 1; display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
      .titles h2 { margin: 0; }
      .filter { width: 220px; }
      .hint { margin-bottom: 16px; color: var(--muted); }

      .board { display: grid; grid-template-columns: repeat(5, minmax(250px, 1fr)); gap: 14px; overflow-x: auto; align-items: start; padding-bottom: 12px; }
      .column { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; }
      .column h3 { display: flex; align-items: center; gap: 8px; margin: 2px 4px 12px; font-size: 14px; }
      .count { margin-left: auto; color: var(--muted); font-weight: 500; font-size: 13px; }
      .dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; background: var(--muted); }
      .dot-IN_PROGRESS { background: var(--info); }
      .dot-UNDER_REVIEW { background: var(--violet); }
      .dot-REQUIRES_CHANGES { background: var(--danger); }
      .dot-ACCEPTED { background: var(--accent); }

      .list { min-height: 110px; display: flex; flex-direction: column; gap: 10px; border-radius: var(--radius-sm); }
      .empty { border: 1px dashed var(--border); border-radius: var(--radius-sm); padding: 28px 12px; text-align: center; color: var(--muted); font-size: 13px; }

      .task {
        position: relative;
        background: var(--surface-2);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        padding: 12px 12px 12px 16px;
        cursor: grab;
        overflow: hidden;
        transition: border-color 0.15s;
      }
      .task:hover { border-color: var(--muted); }
      .task::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--accent); }
      .task.u-calm::before { background: var(--accent); }
      .task.u-soon::before { background: var(--warn); }
      .task.u-hot::before { background: var(--danger); }
      .task.u-late::before { background: var(--danger); }
      .task.u-done::before { background: var(--border); }
      .task.u-done .title { color: var(--muted); }

      .head { display: flex; justify-content: space-between; gap: 8px; align-items: flex-start; }
      .title { font-weight: 600; line-height: 1.3; }
      .meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 6px 0 10px; font-size: 13px; color: var(--muted); }
      .type { border: 1px solid var(--border); border-radius: 99px; padding: 0 8px; font-size: 12px; }

      .when { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 13px; }
      .left { font-weight: 600; color: var(--accent); }
      .u-soon .left { color: var(--warn); }
      .u-hot .left, .u-late .left { color: var(--danger); }
      .u-done .left { color: var(--muted); }
      .small { font-size: 12px; margin-top: 2px; }

      .cw { margin-top: 10px; }
      .steps { display: flex; gap: 6px; margin-top: 4px; }
      .step { padding: 2px 10px; font-size: 12px; }

      .from-teacher { align-self: start; width: fit-content; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 99px; background: color-mix(in srgb, var(--violet) 18%, transparent); color: var(--violet); }
      .notes { margin-top: 10px; font-size: 13px; padding: 8px 10px; border-radius: 8px; background: var(--surface); border-left: 2px solid var(--violet); }

      .actions { display: flex; gap: 6px; margin-top: 12px; }
      .actions select { flex: 1; padding: 6px 8px; font-size: 13px; min-width: 0; }
      .actions .icon-btn { width: 32px; height: 32px; }

      .prio { font-size: 12px; font-weight: 600; border-radius: 99px; padding: 0 9px; white-space: nowrap; }
      .prio-HIGH { color: var(--warn); background: color-mix(in srgb, var(--warn) 16%, transparent); }
      .prio-CRITICAL { color: var(--danger); background: color-mix(in srgb, var(--danger) 16%, transparent); }

      .backdrop { position: fixed; inset: 0; background: var(--overlay); display: grid; place-items: center; padding: 16px; z-index: 20; }
      .modal { width: 100%; max-width: 560px; max-height: 92vh; overflow: auto; padding: 22px; }
      .small-modal { max-width: 440px; }
      .modal h3 { font-size: 18px; margin-bottom: 16px; }
    `,
  ],
})
export class KanbanComponent {
  private api = inject(ApiService);
  private fb = inject(FormBuilder);

  progressClass = progressClass;
  statuses = STATUSES;
  types = TASK_TYPES;
  priorities = PRIORITIES;

  tasks = signal<Task[]>([]);
  subjects = signal<Subject[]>([]);
  subjectFilter = signal('');
  formOpen = signal(false);
  editing = signal<Task | null>(null);
  error = signal('');
  notesFor = signal<{ task: Task; status: ReviewStatus } | null>(null);

  visible = computed(() =>
    this.tasks().filter((t) => !this.subjectFilter() || t.subject_id === this.subjectFilter()),
  );
  activeCount = computed(() => this.visible().filter((t) => t.status !== 'ACCEPTED').length);
  byStatus = computed(() => {
    const map = Object.fromEntries(STATUSES.map((s) => [s.key, [] as Task[]])) as Record<ReviewStatus, Task[]>;
    for (const t of this.visible()) map[t.status].push(t);
    return map;
  });

  form = this.fb.nonNullable.group({
    title: ['', Validators.required],
    subject_id: ['', Validators.required],
    task_type: ['LABORATORY', Validators.required],
    deadline: ['', Validators.required],
    estimated_hours: [2, [Validators.required, Validators.min(0.5)]],
    priority: ['MEDIUM', Validators.required],
    progress: [0, [Validators.min(0), Validators.max(100)]],
    description: [''],
  });

  constructor() {
    this.api.listSubjects().subscribe((s) => this.subjects.set(s));
    this.reload();
  }

  reload(): void {
    this.api.listTasks().subscribe((t) => this.tasks.set(t));
  }

  subjectName(id: string): string {
    return this.subjects().find((s) => s.id === id)?.name ?? 'Без предмета';
  }
  typeLabel(k: string): string { return TASK_TYPES.find((t) => t.key === k)?.label ?? k; }
  prioLabel(k: string): string { return PRIORITIES.find((p) => p.key === k)?.label ?? k; }
  statusLabel(k: string): string { return STATUSES.find((s) => s.key === k)?.label ?? k; }

  urgency(t: Task): Urgency {
    if (t.status === 'ACCEPTED') return 'done';
    const left = new Date(t.deadline).getTime() - Date.now();
    if (left < 0) return 'late';
    if (left < 24 * 3600 * 1000) return 'hot';
    if (left < 72 * 3600 * 1000) return 'soon';
    return 'calm';
  }

  timeLabel(t: Task): string {
    if (t.status === 'ACCEPTED') return 'Прийнято';
    const left = new Date(t.deadline).getTime() - Date.now();
    return left < 0 ? `Прострочено на ${span(left)}` : `Залишилось ${span(left)}`;
  }

  // ---- status changes ----
  drop(e: CdkDragDrop<ReviewStatus>): void {
    if (e.previousContainer === e.container) return;
    this.changeStatus(e.item.data as Task, e.container.data);
  }

  /** «Прийнято» і «Потребує правок» ставить лише викладач. */
  canSet(task: Task, status: ReviewStatus): boolean {
    if (status === task.status) return true;
    if (task.status === 'ACCEPTED') return false;
    return status !== 'ACCEPTED' && status !== 'REQUIRES_CHANGES';
  }

  changeStatus(task: Task, status: ReviewStatus): void {
    if (!this.canSet(task, status)) { this.tasks.set([...this.tasks()]); return; }
    if (task.status === status) return;
    if (status === 'REQUIRES_CHANGES' || status === 'UNDER_REVIEW') {
      this.notesFor.set({ task, status });
      this.reload(); // keep the card where it was until the note is confirmed
      return;
    }
    this.applyStatus(task, status);
  }

  confirmNotes(notes: string): void {
    const p = this.notesFor();
    if (!p) return;
    this.applyStatus(p.task, p.status, notes.trim() || null);
    this.notesFor.set(null);
  }
  cancelNotes(): void { this.notesFor.set(null); }

  private applyStatus(task: Task, status: ReviewStatus, review_notes?: string | null): void {
    const prev = this.tasks();
    this.tasks.set(
      prev.map((t) => (t.id === task.id ? { ...t, status, progress: status === 'ACCEPTED' ? 100 : t.progress } : t)),
    );
    this.api.updateTaskStatus(task.id, { status, review_notes }).subscribe({
      next: (updated) => this.tasks.set(this.tasks().map((t) => (t.id === updated.id ? updated : t))),
      error: () => this.tasks.set(prev),
    });
  }

  // ---- coursework progress (quick +/-10% buttons on the card) ----
  bumpProgress(task: Task, delta: number): void {
    this.setProgress(task, Math.min(100, Math.max(0, task.progress + delta)));
  }

  private setProgress(task: Task, progress: number): void {
    const prev = this.tasks();
    this.tasks.set(prev.map((t) => (t.id === task.id ? { ...t, progress } : t)));  // optimistic
    this.api.updateTaskProgress(task.id, progress).subscribe({
      next: (updated) => this.tasks.set(this.tasks().map((t) => (t.id === updated.id ? updated : t))),
      error: () => this.tasks.set(prev),  // rollback
    });
  }

  // ---- create / edit ----
  openForm(task?: Task): void {
    this.error.set('');
    this.editing.set(task ?? null);
    if (task) {
      this.form.reset({
        title: task.title,
        subject_id: task.subject_id,
        task_type: task.task_type,
        deadline: toLocalInput(task.deadline),
        estimated_hours: task.estimated_hours,
        priority: task.priority,
        progress: task.progress ?? 0,
        description: task.description ?? '',
      });
    } else {
      const tomorrow = new Date(Date.now() + 86400000).toISOString();
      this.form.reset({
        title: '',
        subject_id: this.subjectFilter() || this.subjects()[0]?.id || '',
        task_type: 'LABORATORY',
        deadline: toLocalInput(tomorrow),
        estimated_hours: 2,
        priority: 'MEDIUM',
        progress: 0,
        description: '',
      });
    }
    this.formOpen.set(true);
  }
  closeForm(): void { this.formOpen.set(false); }

  save(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const body = {
      ...v,
      deadline: new Date(v.deadline).toISOString(),
      description: v.description || null,
    } as TaskInput;
    const editing = this.editing();
    const req = editing ? this.api.updateTask(editing.id, body) : this.api.createTask(body);
    req.subscribe({
      next: () => { this.closeForm(); this.reload(); },
      error: (e) => this.error.set(typeof e.error?.detail === 'string' ? e.error.detail : 'Не вдалося зберегти завдання. Перевірте поля й спробуйте ще раз.'),
    });
  }

  remove(task: Task): void {
    if (!confirm(`Видалити завдання «${task.title}»?`)) return;
    this.api.deleteTask(task.id).subscribe(() => this.tasks.set(this.tasks().filter((t) => t.id !== task.id)));
  }
}
