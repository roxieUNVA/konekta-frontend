import { inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthApiService } from '../../Services/Auth';

interface Credentials { email: string; password: string; }

export function useLogin() {
	const router = inject(Router);
	const authService = inject(AuthApiService);
	const isPending = signal(false);

	const login = async ({ email, password }: Credentials) => {
		if (isPending()) return;
		isPending.set(true);
		try {
			const result = await authService.login({ email, password });

			// Solo navega usando la ruta que el servicio ya determinó
			router.navigate([result.destinationRoute]);
		} catch (e: any) {
			// login failed
		} finally {
			isPending.set(false);
		}
	};

	return { login, isPending: isPending.asReadonly() };
}
