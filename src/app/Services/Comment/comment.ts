import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { KonektaApiService } from '../../Api';
import { Comment, createCommentDto } from '../../Models/comment';

@Injectable({
  providedIn: 'root'
})
export class CommentApiService {
  private api = inject(KonektaApiService);

  async create(comment: createCommentDto): Promise<Comment> {
    return await firstValueFrom(this.api.post<Comment>('/comments', comment));
  }

  async listByPost(postUuid: string): Promise<Comment[]> {
  // Backend exposes comments endpoint filtered by postId as query param
  return await firstValueFrom(this.api.get<Comment[]>(`/comments?postId=${postUuid}`));
  }

  async remove(uuid: string): Promise<void> {
    await firstValueFrom(this.api.delete<void>(`/comments/${uuid}`));
  }

  async update(uuid: string, dto: Partial<createCommentDto>): Promise<Comment> {
    return await firstValueFrom(this.api.put<Comment>(`/comments/${uuid}`, dto));
  }
}
