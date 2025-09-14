import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-usage',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './usage.html',
  styleUrl: './usage.scss'
})
export class UsagePage {
  // Nombre exacto del PDF en public (verifica posibles espacios o acentos)
  readonly fileName = 'SENA Manual  usuario.pdf';
  manualHref = encodeURI(this.fileName); // genera ruta relativa válida

  downloads = signal(0);

  onDownload() {
    this.downloads.update(v => v + 1);
  }
}
