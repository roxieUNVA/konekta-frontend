import { inject, signal, effect } from '@angular/core';
import { AuthApiService, isAuthenticatedApi, getTokenApi } from '../../Services/Auth';
import { KonektaApiService } from '../../Api';
import { firstValueFrom } from 'rxjs';
import { User } from '../../Models/user';

export function useUser() {
  const authService = inject(AuthApiService);
  const api = inject(KonektaApiService);
  const isLoading = signal(false);
  const user = signal<User | null>(null);
  const error = signal<string | null>(null);

  // Función para cargar el usuario
  const loadUser = async () => {
    // Debug: comprobar token / estado de autenticación
  // minimal checks; avoid verbose logging in production

    if (!isAuthenticatedApi()) {
      user.set(null);
      return;
    }

    isLoading.set(true);
    error.set(null);
    try {
      // Intentar extraer el id del token y solicitar /users/{id} directamente
      const token = getTokenApi();
      if (!token) {
        user.set(null);
        return;
      }

    let idFromToken: string | null = null;
      try {
        const parts = token.split('.');
        if (parts.length >= 2) {
          const payload = JSON.parse(atob(parts[1]));
      // Priorizar uuid; evita enviar un uuid al backend esperando _id (ObjectId)
      idFromToken = payload.uuid || payload.user_uuid || payload.id || payload.userId || payload._id || payload.sub || null;
        }
      } catch (_e) {
        // ignore malformed token silently; handled below
      }

      if (!idFromToken) {
  // no se pudo extraer id del token
        user.set(null);
        error.set('No user id in token');
        isLoading.set(false);
        return;
      }

      // solicitando usuario por id desde API
      try {
  const data = await firstValueFrom(api.get<User>(`/users/${idFromToken}`));
        if (!data) {
          throw new Error('Empty response from /users/:id');
        }
        user.set(data);
        error.set(null);
      } catch (e: any) {
  // fallo obteniendo usuario por id
        user.set(null);
        // prefer detailed server message when present
        error.set(e?.error?.message || e?.message || 'Error al obtener usuario');
      }
    } catch (e: any) {
  // error general al obtener usuario por token
      error.set(e?.error?.message || e?.message || 'Error al obtener usuario');
      user.set(null);
    } finally {
      isLoading.set(false);
    }
  };

  // Auto-cargar el usuario al crear el hook (equivalente a useQuery automático)
  effect(() => {
    loadUser();
  }, { allowSignalWrites: true });

  return {
    isLoading: isLoading.asReadonly(),
    user: user.asReadonly(),
    error: error.asReadonly(),
    refetch: loadUser,
  };
}
