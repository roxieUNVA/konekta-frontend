import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { KonektaApiService } from '../../Api';
import { User, createUserDto } from '../../Models/user';

const TOKEN_KEY = 'token';

// Servicio con lógica de negocio para determinar rutas según rol
export const authService = {
  getDestinationRoute: (user?: User): string => {
    if (user?.role === 'admin') return '/admin';
    return '/inicio';
  },

  getCurrentUser: (): User | null => {
    // Aquí podrías obtener el usuario del token o localStorage si lo guardas
    // Por ahora retorna null, puedes expandir según tu necesidad
    return null;
  },
};

@Injectable({
  providedIn: 'root'
})
export class AuthApiService {
  private api = inject(KonektaApiService);

  async login({ email, password }: { email: string; password: string; }) {
    const data = await firstValueFrom(
      this.api.post<{ token: string; user?: User; message?: string }>('/signin', {
        email,
        password,
      })
    );
    persistToken(data.token);

    // Retornar datos + ruta de destino según rol
    return {
      ...data,
      destinationRoute: authService.getDestinationRoute(data.user),
    };
  }

  async register(user: createUserDto) {
    const data = await firstValueFrom(
      this.api.post<{ token: string; user?: User; message?: string }>('/signup', user)
    );
    persistToken(data.token);

    // Para signup, típicamente redirigimos al login después del registro
    return {
      ...data,
      destinationRoute: '/login'
    };
  }

  async getUserByToken(): Promise<User> {
    // Para backends que usan uuid: GET /users/:uuid
    const token = getTokenApi();
    if (!token) throw new Error('No hay token presente en localStorage');

    let userUuid: string | null = null;
    try {
      const parts = token.split('.');
      if (parts.length >= 2) {
        const payload = JSON.parse(atob(parts[1]));
        // Priorizar uuid explícitamente
        userUuid = payload.uuid || payload.user_uuid || null;
      }
    } catch (_e) {
      // ignorar
    }

    if (!userUuid) {
      throw new Error('No se pudo extraer uuid de usuario del token');
    }

    const endpoint = `/users/${userUuid}`;
    const data = await firstValueFrom(this.api.get<User>(endpoint));
    if (data == null) throw new Error('Respuesta vacía del endpoint de perfil');
    return data as User;
  }
}

// Funciones de utilidad sin instanciación directa
const persistToken = (token: string) => {
  if (token) localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
};

export const logoutApi = () => {
  localStorage.removeItem(TOKEN_KEY);
};

export const getTokenApi = (): string | null => {
  const raw = localStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const isAuthenticatedApi = (): boolean => !!getTokenApi();
