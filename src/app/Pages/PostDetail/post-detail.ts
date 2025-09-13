import { Component, OnInit, OnDestroy, signal, inject, computed, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Post } from '../../Models/post';
import { Comment } from '../../Models/comment';
import { User } from '../../Models/user';
import { PostApiService } from '../../Services/Post/post';
import { CommentApiService } from '../../Services/Comment/comment';
import { UserApiService } from '../../Services/User/user';
import { useUser } from '../../Hooks/Auth/useUser';

@Component({
  selector: 'app-post-detail',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './post-detail.html',
  styleUrls: ['./post-detail.scss']
})
export class PostDetail implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private postService = inject(PostApiService);
  private commentService = inject(CommentApiService);
  private userService = inject(UserApiService);
  private userHook = useUser();

  // Post data
  currentPost = signal<Post | null>(null);
  followUpPosts = signal<Post[]>([]);

  // Comments data - organized by post ID
  allComments = signal<Comment[]>([]);

  // UI state - track which post's comments are being shown
  showComments = signal(false);
  activeCommentsPostId = signal<string | null>(null);
  isLoading = signal(false);
  notification = signal<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Comment creation
  newComment = signal('');
  commentToReply = signal<Comment | null>(null);

  // Follow-up post creation
  showCreateModal = signal(false);
  newPostTitle = signal('');
  newPostContent = signal('');
  newPostLocation = signal('');
  newPostImageUrl = signal('');
  selectedImage = signal<File | null>(null); // Archivo de imagen seleccionado
  selectedImagePreview = signal<string | null>(null); // Vista previa de la imagen
  followUpPostId = signal<string>('');
  isFollowUpMode = computed(() => this.followUpPostId().length > 0);

  // User data - computed from userHook
  user = this.userHook.user;
  isAdmin = computed(() => this.userHook.user()?.role === 'admin');
  hasUser = computed(() => !!this.userHook.user());

  // User cache for resolving user names
  userCache = signal<Record<string, User>>({});

  // Expanded replies state
  expandedComments = signal<Set<string>>(new Set());
  // Editing state
  editingCommentId = signal<string | null>(null);
  editCommentContent = signal<string>('');
  // Actions menu state
  openActionsCommentId = signal<string | null>(null);

  ngOnInit() {
    this.route.params.subscribe(params => {
      const postId = params['id'];
      if (postId) {
        this.loadPostDetail(postId);
      }
    });

    // Check if comments should be shown initially
    this.route.queryParams.subscribe(queryParams => {
      if (queryParams['showComments'] === 'true') {
        this.showComments.set(true);
      }
    });
  }

  ngOnDestroy() {
    // Cleanup if needed
  }

  async loadPostDetail(postId: string) {
    this.isLoading.set(true);
    try {
      // Load main post
      const mainPost = await this.postService.getByUuid(postId);
      this.currentPost.set(mainPost);

      // Load all posts to find follow-ups
      const allPosts = await this.postService.list();
      const followUps = allPosts.filter((p: Post) => p.postId === postId);
      this.followUpPosts.set(followUps);

      // Load comments for this post
      await this.loadComments(postId);

    } catch (error) {
      console.error('Error loading post detail:', error);
      this.showNotification('error', 'Error al cargar el post');
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadComments(postId: string) {
    try {
      const comments = await this.commentService.listByPost(postId);
      console.log('Loaded comments for post:', postId, 'Count:', comments.length);
      this.allComments.set(comments);

      // Cargar información de usuarios únicos
      await this.loadUsersForComments(comments);
    } catch (error) {
      console.error('Error loading comments:', error);
    }
  }

  private async loadUsersForComments(comments: Comment[]) {
    // Obtener IDs únicos de usuarios
    const userIds = [...new Set(comments.map(comment => (comment as any).userId).filter(id => id))];
    const currentCache = this.userCache();

    // Filtrar solo los usuarios que no están en cache
    const missingUserIds = userIds.filter(userId => !currentCache[userId]);

    if (missingUserIds.length === 0) return;

    // Cargar usuarios faltantes
    const userPromises = missingUserIds.map(async userId => {
      try {
        return await this.userService.get(userId);
      } catch (error) {
        console.error(`Error loading user ${userId}:`, error);
        return {
          name: `Usuario ${userId.substring(0, 8)}`,
          email: '',
          password: '',
          role: 'user' as const,
          uuid: userId
        } as User;
      }
    });

    try {
      const users = await Promise.all(userPromises);

      // Actualizar cache con todos los usuarios cargados
      const newCache = { ...currentCache };
      users.forEach((user, index) => {
        newCache[missingUserIds[index]] = user;
      });

      this.userCache.set(newCache);
    } catch (error) {
      console.error('Error loading users for comments:', error);
    }
  }  // Get comments for the currently active post
  getActivePostComments(): Comment[] {
    if (!this.activeCommentsPostId()) return [];
    return this.allComments().filter((comment: Comment) => comment.postId === this.activeCommentsPostId());
  }

  // Get main comments (not replies) for active post
  getMainComments(): Comment[] {
    return this.getActivePostComments().filter((comment: Comment) => !comment.commentId);
  }

  // Get replies for a specific comment
  getRepliesForComment(commentId: string): Comment[] {
    const allActiveComments = this.getActivePostComments();
    const replies = allActiveComments.filter((comment: Comment) => {
      return comment.commentId === commentId;
    });
    return replies;
  }  // Toggle comment expansion
  toggleCommentExpansion(commentId: string) {
    const expanded = this.expandedComments();
    const newExpanded = new Set(expanded);

    if (newExpanded.has(commentId)) {
      newExpanded.delete(commentId);
    } else {
      newExpanded.add(commentId);
    }

    this.expandedComments.set(newExpanded);
  }

  // Check if comment is expanded
  isCommentExpanded(commentId: string): boolean {
    return this.expandedComments().has(commentId);
  }

  // Show comments for a specific post
  async showCommentsForPost(post: Post) {
    const postId = this.getPostUuid(post);
    this.activeCommentsPostId.set(postId);
    this.showComments.set(true);

    // Load comments for this specific post
    await this.loadComments(postId);
  }

  // Hide comments panel
  hideComments() {
    this.showComments.set(false);
    this.activeCommentsPostId.set(null);
  }

  // Check if comments are shown for a specific post
  areCommentsShownForPost(post: Post): boolean {
    const postId = this.getPostUuid(post);
    return this.showComments() && this.activeCommentsPostId() === postId;
  }

  toggleCommentsView() {
    if (this.showComments()) {
      this.hideComments();
    }
  }

  async createComment() {
    if (!this.newComment().trim() || !this.activeCommentsPostId() || !this.user()) return;

    try {
      const commentData = {
        content: this.newComment().trim(),
        postId: this.activeCommentsPostId()!,
        userId: this.getUserId(this.user()!),
        commentId: this.commentToReply() ? this.getCommentUuid(this.commentToReply()!) : undefined
      };

      // Si es una respuesta, guardamos el ID del comentario padre
      const parentCommentId = this.commentToReply() ? this.getCommentUuid(this.commentToReply()!) : null;

      console.log('Creating comment. Is reply:', !!parentCommentId, 'Parent ID:', parentCommentId);

      await this.commentService.create(commentData);      // Pequeña pausa para asegurar que el backend haya procesado la creación
      await new Promise(resolve => setTimeout(resolve, 200));

      this.newComment.set('');
      this.commentToReply.set(null);

      // Reload comments for the active post
      await this.loadComments(this.activeCommentsPostId()!);

      // Si es una respuesta, expandir automáticamente el comentario padre
      if (parentCommentId) {
        const expanded = this.expandedComments();
        const newExpanded = new Set(expanded);
        newExpanded.add(parentCommentId);
        this.expandedComments.set(newExpanded);
        console.log('Auto-expanding parent comment:', parentCommentId);
      }

      this.showNotification('success', 'Comentario creado exitosamente');
    } catch (error) {
      console.error('Error creating comment:', error);
      this.showNotification('error', 'Error al crear el comentario');
    }
  }  // Helper to get post UUID/ID
  private getPostUuid(post: Post): string {
    return (post as any).uuid || (post as any)._id || '';
  }

  // Ownership check
  isCommentOwner(comment: Comment): boolean {
    if (!this.user()) return false;
    const currentUserId = this.getUserId(this.user()!);
    const commentUserId = (comment as any).userId;
    return currentUserId === commentUserId;
  }

  startEditComment(comment: Comment) {
    const id = this.getCommentUuid(comment);
    this.editingCommentId.set(id);
    this.editCommentContent.set(comment.content);
  this.openActionsCommentId.set(null);
  }

  cancelEditComment() {
    this.editingCommentId.set(null);
    this.editCommentContent.set('');
  }

  toggleActionsMenu(comment: Comment) {
    const id = this.getCommentUuid(comment);
    if (this.openActionsCommentId() === id) {
      this.openActionsCommentId.set(null);
    } else {
      this.openActionsCommentId.set(id);
    }
  }

  closeActionsMenu() {
    this.openActionsCommentId.set(null);
  }

  async saveEditComment() {
    const id = this.editingCommentId();
    if (!id || !this.editCommentContent().trim()) return;
    try {
      await this.commentService.update(id, { content: this.editCommentContent().trim() });
      // pequeña pausa y recarga
      await new Promise(r => setTimeout(r, 150));
      if (this.activeCommentsPostId()) {
        await this.loadComments(this.activeCommentsPostId()!);
      }
      this.showNotification('success', 'Comentario actualizado');
    } catch (e) {
      console.error('Error updating comment', e);
      this.showNotification('error', 'No se pudo actualizar');
    } finally {
      this.cancelEditComment();
  this.closeActionsMenu();
    }
  }

  async deleteComment(comment: Comment) {
    const id = this.getCommentUuid(comment);
    if (!id) return;
    // Confirmación simple
    const ok = window.confirm('¿Eliminar este comentario?');
    if (!ok) return;
    try {
      await this.commentService.remove(id);
      await new Promise(r => setTimeout(r, 150));
      if (this.activeCommentsPostId()) {
        await this.loadComments(this.activeCommentsPostId()!);
      }
      this.showNotification('success', 'Comentario eliminado');
    } catch (e) {
      console.error('Error deleting comment', e);
      this.showNotification('error', 'No se pudo eliminar');
    }
  this.closeActionsMenu();
  }

  // Cerrar menú si clic fuera
  @HostListener('document:click', ['$event'])
  onGlobalClick(event: MouseEvent) {
    if (!this.openActionsCommentId()) return;
    const target = event.target as HTMLElement;
    if (target.closest('.actions-dropdown') || target.closest('.actions-toggle')) return;
    this.openActionsCommentId.set(null);
  }

  // Helper to get comment UUID/ID - CONSISTENT with getCommentId
  private getCommentUuid(comment: Comment): string {
    return (comment as any)._id || (comment as any).uuid || '';
  }

  // Helper to get user UUID/ID
  private getUserId(user: any): string {
    return user.uuid || user._id || '';
  }

  replyToComment(comment: Comment) {
    this.commentToReply.set(comment);
  }

  cancelReply() {
    this.commentToReply.set(null);
  }

  goBack() {
    this.router.navigate(['/events']);
  }

  getEventStatus(post: Post): string {
    if (!post.startDate) return 'no-date';

    const now = Date.now();
    const start = Date.parse(post.startDate);
    const endRaw: any = (post as any).endDate;
    const end = endRaw ? Date.parse(endRaw) : null;

    if (start > now) return 'upcoming';
    if (start <= now) {
      if (!end) return 'ongoing';
      if (end > now) return 'ongoing';
      return 'finished';
    }
    return 'no-date';
  }

  onImageError(event: any) {
    event.target.src = '/comunicacion.png';
  }

  showNotification(type: 'success' | 'error' | 'info', message: string) {
    this.notification.set({ type, message });
    setTimeout(() => this.notification.set(null), 3000);
  }

  closeNotification() {
    this.notification.set(null);
  }

  // Helper methods for safe property access
  getCommentId(comment: Comment): string {
    const id = (comment as any)._id || (comment as any).uuid || '';
    return id;
  }

  getCommentAuthorName(comment: Comment): string {
    const userId = (comment as any).userId || '';

    if (!userId) {
      return 'Anónimo';
    }

    // Obtener el usuario del cache
    const cachedUser = this.userCache()[userId];
    if (cachedUser) {
      return cachedUser.name;
    }

    // Si no está en cache (no debería pasar), devolver fallback
    return `Usuario ${userId.substring(0, 8)}`;
  }

  getCategoriesArray(categoryString: string | undefined): string[] {
    if (!categoryString) return [];

    // Split by space and clean up each category
    return categoryString
      .split(' ')
      .map(cat => cat.trim())
      .filter(cat => cat.length > 0);
  }

  // Follow-up post methods
  canCreateFollowUp(post: Post): boolean {
    const status = this.getEventStatus(post);
    return status === 'ongoing' || status === 'finished';
  }

  createFollowUpPost(originalPost: Post) {
    const status = this.getEventStatus(originalPost);
    const statusText = status === 'ongoing' ? 'En curso' :
                      status === 'finished' ? 'Finalizado' :
                      status === 'upcoming' ? 'Próximo' : 'Sin fecha';

    // Pre-llenar el modal con información mínima para actualización
    this.newPostTitle.set(`Actualización: ${originalPost.title}`);
    this.newPostContent.set(`Actualización del evento "${originalPost.title}" (${statusText}):\n\n`);
    this.newPostLocation.set(''); // Vacío, opcional si cambia

    // Establecer el postId del post original para el seguimiento
    this.followUpPostId.set(originalPost.uuid || originalPost._id || '');

  // Ensure previous image selection is cleared so user can pick a new image
  this.newPostImageUrl.set('');
  this.selectedImage.set(null);
  this.selectedImagePreview.set(null);

  this.showCreateModal.set(true);
  }

  // Modal management methods
  closeCreateModal() {
    this.showCreateModal.set(false);
    this.newPostTitle.set('');
    this.newPostContent.set('');
    this.newPostLocation.set('');
    this.newPostImageUrl.set('');
    this.selectedImage.set(null);
    this.selectedImagePreview.set(null);
    this.followUpPostId.set('');
    // Clear the file input DOM value so change events fire even if same file
    try {
      const el = document.getElementById('imageFile') as HTMLInputElement | null;
      if (el) el.value = '';
    } catch (e) {
      // ignore DOM errors in environments without document
    }
  }

  // Método para manejar la selección de imagen
  onImageSelect(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];

    if (file) {
      // Validar tipo de archivo
      if (!file.type.startsWith('image/')) {
        alert('Por favor selecciona un archivo de imagen válido');
        return;
      }

      // Validar tamaño (máximo 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('El archivo es demasiado grande. Máximo 5MB permitido');
        return;
      }

      this.selectedImage.set(file);

      // Crear vista previa
      const reader = new FileReader();
      reader.onload = (e) => {
        this.selectedImagePreview.set(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  // Método para remover la imagen seleccionada
  removeSelectedImage() {
    this.selectedImage.set(null);
    this.selectedImagePreview.set(null);
    this.newPostImageUrl.set('');
  }

  async createPost() {
    if (!this.newPostTitle().trim() || !this.newPostContent().trim()) {
      this.showNotification('error', 'Por favor completa el título y contenido');
      return;
    }

    try {
      const followUpId = this.followUpPostId();
      const userId = this.user()?.uuid || '';

      // Si hay una imagen seleccionada, convertirla a base64 o manejarla
      let imageUrl = this.newPostImageUrl();
      if (this.selectedImage()) {
        // Por ahora usamos la vista previa como URL temporal
        // En una implementación real, aquí subirías el archivo a un servidor
        imageUrl = this.selectedImagePreview() || '';
      }

      const postData = {
        userId: userId,
        title: this.newPostTitle(),
        content: this.newPostContent(),
        location: this.newPostLocation() || undefined,
        imageUrl: imageUrl || undefined,
        postId: followUpId || undefined, // Para seguimiento
      };

      await this.postService.create(postData);

      this.showNotification('success', 'Seguimiento creado exitosamente');
      this.closeCreateModal();

      // Reload the current post and its follow-ups
      const currentPostId = this.currentPost()?.uuid || this.currentPost()?._id;
      if (currentPostId) {
        await this.loadPostDetail(currentPostId);
      }

    } catch (error) {
      console.error('Error creating follow-up post:', error);
      this.showNotification('error', 'Error al crear el seguimiento');
    }
  }
}
