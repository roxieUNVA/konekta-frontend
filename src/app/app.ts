import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, Router, ActivatedRoute, NavigationEnd } from '@angular/router';
import { Navbar } from './Components/UI/navbar/navbar';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, Navbar],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('konekta-frontend');
  readonly hideNavbar = signal(false);

  constructor(private router: Router, private route: ActivatedRoute) {
    this.updateHideNavbar();
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => this.updateHideNavbar());
  }

  private updateHideNavbar() {
    // Traverse to deepest activated route to read data
    let r: ActivatedRoute | null = this.route;
    while (r?.firstChild) r = r.firstChild;
    const dataHide = !!r?.snapshot.data?.['hideNavbar'];
    const urlHide = this.router.url.startsWith('/user');
    this.hideNavbar.set(dataHide || urlHide);
  }

  goBackFromProfile() { this.router.navigate(['/inicio']); }
}
