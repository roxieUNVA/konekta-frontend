import { inject, signal } from '@angular/core';
import { CommentApiService } from '../../Services/Comment/comment';
import { Comment, createCommentDto } from '../../Models/comment';
import { useUser } from '../Auth/useUser';

export function useComment() {
  const service = inject(CommentApiService);
  const { user } = useUser();

  const isLoading = signal(false);
  const comments = signal<Comment[] | null>(null);
  const error = signal<string | null>(null);

  const listByPost = async (postUuid: string) => {
    isLoading.set(true);
    error.set(null);
    try {
      const data = await service.listByPost(postUuid);
      comments.set(data || []);
      return data || [];
    } catch (e: any) {
      error.set(e?.message || 'Error cargando comentarios');
      return [] as Comment[];
    } finally {
      isLoading.set(false);
    }
  };

  const create = async (dto: createCommentDto) => {
    // cualquier usuario autenticado puede crear
    const current = user();
    if (!current) throw new Error('No autorizado');
    isLoading.set(true);
    try {
      const created = await service.create(dto);
      return created;
    } finally {
      isLoading.set(false);
    }
  };

  const createReply = async (dto: createCommentDto, parentCommentId: string) => {
    const current = user();
    if (!current) throw new Error('No autorizado');

    const replyDto: createCommentDto = {
      ...dto,
      commentId: parentCommentId
    };

    return await create(replyDto);
  };

  const update = async (uuid: string, dto: Partial<createCommentDto>) => {
    const current = user();
    if (!current) throw new Error('No autorizado');
    isLoading.set(true);
    try {
      const updated = await service.update(uuid, dto);
      return updated;
    } finally {
      isLoading.set(false);
    }
  };

  const remove = async (uuid: string, ownerId?: string) => {
    // allow if current user is admin or the owner of the comment
    const current = user();
    if (!current) throw new Error('No autorizado');
    const isOwner =
      ownerId &&
      ((current as any)._id === ownerId || (current as any).uuid === ownerId);
    if (!isOwner && current.role !== 'admin') throw new Error('No autorizado');
    isLoading.set(true);
    try {
      await service.remove(uuid);
      return;
    } finally {
      isLoading.set(false);
    }
  };

  return {
    isLoading: isLoading.asReadonly(),
    comments: comments.asReadonly(),
    error: error.asReadonly(),
    listByPost,
    create,
    createReply,
    remove,
    update,
  };
}
