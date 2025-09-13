import { inject, signal } from '@angular/core';
import { PostApiService } from '../../Services/Post/post';
import { Post, createPostDto, updatePostDto } from '../../Models/post';
import { useUser } from '../Auth/useUser';

export function usePost() {
  const service = inject(PostApiService);
  const { user } = useUser();

  const isLoading = signal(false);
  const posts = signal<Post[] | null>(null);
  const error = signal<string | null>(null);

  const list = async () => {
    isLoading.set(true);
    error.set(null);
    try {
      const data = await service.list();
      posts.set(data || []);
    } catch (e: any) {
      error.set(e?.message || 'Error cargando posts');
    } finally {
      isLoading.set(false);
    }
  };

  const get = async (uuid: string) => {
    isLoading.set(true);
    error.set(null);
    try {
      return await service.getByUuid(uuid);
    } catch (e: any) {
      error.set(e?.message || 'Error obteniendo post');
      throw e;
    } finally {
      isLoading.set(false);
    }
  };

  const create = async (dto: createPostDto) => {
    // Solo admins
    const current = user();
    if (!current || current.role !== 'admin') throw new Error('No autorizado');
    isLoading.set(true);
    try {
      const created = await service.create(dto);
      // refrescar lista si ya cargada
      if (posts()) await list();
      return created;
    } finally {
      isLoading.set(false);
    }
  };

  const remove = async (uuid: string) => {
    // Solo admins
    const current = user();
    if (!current || current.role !== 'admin') throw new Error('No autorizado');
    isLoading.set(true);
    try {
      await service.remove(uuid);
      if (posts()) await list();
      error.set(null);
    } catch (e: any) {
      error.set(e?.message || 'Error eliminando post');
      throw e;
    } finally {
      isLoading.set(false);
    }
  };

  const update = async (uuid: string, dto: updatePostDto) => {
    const current = user();
    if (!current || current.role !== 'admin') throw new Error('No autorizado');
    isLoading.set(true);
    try {
      const updated = await service.update(uuid, dto);
      if (posts()) await list();
      return updated;
    } finally {
      isLoading.set(false);
    }
  };

  return {
    isLoading: isLoading.asReadonly(),
    posts: posts.asReadonly(),
    error: error.asReadonly(),
    list,
    get,
    create,
    remove,
    update,
  };
}
