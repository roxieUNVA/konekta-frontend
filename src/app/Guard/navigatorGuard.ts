import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthApiService, isAuthenticatedApi, logoutApi } from '../Services/Auth';
import { User } from '../Models/user';

/**
 * Simple auth guard.
 *  - If there's a token (isAuthenticatedApi true) allow navigation.
 *  - Otherwise redirect to /login.
 * We keep it synchronous (fast) relying on token presence; if you need
 * to validate token with backend first, convert to an async guard and
 * fetch user before allowing.
 */
// Cache sencillo para evitar múltiples llamadas consecutivas
let cachedUser: User | null | undefined; // undefined = aún no cargado

export const authGuard: CanActivateFn = () => {
  const router = inject(Router);

  // Por ahora solo validamos token local (sin llamada al backend)
  // hasta que configures el endpoint correcto del usuario
  if (isAuthenticatedApi()) {
    return true;
  }

  return router.parseUrl('/login');
};/**
 * Optional helper for guarding public routes (login/signup) so that
 * authenticated users are redirected away to /inicio (home) or a role-based destination.
 */
export const publicOnlyGuard: CanActivateFn = () => {
  const router = inject(Router);

  // Si hay token, redirigir a inicio (sin validar con backend por ahora)
  if (isAuthenticatedApi()) {
    return router.parseUrl('/inicio');
  }

  return true; // No hay token, puede ver login/signup
};
