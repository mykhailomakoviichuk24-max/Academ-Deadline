import { Component } from '@angular/core';
import { TASK_TYPES } from './models';

/** Small legend: which colour means which type of work. */
@Component({
  selector: 'app-type-legend',
  standalone: true,
  template: `
    <span class="legend" aria-label="Кольори типів робіт">
      @for (t of types; track t.key) {
        <span class="type-tag type-{{ t.key }}">{{ t.label }}</span>
      }
    </span>
  `,
  styles: [`.legend { display: inline-flex; gap: 8px; flex-wrap: wrap; }`],
})
export class TypeLegendComponent {
  readonly types = TASK_TYPES;
}
