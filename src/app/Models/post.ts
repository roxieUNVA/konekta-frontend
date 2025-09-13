export interface Post {
  _id?: string;
  uuid?: string;
  createdAt?: string;
  updatedAt?: string;
  title: string;
  content: string;
  userId: string;
  author?: string; // dueño general del evento
  startDate?: string; // fecha de inicio ISO
  endDate?: string; // fecha de finalización ISO
  location?: string; // lugar
  category?: string; // categoria
  capacity?: number; // cupos
  postId?: string; // ID del post padre para actualizaciones/seguimiento
  imageUrl?: string; // URL de imagen del post
}

export type createPostDto = Omit<Post, '_id' | 'uuid' | 'createdAt' | 'updatedAt'>;
export type updatePostDto = Partial<createPostDto>;
