import { inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthApiService } from '../../Services/Auth';
import { createUserDto } from '../../Models/user';

export function useSignup() {
	const router = inject(Router);
	const authService = inject(AuthApiService);
	const isPending = signal(false);

	const signup = async (userData: createUserDto) => {
		if (isPending()) return;
		isPending.set(true);
		try {
			const result = await authService.register(userData);

			// Solo navega usando la ruta que el servicio ya determinó
			router.navigate([result.destinationRoute]);
		} catch (e: any) {
			// signup failed
		} finally {
			isPending.set(false);
		}
	};

	return { signup, isPending: isPending.asReadonly() };
}
