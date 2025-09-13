export interface Comment {
  _id?: string;
  uuid?: string;
  createdAt?: string;
  updatedAt?: string;
  content: string;
  userId: string;
  postId: string;
  commentId?: string; // Para respuestas a comentarios (opcional)
}

export type createCommentDto = Omit<Comment, '_id' | 'uuid' | 'createdAt' | 'updatedAt'>;
