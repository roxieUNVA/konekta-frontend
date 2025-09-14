import { Component, OnInit, effect, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { useUser } from '../../../Hooks/Auth/useUser';
import { isAuthenticatedApi, logoutApi } from '../../../Services/Auth';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './navbar.html',
  styleUrls: ['./navbar.scss']
})
export class Navbar implements OnInit {
  /** Señal readonly que contiene el usuario; exponerla permite que la plantilla la lea reactiva. */
  private userHook = useUser();
  readonly userSignal = this.userHook.user; // signal: () => User | null

  /**
   * Devuelve la inicial del nombre del usuario autenticado, o '?' si no hay usuario.
   * Usa la `userSignal()` directamente para que Angular pueda subscribirse al signal.
   */
  get userNameInitial(): string {
    const user = this.userSignal();
    if (user && user.name && typeof user.name === 'string' && user.name.length > 0) {
      return user.name.charAt(0).toUpperCase();
    }
    return '?';
  }

  navigateToProfile() {
    this.router.navigate(['/perfil']);
  }
  // Estado del menú de perfil
  showProfileMenu = false;
  // Estado del menú móvil
  /** Controla la visibilidad del menú de navegación colapsado (vista móvil). */
  mobileMenuOpen = false;

  toggleProfileMenu(event?: Event) {
    if (event) event.stopPropagation();
    this.showProfileMenu = !this.showProfileMenu;
  }

  toggleMobileMenu() {
    // Alterna el panel móvil (hamburguesa). Accesible mediante aria-expanded en la plantilla.
    this.mobileMenuOpen = !this.mobileMenuOpen;
    // Cerrar dropdown de perfil si se abre el menú móvil
    if (this.mobileMenuOpen) this.showProfileMenu = false;
  }

  closeMobileMenu() {
    // Utilizado para cerrar el menú tras una acción de navegación o click en una opción.
    if (this.mobileMenuOpen) this.mobileMenuOpen = false;
  }

  navigateToSettings() {
    this.showProfileMenu = false;
    this.router.navigate(['/user']);
  }
  navigateToUser() {
    this.showProfileMenu = false;
    this.router.navigate(['/user']);
  }
  currentRoute = '';

  constructor(private router: Router) {
    // Escuchar cambios de ruta para actualizar el estado activo
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      this.currentRoute = event.url;
      // Cerrar menú móvil tras navegación
      this.closeMobileMenu();
      // Cerrar menú de perfil también
      this.showProfileMenu = false;
    });
  }

  ngOnInit() {
    this.userHook.refetch();
    this.currentRoute = this.router.url;
    // Registrar cambios en el signal sólo si effect está disponible
    try {
      effect(() => {
        void this.userSignal();
      });
    } catch (_e) {
      // no hacer logging adicional
    }

    // Cerrar el menú al hacer clic fuera
    document.addEventListener('click', () => {
      if (this.showProfileMenu) this.showProfileMenu = false;
      // No cerrar el menú móvil con click global si el click sucede dentro (lo maneja HTML). Opcional.
    });
  }

  @HostListener('window:resize')
  onResize() {
    // Si volvemos a escritorio, asegurar menú visible en layout desktop (CSS) y cerrar estado mobile
    if (window.innerWidth > 768 && this.mobileMenuOpen) {
      this.mobileMenuOpen = false;
    }
  }

  get isAuthenticated() {
    return isAuthenticatedApi();
  }

  // Si necesitas el usuario completo en la plantilla podrías exponerlo así:
  // Exponer el usuario como valor para el resto del componente si se necesita
  get user() { return this.userSignal(); }

  isActiveRoute(route: string): boolean {
    return this.currentRoute === route ||
           (route === '/inicio' && (this.currentRoute === '/' || this.currentRoute === '/inicio'));
  }

  navigateToLogin() {
    this.router.navigate(['/login']);
  }

  navigateToSignup() {
    this.router.navigate(['/signup']);
  }

  navigateToHome() {
    this.router.navigate(['/inicio']);
  }

  navigateToEvents() {
  this.router.navigate(['/events']);
  }

  navigateToNews() {
  this.router.navigate(['/present']);
  }

  navigateToUsage() {
    this.router.navigate(['/usage']);
  }

  async logout() {
    logoutApi();
    this.router.navigate(['/']);
  }
}
