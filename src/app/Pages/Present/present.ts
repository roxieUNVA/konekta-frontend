import { Component, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { usePost } from '../../Hooks/Post/usePost';
import { Events } from '../Events/events';

@Component({
  selector: 'app-present',
  standalone: true,
  imports: [CommonModule, FormsModule, Events],
  template: `<app-events [onlyActiveUpcoming]="true"></app-events>`,
  styles: []
})
export class Present implements OnInit {
  // Simple: reutilizamos el componente Events completo.
  // Si en el futuro quieres aislar la lógica de filtro, se extrae a un pipe o computed compartido.
  ngOnInit() {}
}
