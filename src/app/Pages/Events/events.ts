import { Component, OnInit, OnDestroy, signal, inject, computed, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { usePost } from '../../Hooks/Post/usePost';
import { useComment } from '../../Hooks/Comment/useComment';
import { useUser } from '../../Hooks/Auth/useUser';
import { Post } from '../../Models/post';
import { Comment } from '../../Models/comment';
import { KonektaApiService } from '../../Api';
import { CATEGORY_SUGGESTIONS } from '../../Constants/categories';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-events',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './events.html',
  styleUrls: ['./events.scss']
})
export class Events implements OnInit, OnDestroy {
  @Input() onlyActiveUpcoming: boolean = false; // modo para sección Actualidad
  private postHook = usePost();
  private commentHook = useComment();
  private userHook = useUser();
  private api = inject(KonektaApiService);
  readonly router = inject(Router); // público para uso indirecto en template
  private route = inject(ActivatedRoute);

  // signals for template
  posts = this.postHook.posts;
  postsLoading = this.postHook.isLoading;
  postsError = this.postHook.error;

  // búsqueda
  searchTerm = signal('');
  searchValue = '';
  filteredPosts = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    let list = this.posts() || [];

    // Excluir actualizaciones/follow-ups (posts que tienen postId)
    list = list.filter(p => !p.postId);

    if (this.onlyActiveUpcoming) {
      const now = Date.now();
      list = list.filter(p => {
        if (!p.startDate) return false; // requerir startDate para el filtro de actualidad
        const start = Date.parse(p.startDate);
        const endRaw: any = (p as any).endDate;
        const end = endRaw ? Date.parse(endRaw) : null;
        // incluir si aún no inicia (start > now) o está en curso (start <= now y sin end o end > now)
        if (start > now) return true; // futuro
        if (start <= now) {
          if (!end) return true; // en curso sin end definido
          if (end > now) return true; // en curso
        }
        return false; // finalizado
      });
      // ordenar: en curso primero, luego futuros más cercanos
      list = list.sort((a, b) => {
        const now = Date.now();
        const aStart = a.startDate ? Date.parse(a.startDate) : Infinity;
        const bStart = b.startDate ? Date.parse(b.startDate) : Infinity;
        const aEnd = (a as any).endDate ? Date.parse((a as any).endDate) : null;
        const bEnd = (b as any).endDate ? Date.parse((b as any).endDate) : null;
        const aInProgress = aStart <= now && (!aEnd || aEnd > now);
        const bInProgress = bStart <= now && (!bEnd || bEnd > now);
        if (aInProgress !== bInProgress) return aInProgress ? -1 : 1;
        return aStart - bStart;
      });
    }

    if (!term) return list;

    return list.filter(p => (
      (p.title || '').toLowerCase().includes(term) ||
      (p.content || '').toLowerCase().includes(term) ||
      (p.category || '').toLowerCase().includes(term) ||
      (p.author || '').toLowerCase().includes(term) ||
      (p.location || '').toLowerCase().includes(term)
    ));
  });

  comments = signal<Comment[] | null>(null);
  commentsLoading = signal(false);
  commentsError = signal<string | null>(null);

  // Per-post comments cache and UI state
  postComments = signal<Record<string, Comment[]>>({});
  postCommentsLoading = signal<Record<string, boolean>>({});
  postCommentsError = signal<Record<string, string | null>>({});

  // Cache for user display names by userId
  userCache = signal<Record<string, { name?: string }>>({});

  // Which post is expanded to show inline comments
  expandedPostId = signal<string | null>(null);

  selectedPost = signal<Post | null>(null);

  // Notification system
  notification = signal<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // local form signals
  // use a per-post draft map: { [postId]: draftText }
  commentDrafts = signal<Record<string, string>>({});

  // signals para respuestas anidadas
  activeReplyId = signal<string | null>(null);
  replyDrafts = signal<Record<string, string>>({});
  expandedCommentId = signal<string | null>(null); // Para mostrar respuestas al hacer clic

  // admin create/edit post signals
  user = this.userHook.user;
  newPostTitle = signal('');
  newPostContent = signal('');
  // new post metadata fields
  newPostAuthor = signal('');
  newPostStartDate = signal('');
  newPostEndDate = signal('');
  newPostLocation = signal('');
  newPostCategory = signal('');
  newPostCapacity = signal<number | null>(null);
  newPostImageUrl = signal(''); // Nueva imagen URL
  selectedImage = signal<File | null>(null); // Archivo de imagen seleccionado
  selectedImagePreview = signal<string | null>(null); // Vista previa de la imagen
  showCreateModal = signal(false);
  editingPost = signal<Post | null>(null);

  // Category suggestions
  showCategorySuggestions = signal(false);
  categorySuggestions = CATEGORY_SUGGESTIONS;
  selectedCategories = signal<string[]>([]);
  filteredCategorySuggestions = computed(() => {
    const input = this.newPostCategory().toLowerCase().trim();
    const selected = this.selectedCategories();
    // Show all categories when input is empty or on focus
    if (!input) return this.categorySuggestions.filter(cat => !selected.includes(cat));
    return this.categorySuggestions.filter(cat =>
      cat.toLowerCase().includes(input) && !selected.includes(cat)
    );
  });  // UI state for mobile menus
  activeMenuPostId = signal<string | null>(null);

  // Check if current user has admin role
  isAdmin(): boolean {
    const currentUser = this.user();
    return currentUser?.role === 'admin';
  }

  // Check if user is logged in
  hasUser(): boolean {
    const currentUser = this.user();
    return !!currentUser;
  }

  ngOnInit() {
    this.loadPosts();

    // Check for follow-up query parameters
    this.route.queryParams.subscribe(params => {
      if (params['followUp']) {
        // Set up follow-up mode
        this.followUpPostId.set(params['followUp']);
        // Open create modal with follow-up pre-filled
        if (params['title']) {
          this.newPostTitle.set(`Actualización: ${params['title']}`);
          this.newPostContent.set(`Actualización del evento "${params['title']}":\n\n`);
        }
        this.showCreateModal.set(true);
      }
    });
  }

  ngOnDestroy() {
    // Clean up any subscriptions or timers here if needed
    this.closeNotification();
  }

  // Utility methods
  showNotification(message: string, type: 'success' | 'error' | 'info' = 'info') {
    this.notification.set({ message, type });
    // Auto-hide after 5 seconds
    setTimeout(() => this.closeNotification(), 5000);
  }

  closeNotification() {
    this.notification.set(null);
  }

  togglePostMenu(postId: string) {
    const currentId = this.activeMenuPostId();
    this.activeMenuPostId.set(currentId === postId ? null : postId);
  }

  onSearchChange(value: string) { this.searchTerm.set(value); }
  clearSearch() { this.searchValue = ''; this.searchTerm.set(''); }

  // Navegación pública para banner vacío en modo onlyActiveUpcoming
  navigateToAllEvents() { this.router.navigateByUrl('/events'); }

  closeAllMenus() {
    this.activeMenuPostId.set(null);
    this.showCategorySuggestions.set(false);
  }

  // Category input methods
  onCategoryInput(event: any) {
    this.newPostCategory.set(event.target.value);
    this.showCategorySuggestions.set(true);
  }

  onCategoryFocus() {
    this.showCategorySuggestions.set(true);
  }

  onCategoryBlur() {
    // Delay hiding to allow click on suggestions
    setTimeout(() => {
      this.showCategorySuggestions.set(false);
    }, 150);
  }

  selectCategory(category: string) {
    const current = this.selectedCategories();
    if (!current.includes(category)) {
      this.selectedCategories.set([...current, category]);
    }
    this.newPostCategory.set('');
    // Keep suggestions open for adding more categories
  }

  removeCategory(category: string) {
    const current = this.selectedCategories();
    this.selectedCategories.set(current.filter(c => c !== category));
  }

  // Update the category field to handle multiple categories
  getCategoryString(): string {
    return this.selectedCategories().join(' ');
  }

  // Helper to split categories for display
  getCategoriesArray(categoryString: string): string[] {
    if (!categoryString) return [];
    return categoryString.split(' ').filter(cat => cat.trim());
  }

  async loadPosts() {
    try {
      await this.postHook.list();
      // Prefetch author names for posts to avoid showing raw ids
      const ps = this.posts() || [];
      const userIds = new Set<string>();

      ps.forEach(p => {
        if (p.userId) {
          userIds.add(p.userId);
          this.ensureUserName(p.userId); // No await para que se ejecute en paralelo
        }
      });

      // Purge cached comments for posts that no longer exist
      const currentPosts = this.posts() || [];
      const backendIds = new Set<string>(currentPosts.map(p => (p as any).uuid || (p as any)._id).filter(Boolean));
      const cache = { ...this.postComments() };
      let changed = false;
      Object.keys(cache).forEach(uiId => {
        const resolved = this.resolveBackendPostId(uiId);
        if (!resolved || !backendIds.has(resolved)) {
          delete cache[uiId];
          changed = true;
        }
      });
      if (changed) this.postComments.set(cache);

  // Notificación de carga exitosa eliminada según requerimiento
    } catch (error) {
      this.showNotification('Error al cargar los posts', 'error');
    }
  }

  async openPost(uuid?: string) {
    try {
      if (!uuid) return;

      this.closeAllMenus();
      const post = await this.postHook.get(uuid);
  this.selectedPost.set(post);
  await this.loadComments(uuid);
    } catch (error) {
      this.showNotification('Error al abrir el post', 'error');
    }
  }

  closePost() {
    this.selectedPost.set(null);
    this.comments.set(null);
    this.commentsError.set(null);
  // clear all comment drafts when closing a post view
  this.commentDrafts.set({});
  this.replyDrafts.set({});
  this.activeReplyId.set(null);
  this.expandedCommentId.set(null);
    this.closeAllMenus();
  }

  // FIX: Eliminar petición duplicada y mejorar manejo de errores
  async loadComments(uiPostId: string) {
    if (!uiPostId) return;

    // If already loaded for this UI post, don't fetch again
    const cache = this.postComments();
    if (cache[uiPostId] && cache[uiPostId].length > 0) return;

    // set loading for this post (UI key)
    const loadingState = { ...this.postCommentsLoading() };
    loadingState[uiPostId] = true;
    this.postCommentsLoading.set(loadingState);

    const errorState = { ...this.postCommentsError() };
    errorState[uiPostId] = null;
    this.postCommentsError.set(errorState);

    try {
      // Resolve UI id to backend id for API call
      const backendId = this.resolveBackendPostId(uiPostId);
      if (!backendId) throw new Error('No se pudo resolver id del post para cargar comentarios');

  const comments = await this.commentHook.listByPost(backendId);
  // ensure returned comments actually belong to the backendId (protect against server inconsistencies)
  const filtered = (comments || []).filter(c => (c.postId || '') === backendId);
  const newCache = { ...this.postComments() };
  newCache[uiPostId] = filtered;
      this.postComments.set(newCache);

      // Prefetch comment author names (no await para que se ejecute en paralelo)
      (comments || []).forEach(c => {
        if (c.userId) {
          this.ensureUserName(c.userId);
        }
      });
    } catch (error: any) {
      const errorMessage = error?.message || 'Error cargando comentarios';
      const err = { ...this.postCommentsError() };
      err[uiPostId] = errorMessage;
      this.postCommentsError.set(err);
      this.showNotification(errorMessage, 'error');
    } finally {
      const loadingDone = { ...this.postCommentsLoading() };
      loadingDone[uiPostId] = false;
      this.postCommentsLoading.set(loadingDone);
    }
  }

  // Fetch and cache a user's display name by id
  async ensureUserName(userId: string) {
    if (!userId) return;
    const cache = this.userCache();

    // Si ya tenemos un nombre válido (no undefined y no es el mismo userId), no hacer fetch
    if (cache[userId] && cache[userId].name !== undefined && cache[userId].name !== userId) {
      return;
    }

    // optimistic placeholder to avoid duplicate fetches
    const next = { ...cache };
    next[userId] = { name: undefined };
    this.userCache.set(next);

    try {
      const data = await firstValueFrom(this.api.get<any>(`/users/${userId}`));
      const updated = { ...this.userCache() };
      updated[userId] = { name: data?.name || data?.username || data?.displayName || userId };
      this.userCache.set(updated);
    } catch (e: any) {
      // Si falla, usar el userId como fallback
      const updated = { ...this.userCache() };
      updated[userId] = { name: userId };
      this.userCache.set(updated);
      console.warn(`No se pudo obtener nombre para usuario ${userId}:`, e?.message || e);
    }
  }

  // FIX: Usar userId del usuario autenticado, no string vacío
  async submitComment(postIdArg?: string) {
    // UI post id (may be a local-generated id)
    const uiPostId = postIdArg || (this.selectedPost() ? this.getPostId(this.selectedPost() as Post) : '');
    const drafts = this.commentDrafts();
    const text = (drafts[uiPostId] || '').trim();
    const currentUser = this.user();

    // resolve backend id from UI id
    const backendPostId = this.resolveBackendPostId(uiPostId);

    if (!text || !backendPostId || !currentUser) {
      this.showNotification('No se puede crear el comentario. Verifica que estés logueado.', 'error');
      return;
    }

    try {
      const userId = (currentUser as any)._id || (currentUser as any).uuid || '';

      await this.commentHook.create({
        content: text,
        userId,
        postId: backendPostId
      });

      // clear the draft for this UI post
      const next = { ...this.commentDrafts() };
      next[uiPostId] = '';
      this.commentDrafts.set(next);
      this.showNotification('Comentario creado exitosamente', 'success');

      // Recargar comentarios: invalidate cache for UI post key and reload
      const newCache = { ...this.postComments() };
      newCache[uiPostId] = [];
      this.postComments.set(newCache);
      await this.loadComments(uiPostId);
    } catch (error: any) {
      const errorMessage = error?.message || 'Error creando comentario';
      this.showNotification(errorMessage, 'error');
    }
  }

  // Toggle inline comments for a post (expand/collapse)
  async toggleComments(postId: string) {
    const current = this.expandedPostId();
    if (current === postId) {
      // collapse
      this.expandedPostId.set(null);
      this.selectedPost.set(null);
      return;
    }

  // expand: load comments for this post (do NOT set selectedPost to avoid opening modal)
    this.expandedPostId.set(postId);
    await this.loadComments(postId);

    // after comments are rendered, focus the textarea for this post (if present)
    await new Promise(r => setTimeout(r, 80));
    try {
      const selector = `textarea[data-post-id="${postId}"]`;
      const el = document.querySelector(selector) as HTMLTextAreaElement | null;
      if (el && !el.disabled) el.focus();
    } catch {
      // ignore
    }
  }

  // Find a Post object by its UI id (getPostId(post))
  private findPostByUiId(uiId: string): Post | undefined {
    const ps = this.posts() || [];
    return ps.find(p => this.getPostId(p) === uiId);
  }

  // Resolve a UI id into the backend post id (uuid or _id).
  private resolveBackendPostId(uiId: string): string | null {
    if (!uiId) return null;
    // If uiId looks like a generated local id, try to find the real post
    if (uiId.startsWith('local-')) {
      const p = this.findPostByUiId(uiId);
      if (!p) return null;
      return (p as any).uuid || (p as any)._id || null;
    }
    // otherwise assume it's already a backend id
    return uiId;
  }

  // Navigate to post detail view
  viewPostDetail(post: Post) {
    const postId = this.getPostId(post);
    const backendId = this.resolveBackendPostId(postId);
    if (backendId) {
      this.router.navigate(['/post', backendId]);
    }
  }

  // Navigate to post detail with comments visible
  viewPostComments(post: Post) {
    const postId = this.getPostId(post);
    const backendId = this.resolveBackendPostId(postId);
    if (backendId) {
      this.router.navigate(['/post', backendId], { queryParams: { showComments: 'true' } });
    }
  }

  // ...comments focus logic handled by toggleComments

  openCreateModal() {
    this.showCreateModal.set(true);
    this.newPostTitle.set('');
    this.newPostContent.set('');
  // clear metadata fields when opening create modal
  this.newPostAuthor.set('');
  this.newPostStartDate.set('');
  this.newPostLocation.set('');
  this.newPostCategory.set('');
  this.newPostCapacity.set(null);
    this.closeAllMenus();
  }

  closeCreateModal() {
    this.showCreateModal.set(false);
    this.newPostTitle.set('');
    this.newPostContent.set('');
  // also clear metadata when closing
  this.newPostAuthor.set('');
  this.newPostStartDate.set('');
  this.newPostEndDate.set('');
  this.newPostLocation.set('');
  this.newPostCategory.set('');
  this.newPostCapacity.set(null);
  this.newPostImageUrl.set('');
  this.selectedImage.set(null);
  this.selectedImagePreview.set(null);
  this.selectedCategories.set([]);
  // clear follow-up fields
  this.followUpPostId.set('');
  this.followUpImageUrl.set('');
  // clear editing state when closing the modal
  this.editingPost.set(null);
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
    const currentUser = this.user();
    if (!currentUser) {
      this.showNotification('Debes iniciar sesión para crear posts', 'error');
      return;
    }

    if (currentUser.role !== 'admin') {
      this.showNotification('No tienes permisos para crear posts', 'error');
      return;
    }

    const title = this.newPostTitle().trim();
    const content = this.newPostContent().trim();

    if (!title || !content) {
      this.showNotification('El título y contenido son obligatorios', 'error');
      return;
    }

    try {
      const userId = (currentUser as any)._id || (currentUser as any).uuid || '';
      const followUpId = this.followUpPostId();

      // Si hay una imagen seleccionada, convertirla a base64 o manejarla
      let imageUrl = this.newPostImageUrl();
      if (this.selectedImage()) {
        // Por ahora usamos la vista previa como URL temporal
        // En una implementación real, aquí subirías el archivo a un servidor
        imageUrl = this.selectedImagePreview() || '';
      }

      await this.postHook.create({
        title,
        content,
        userId,
        author: this.newPostAuthor() || undefined,
  startDate: this.newPostStartDate() || undefined,
  endDate: this.newPostEndDate() || undefined,
        location: this.newPostLocation() || undefined,
        category: this.getCategoryString() || undefined,
        capacity: this.newPostCapacity() || undefined,
        postId: followUpId || undefined, // Para seguimiento
        imageUrl: imageUrl || undefined,
      });

      this.closeCreateModal();
      this.showNotification('Post creado exitosamente', 'success');
      await this.loadPosts();
    } catch (error: any) {
      const errorMessage = error?.message || 'Error creando el post';
      this.showNotification(errorMessage, 'error');
    }
  }

  openEditModal(post: Post) {
    this.editingPost.set(post);
    this.newPostTitle.set(post.title);
    this.newPostContent.set(post.content);
  // populate metadata fields for editing
  const p: any = post as any;
  this.newPostAuthor.set(p.author || '');
  this.newPostStartDate.set(p.startDate || '');
  this.newPostEndDate.set((p as any).endDate || '');
  this.newPostLocation.set(p.location || '');
  this.newPostCategory.set(p.category || '');
  this.newPostCapacity.set(p.capacity ?? null);
  // populate image fields so change detection works
  this.newPostImageUrl.set((p.imageUrl || '') as string);
  this.selectedImage.set(null);
  this.selectedImagePreview.set(p.imageUrl || null);
    // Reuse the create modal for editing mode
    this.showCreateModal.set(true);
    this.closeAllMenus();
  }

  closeEditModal() {
    // keep API for compatibility but delegate to closeCreateModal
    this.closeCreateModal();
    this.editingPost.set(null);
  }

  async updatePost() {
    const post = this.editingPost();
    if (!post) return;

    const title = this.newPostTitle().trim();
    const content = this.newPostContent().trim();

    if (!title || !content) {
      this.showNotification('El título y contenido son obligatorios', 'error');
      return;
    }

    try {
      const postId = post.uuid || post._id || '';
      // Handle image: if a new image file was selected, use preview as temporary URL
      let imageUrl = this.newPostImageUrl();
      if (this.selectedImage()) {
        imageUrl = this.selectedImagePreview() || imageUrl;
      }

      await this.postHook.update(postId, {
        title,
        content,
        author: this.newPostAuthor() || undefined,
  startDate: this.newPostStartDate() || undefined,
  endDate: this.newPostEndDate() || undefined,
        location: this.newPostLocation() || undefined,
        category: this.newPostCategory() || undefined,
        capacity: this.newPostCapacity() || undefined,
        imageUrl: imageUrl || undefined,
      });

  // close the unified modal
  this.closeCreateModal();
      this.showNotification('Post actualizado exitosamente', 'success');
      await this.loadPosts();
    } catch (error: any) {
      const errorMessage = error?.message || 'Error actualizando el post';
      this.showNotification(errorMessage, 'error');
    }
  }

  // Returns true if the form values differ from the original editingPost values
  isEditingChanged(): boolean {
    const post = this.editingPost();
    if (!post) return false;

    const titleChanged = (this.newPostTitle().trim() !== ((post.title || '').trim()));
    const contentChanged = (this.newPostContent().trim() !== ((post.content || '').trim()));

    const p: any = post as any;
    const authorChanged = (this.newPostAuthor().trim() !== ((p.author || '').trim()));
    const startChanged = (this.newPostStartDate() || '') !== (p.startDate || '');
    const endChanged = (this.newPostEndDate() || '') !== ((p as any).endDate || '');
    const locationChanged = (this.newPostLocation().trim() !== ((p.location || '').trim()));
    const categoryChanged = (this.newPostCategory().trim() !== ((p.category || '').trim()));
    const capacityChanged = (this.newPostCapacity() ?? null) !== (p.capacity ?? null);

    const anyChanged = titleChanged || contentChanged || authorChanged || startChanged || endChanged || locationChanged || categoryChanged || capacityChanged;

  // detect image change: either selectedImage set or newPostImageUrl differs from post.imageUrl
  const imageChanged = !!this.selectedImage() || (this.newPostImageUrl().trim() !== ((p.imageUrl || '').trim()));

  const anyChangedWithImage = anyChanged || imageChanged;

    // Only consider changed if title and content are non-empty (validation)
    const hasRequired = this.newPostTitle().trim().length > 0 && this.newPostContent().trim().length > 0;

  return anyChangedWithImage && hasRequired;
  }

  async deletePost(uuid?: string) {
    if (!uuid) return;
    // Eliminación directa (sin confirm) solicitada para vista móvil / flujo rápido

    try {
      await this.postHook.remove(uuid);

      this.showNotification('Post eliminado exitosamente', 'success');
      await this.loadPosts();

      // Cerrar modal de post si es el que se eliminó
      const currentPost = this.selectedPost();
      if (currentPost && (currentPost.uuid === uuid || currentPost._id === uuid)) {
        this.closePost();
      }

      this.closeAllMenus();
    } catch (error: any) {
      const errorMessage = error?.message || 'Error eliminando el post';
      this.showNotification(errorMessage, 'error');
    }
  }

  // Utility methods for UI
  trackByPostId(index: number, post: Post): string {
    return post.uuid || post._id || index.toString();
  }

  // Update the draft text for a specific post
  onDraftChange(postId: string, value: string) {
    const next = { ...this.commentDrafts() };
    next[postId] = value;
    this.commentDrafts.set(next);
  }

  // Comment menu/edit state
  activeCommentMenuId = signal<string | null>(null);
  editingCommentId = signal<string | null>(null);
  editCommentDraft = signal<string>('');

  toggleCommentMenu(commentId: string) {
    const cur = this.activeCommentMenuId();
    this.activeCommentMenuId.set(cur === commentId ? null : commentId);
  }

  canEditOrDeleteComment(comment: Comment): boolean {
    const current = this.user();
    if (!current) return false;
    const uid = (current as any)._id || (current as any).uuid || '';
    return current.role === 'admin' || uid === (comment as any).userId;
  }

  startEditComment(comment: Comment) {
    if (!this.canEditOrDeleteComment(comment)) {
      this.showNotification('No tienes permisos para editar este comentario', 'error');
      return;
    }
    const id = (comment as any)._id || (comment as any).uuid || '';
    this.editingCommentId.set(id);
    this.editCommentDraft.set(comment.content || '');
    this.activeCommentMenuId.set(null);
  }

  cancelEditComment() {
    this.editingCommentId.set(null);
    this.editCommentDraft.set('');
  }

  async saveEditComment(comment: Comment) {
    const id = (comment as any)._id || (comment as any).uuid || '';
    const text = this.editCommentDraft().trim();
    if (!text) {
      this.showNotification('El comentario no puede estar vacío', 'error');
      return;
    }
    try {
      await this.commentHook.update(id, { content: text, userId: comment.userId, postId: comment.postId });
      // update local cache for the post containing this comment
      const uiKeys = Object.keys(this.postComments());
      for (const uiKey of uiKeys) {
        const arr = [...(this.postComments() as any)[uiKey]];
        const idx = arr.findIndex((c: any) => (c._id || c.uuid) === id);
        if (idx !== -1) {
          arr[idx] = { ...arr[idx], content: text };
          const copy = { ...this.postComments() };
          copy[uiKey] = arr;
          this.postComments.set(copy);
          break;
        }
      }
      this.cancelEditComment();
      this.showNotification('Comentario actualizado', 'success');
    } catch (e: any) {
      this.showNotification(e?.message || 'Error actualizando comentario', 'error');
    }
  }

  async deleteComment(comment: Comment) {
    const id = (comment as any)._id || (comment as any).uuid || '';
    try {
      await this.commentHook.remove(id, comment.userId);
      // remove from local cache
      const uiKeys = Object.keys(this.postComments());
      for (const uiKey of uiKeys) {
        const arr = [...(this.postComments() as any)[uiKey]];
        const newArr = arr.filter((c: any) => (c._id || c.uuid) !== id);
        if (newArr.length !== arr.length) {
          const copy = { ...this.postComments() };
          copy[uiKey] = newArr;
          this.postComments.set(copy);
          break;
        }
      }
      this.showNotification('Comentario eliminado', 'success');
    } catch (e: any) {
      this.showNotification(e?.message || 'Error eliminando comentario', 'error');
    }
  }

  // Métodos para manejar respuestas anidadas
  toggleReply(commentId: string) {
    const current = this.activeReplyId();
    this.activeReplyId.set(current === commentId ? null : commentId);

    // Si cerramos, limpiar el draft
    if (current === commentId) {
      const next = { ...this.replyDrafts() };
      delete next[commentId];
      this.replyDrafts.set(next);
    }
  }

  cancelReply() {
    const currentId = this.activeReplyId();
    if (currentId) {
      const next = { ...this.replyDrafts() };
      delete next[currentId];
      this.replyDrafts.set(next);
    }
    this.activeReplyId.set(null);
  }

  onReplyDraftChange(commentId: string, value: string) {
    const next = { ...this.replyDrafts() };
    next[commentId] = value;
    this.replyDrafts.set(next);
  }

  async submitReply(commentId: string, postId: string) {
    const text = this.replyDrafts()[commentId]?.trim();
    if (!text) {
      this.showNotification('La respuesta no puede estar vacía', 'error');
      return;
    }

    try {
      const current = this.user();
      if (!current) {
        this.showNotification('Debes iniciar sesión para responder', 'error');
        return;
      }

      await this.commentHook.createReply({
        content: text,
        postId: postId,
        userId: (current as any).uuid || (current as any)._id || ''
      }, commentId);

      // Limpiar el draft y cerrar el formulario
      const next = { ...this.replyDrafts() };
      delete next[commentId];
      this.replyDrafts.set(next);
      this.activeReplyId.set(null);

      // Recargar comentarios para mostrar la nueva respuesta
      await this.loadComments(postId);

      this.showNotification('Respuesta agregada', 'success');
    } catch (e: any) {
      this.showNotification(e?.message || 'Error agregando respuesta', 'error');
    }
  }

  isPostMenuActive(postId: string): boolean {
    return this.activeMenuPostId() === postId;
  }

  getPostId(post: Post): string {
  // Ensure each post has a stable unique id for UI caching.
  // If backend id fields are missing, attach a generated _localId to the post object.
  const p: any = post as any;
  if (p.uuid) return p.uuid;
  if (p._id) return p._id;
  if (p._localId) return p._localId;
  // generate a compact local id and persist it on the object instance
  p._localId = `local-${Math.random().toString(36).slice(2, 9)}`;
  return p._localId;
  }

  formatDate(dateString: string): string {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Fecha inválida';
    }
  }

  // Helper to get display name for a post's author with safe fallbacks
  getPostAuthorName(post: Post): string {
    const p: any = post as any;
    const uid = p.userId || '';
    if (!uid) return 'Usuario';

    const cached = this.userCache()[uid];
    if (cached) {
      if (cached.name === undefined) return 'Cargando...';
      if (cached.name && cached.name !== uid) return cached.name;
    }

    // Si no hay cache, intentar cargar el nombre
    if (!cached) {
      this.ensureUserName(uid);
      return 'Cargando...';
    }

    return p.authorName || p.userName || (p.user && p.user.name) || uid || 'Usuario';
  }

  // Métodos para filtrar comentarios principales y respuestas
  getMainComments(postId: string): Comment[] {
    const allComments = this.postComments()[postId] || [];
    return allComments.filter(comment => !comment.commentId);
  }

  getRepliesForComment(commentId: string, postId: string): Comment[] {
    const allComments = this.postComments()[postId] || [];
    return allComments.filter(comment => comment.commentId === commentId);
  }

  toggleCommentExpansion(commentId: string) {
    const current = this.expandedCommentId();
    this.expandedCommentId.set(current === commentId ? null : commentId);
  }

  isCommentExpanded(commentId: string): boolean {
    return this.expandedCommentId() === commentId;
  }

  // Helper to get display name for a comment's author with safe fallbacks
  getCommentAuthorName(comment: Comment): string {
    const c: any = comment as any;
    const uid = c.userId || '';
    if (!uid) return 'Usuario';

    const cached = this.userCache()[uid];
    if (cached) {
      if (cached.name === undefined) return 'Cargando...';
      if (cached.name && cached.name !== uid) return cached.name;
    }

    // Si no hay cache, intentar cargar el nombre
    if (!cached) {
      this.ensureUserName(uid);
      return 'Cargando...';
    }

    return c.authorName || c.userName || (c.user && c.user.name) || uid || 'Usuario';
  }

  // Métodos para manejo de estado de eventos y actualizaciones
  getEventStatus(post: Post): 'upcoming' | 'ongoing' | 'finished' | 'no-date' {
    if (!post.startDate) return 'no-date';

    const now = Date.now();
    const start = Date.parse(post.startDate);
    const end = post.endDate ? Date.parse(post.endDate) : null;

    if (start > now) return 'upcoming'; // Futuro
    if (start <= now) {
      if (!end) return 'ongoing'; // En curso sin fecha fin
      if (end > now) return 'ongoing'; // En curso
      return 'finished'; // Finalizado
    }

    return 'no-date';
  }

  getEventStatusText(post: Post): string {
    const status = this.getEventStatus(post);
    switch (status) {
      case 'upcoming': return 'Próximo';
      case 'ongoing': return 'En curso';
      case 'finished': return 'Finalizado';
      case 'no-date': return 'Sin fecha';
      default: return '';
    }
  }

  getEventStatusClass(post: Post): string {
    const status = this.getEventStatus(post);
    return `event-status event-status--${status}`;
  }

  canCreateFollowUp(post: Post): boolean {
    const status = this.getEventStatus(post);
    return status === 'ongoing' || status === 'finished';
  }

  // Método para crear actualización/seguimiento del post
  createFollowUpPost(originalPost: Post) {
    const status = this.getEventStatus(originalPost);
    const statusText = this.getEventStatusText(originalPost);

    // Pre-llenar el modal con información mínima para actualización
    this.newPostTitle.set(`Actualización: ${originalPost.title}`);
    this.newPostContent.set(`Actualización del evento "${originalPost.title}" (${statusText}):\n\n`);

    // Campos que NO se incluyen en actualizaciones:
    this.newPostAuthor.set(''); // Sin autor
    this.newPostStartDate.set(''); // Sin fecha de inicio
    this.newPostEndDate.set(''); // Sin fecha de fin
    this.newPostCategory.set(''); // Sin categorías (usará las del original)
    this.newPostCapacity.set(null); // Sin cupos

    // Solo lugar es opcional por si el evento cambia de lugar
    this.newPostLocation.set(''); // Vacío, opcional si cambia

    // Establecer el postId del post original para el seguimiento
    this.followUpPostId.set(originalPost.uuid || originalPost._id || '');
    this.followUpImageUrl.set('');

    this.showCreateModal.set(true);
  }

  // Nuevos signals para seguimiento
  followUpPostId = signal<string>('');
  followUpImageUrl = signal<string>('');

  // Computed para saber si es un seguimiento
  isFollowUpMode = computed(() => this.followUpPostId().length > 0);

  // Método para manejar errores de imagen
  onImageError(event: Event) {
    const target = event.target as HTMLImageElement;
    if (target) {
      target.style.display = 'none';
    }
  }
}
