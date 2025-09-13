import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-buttom',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './buttom.html',
  styleUrls: ['./buttom.scss']
})
export class Buttom {
  @Input() type: 'button' | 'submit' | 'reset' = 'button';
  @Input() disabled: boolean = false;
  @Input() loading: boolean = false;
  @Input() text: string = 'Button';
  @Input() loadingText: string = 'Cargando...';
  @Input() variant: 'primary' | 'secondary' | 'danger' = 'primary';
  @Input() size: 'small' | 'medium' | 'large' = 'medium';

  @Output() onClick = new EventEmitter<Event>();

  onButtonClick(event: Event) {
    if (!this.disabled && !this.loading) {
      this.onClick.emit(event);
    }
  }
}
