import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { KonektaApiService } from '../../Api';
import { Post, createPostDto, updatePostDto } from '../../Models/post';

@Injectable({
  providedIn: 'root'
})
export class PostApiService {
  private api = inject(KonektaApiService);

  async create(post: createPostDto): Promise<Post> {
    const data = await firstValueFrom(this.api.post<Post>('/posts', post));
    return data;
  }

  async getByUuid(uuid: string): Promise<Post> {
    return await firstValueFrom(this.api.get<Post>(`/posts/${uuid}`));
  }

  async list(): Promise<Post[]> {
    return await firstValueFrom(this.api.get<Post[]>('/posts'));
  }

  async remove(uuid: string): Promise<void> {
    try {
      await firstValueFrom(this.api.delete<void>(`/posts/${uuid}`));
    } catch (e: any) {
      // rethrow with context for hook
      const message = e?.error?.message || e?.message || 'Error eliminando post';
      throw new Error(message);
    }
  }

  async update(uuid: string, dto: updatePostDto): Promise<Post> {
    return await firstValueFrom(this.api.put<Post>(`/posts/${uuid}`, dto));
  }
}
