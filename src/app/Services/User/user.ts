import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { KonektaApiService } from '../../Api';
import { User } from '../../Models/user';

// Servicio minimalista para operaciones de usuario
// Endpoints esperados:
// GET    /users/:uuid
// PUT    /users/:uuid
// DELETE /users/:uuid
// GET    /users (opcional para list)

export interface UpdateUserDto {
  name?: string;
  email?: string;
  password?: string; // si backend permite cambio aquí
  role?: 'admin' | 'user'; // normalmente no editable por el propio usuario
}

@Injectable({ providedIn: 'root' })
export class UserApiService {
  private api = inject(KonektaApiService);

  async get(uuid: string): Promise<User> {
    return await firstValueFrom(this.api.get<User>(`/users/${uuid}`));
  }

  async update(uuid: string, dto: UpdateUserDto): Promise<User> {
    return await firstValueFrom(this.api.put<User>(`/users/${uuid}`, dto));
  }

  async remove(uuid: string): Promise<void> {
    await firstValueFrom(this.api.delete<void>(`/users/${uuid}`));
  }

  async list(): Promise<User[]> { // opcional (admin)
    return await firstValueFrom(this.api.get<User[]>(`/users`));
  }
}
