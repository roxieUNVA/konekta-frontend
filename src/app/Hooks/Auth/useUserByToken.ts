import { inject, signal, effect } from '@angular/core';
import { AuthApiService, isAuthenticatedApi } from '../../Services/Auth';
import { User } from '../../Models/user';

export function useUserByToken() {
  const authService = inject(AuthApiService);
  const isLoading = signal(false);
  const user = signal<User | null>(null);

  // Función para obtener usuario por token
  const fetchUser = async () => {
    if (!isAuthenticatedApi()) {
      user.set(null);
      return;
    }

    isLoading.set(true);
    try {
      const userData = await authService.getUserByToken();
      user.set(userData);
    } catch (e: any) {
      // error fetching user by token
      user.set(null);
    } finally {
      isLoading.set(false);
    }
  };

  // Auto-ejecutar al crear el hook (equivalente a useQuery automático)
  effect(() => {
    fetchUser();
  }, { allowSignalWrites: true });

  return {
    isLoading: isLoading.asReadonly(),
    user: user.asReadonly(),
  };
}
