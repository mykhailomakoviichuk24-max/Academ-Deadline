import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { Subject, SubjectInput } from '../../core/models';

@Component({
  selector: 'app-subjects',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <h2>Предмети</h2>
    <div class="layout">
      <form class="card" [formGroup]="form" (ngSubmit)="save()">
        <h3>{{ editingId() ? 'Редагування предмета' : 'Новий предмет' }}</h3>
        <div class="field"><label for="s-name">Назва</label><input id="s-name" formControlName="name" /></div>
        <div class="field"><label for="s-teacher">Викладач</label><input id="s-teacher" formControlName="teacher_name" /></div>
        <div class="field"><label for="s-contact">Контакт викладача</label><input id="s-contact" formControlName="teacher_contact" placeholder="Email або Telegram" /></div>
        <div class="field"><label for="s-url">Посилання на матеріали</label><input id="s-url" formControlName="resources_url" placeholder="https://" /></div>
        @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
        <div class="row">
          <button class="primary" type="submit" [disabled]="form.invalid">Зберегти</button>
          @if (editingId()) { <button type="button" (click)="reset()">Скасувати</button> }
        </div>
      </form>

      <div class="list">
        @for (s of subjects(); track s.id) {
          <article class="card item">
            <div class="info">
              <strong>{{ s.name }}</strong>
              @if (s.teacher_name || s.teacher_contact) {
                <div class="muted">{{ teacherLine(s) }}</div>
              }
              @if (s.resources_url) { <a [href]="s.resources_url" target="_blank" rel="noopener">Матеріали курсу</a> }
            </div>
            <div class="row">
              <button class="icon-btn" (click)="edit(s)" aria-label="Редагувати" title="Редагувати">
                <svg viewBox="0 0 24 24"><path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16v4z" /></svg>
              </button>
              <button class="icon-btn danger" (click)="remove(s)" aria-label="Видалити" title="Видалити">
                <svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
              </button>
            </div>
          </article>
        } @empty {
          <div class="card empty">
            <strong>Предметів ще немає</strong>
            <span class="muted">Додайте перший у формі зліва, і з'явиться можливість створювати завдання.</span>
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .layout { display: grid; grid-template-columns: 370px 1fr; gap: 20px; align-items: start; margin-top: 8px; }
      @media (max-width: 860px) { .layout { grid-template-columns: 1fr; } }
      .list { display: flex; flex-direction: column; gap: 10px; }
      .item { display: flex; justify-content: space-between; align-items: center; gap: 14px; padding: 16px 18px; }
      .info { display: grid; gap: 2px; min-width: 0; }
      .info a { font-size: 13px; width: fit-content; }
      .empty { display: grid; gap: 4px; border-style: dashed; box-shadow: none; }
    `,
  ],
})
export class SubjectsComponent {
  private api = inject(ApiService);
  private fb = inject(FormBuilder);

  subjects = signal<Subject[]>([]);
  editingId = signal<string | null>(null);
  error = signal('');

  form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    teacher_name: [''],
    teacher_contact: [''],
    resources_url: [''],
  });

  constructor() { this.load(); }

  load(): void { this.api.listSubjects().subscribe((s) => this.subjects.set(s)); }

  teacherLine(s: Subject): string {
    return [s.teacher_name, s.teacher_contact].filter(Boolean).join(', ');
  }

  edit(s: Subject): void {
    this.editingId.set(s.id);
    this.form.reset({ ...s, resources_url: s.resources_url ?? '' });
  }

  reset(): void {
    this.editingId.set(null);
    this.error.set('');
    this.form.reset();
  }

  save(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const body: SubjectInput = { ...v, resources_url: v.resources_url || null };
    const id = this.editingId();
    const req = id ? this.api.updateSubject(id, body) : this.api.createSubject(body);
    req.subscribe({
      next: () => { this.reset(); this.load(); },
      error: (e) => this.error.set(typeof e.error?.detail === 'string' ? e.error.detail : 'Не вдалося зберегти предмет. Спробуйте ще раз.'),
    });
  }

  remove(s: Subject): void {
    if (!confirm(`Видалити предмет «${s.name}» разом з усіма його завданнями?`)) return;
    this.api.deleteSubject(s.id).subscribe(() => this.load());
  }
}
