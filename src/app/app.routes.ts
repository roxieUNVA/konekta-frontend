import { Routes } from '@angular/router';

import { Login } from './Pages/Auth/login/login';
import { Signup } from './Pages/Auth/signup/signup';
import { Home } from './Pages/Home/home';
import { authGuard, publicOnlyGuard } from './Guard/navigatorGuard';
import { UserPage } from './Pages/User/user';

export const routes: Routes = [
  { path: 'login', component: Login, canActivate: [publicOnlyGuard] },
  { path: 'signup', component: Signup, canActivate: [publicOnlyGuard] },
  { path: 'inicio', component: Home }, // Ahora es pública, maneja autenticación internamente
  { path: 'home', component: Home }, // Alias para compatibilidad
  { path: 'events', loadComponent: () => import('./Pages/Events/events').then(m => m.Events) },
  { path: 'post/:id', loadComponent: () => import('./Pages/PostDetail/post-detail').then(m => m.PostDetail) },
  { path: 'present', loadComponent: () => import('./Pages/Present/present').then(m => m.Present) },
  { path: 'user', component: UserPage, canActivate: [authGuard], data: { hideNavbar: true } },

  { path: '', pathMatch: 'full', redirectTo: 'inicio' }, // Redirige a inicio en lugar de login
  { path: '**', redirectTo: 'inicio' },
];
