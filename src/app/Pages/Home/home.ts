import { Component, inject, OnInit, signal, computed, effect } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { logoutApi, isAuthenticatedApi } from '../../Services/Auth';
import { useUser } from '../../Hooks/Auth/useUser';
import { Buttom } from '../../Components';
import { usePost } from '../../Hooks/Post/usePost';
import { KonektaApiService } from '../../Api';
import { firstValueFrom } from 'rxjs';
import { CommentApiService } from '../../Services/Comment/comment';
import { computed as ngComputed } from '@angular/core';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, Buttom],
  templateUrl: './home.html',
  styleUrl: './home.scss'
})
export class Home implements OnInit {
  private router = inject(Router);
  private userHook = useUser();
  private postHook = usePost();

  // búsqueda rápida de eventos (posts)
  search = signal('');
  get searching() { return this.search().length > 0; }

  // Solo eventos principales (no follow-ups)
  mainEvents = computed(() => {
    const list = this.postHook.posts();
    if (!list) return [];
    // Filtrar solo posts que NO son follow-ups (no tienen postId)
    const mainPosts = list.filter((post: any) => !post.postId);
    // ordenar por createdAt descendente si existe
    const sorted = [...mainPosts].sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  return sorted.slice(0, 5);
  });


  /**
   * Eventos en curso: aquellos cuyo rango de fechas engloba el momento actual.
   * Criterios:
   *  - Deben ser posts principales (sin postId)
   *  - Deben tener startDate y endDate válidas
   *  - now >= startDate && now <= endDate
   * Orden: por fecha de inicio ascendente (lo más próximo primero) y fallback a createdAt.
   * Límite: 4 items.
   */
  ongoingEvents = computed(() => {
    const list = this.postHook.posts();
    if (!list) return [];
    const now = Date.now();
    const inProgress = list.filter((p: any) => {
      if (p.postId) return false; // excluir follow-ups
      if (!p.startDate || !p.endDate) return false;
      const start = new Date(p.startDate).getTime();
      const end = new Date(p.endDate).getTime();
      if (isNaN(start) || isNaN(end)) return false;
      return start <= now && now <= end;
    });
    // Ordenar: prioritizar eventos que están por finalizar más pronto, luego por startDate
    inProgress.sort((a: any, b: any) => {
      const aEnd = new Date(a.endDate).getTime();
      const bEnd = new Date(b.endDate).getTime();
      if (aEnd !== bEnd) return aEnd - bEnd;
      const aStart = new Date(a.startDate).getTime();
      const bStart = new Date(b.startDate).getTime();
      if (aStart !== bStart) return aStart - bStart;
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });
    return inProgress.slice(0, 4);
  });

  recentPosts = computed(() => {
    return this.mainEvents();
  });

  filteredPosts = computed(() => {
    const term = this.search().toLowerCase().trim();
    if (!term) return this.recentPosts();
    return this.recentPosts().filter(p => (p.title || '').toLowerCase().includes(term) || (p.content || '').toLowerCase().includes(term));
  });

  // ==========================
  // PIZARRA LATERAL (actividad del usuario)
  // ==========================
  private api = inject(KonektaApiService);

  // Conteo de comentarios del usuario (intentaremos consultar /comments?userId=...)
  totalUserComments = signal<number>(0);
  latestUserComments = signal<any[] | null>(null);

  userPosts = computed(() => {
    const current = this.userHook.user();
    const list = this.postHook.posts();
    if (!current || !list) return [];
    // Mostrar solo si el usuario es admin (solicitud: "las publicaciones que cada admin haga")
    if ((current as any).role !== 'admin' && (current as any).role !== 'admin') return [];

    const uid = (current as any).uuid || (current as any)._id || null;

    const matches = list.filter((p: any) => {
      // solo posts principales (no follow-ups)
      if (p.postId) return false;
      // varios formatos posibles de userId en posts (uuid, _id, nombre en author)
      return (uid && (p.userId === uid || p.userId === (current as any)._id)) || p.author === current.name;
    });

    // Deduplicar por uuid o _id
    const map = new Map<string, any>();
    matches.forEach((m: any) => {
      const key = m.uuid || m._id || `${m.title || ''}-${m.createdAt || ''}-${m.userId || ''}`;
      if (!map.has(key)) map.set(key, m);
    });
    return Array.from(map.values());
  });

  latestUserPosts = computed(() => {
    return [...this.userPosts()].sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).slice(0, 5);
  });

  totalUserPosts = computed(() => this.userPosts().length);

  // Intentar obtener comentarios del backend filtrando por userId
  private async fetchUserCommentsCount() {
    const current = this.userHook.user();
    if (!current) return this.totalUserComments.set(0);
    const uid = (current as any).uuid || (current as any)._id || null;
    if (!uid) return this.totalUserComments.set(0);

    // Primero intentar endpoint directo: /comments?userId=...
    try {
      const data = await firstValueFrom(this.api.get<any[]>(`/comments?userId=${uid}`));
      if (Array.isArray(data)) {
        // Filtrar cliente-side por si el backend responde con todos los comentarios
        const filtered = data.filter((c: any) => {
          return c && (c.userId === uid || c.userId === (current as any)._id || c.userId === (current as any).uuid);
        });
        if (filtered.length > 0) {
          this.totalUserComments.set(filtered.length);
          // ordenar y setear últimos comentarios
          filtered.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
          this.latestUserComments.set(filtered.slice(0, 5));
          return;
        }
      }
    } catch (_e) {
      // ignorar y probar fallback
    }

    // Fallback: iterar por posts y contar comentarios cuya userId === uid
    try {
      const commentService = inject(CommentApiService);
      const posts = this.postHook.posts() || [];
      let count = 0;
      for (const p of posts) {
        try {
          const comments = await commentService.listByPost(p.uuid || p._id || '');
          if (Array.isArray(comments)) {
            count += comments.filter((c: any) => c.userId === uid).length;
          }
        } catch (_e) {
          // no hacer nada si una petición falla
        }
      }
      this.totalUserComments.set(count);
      // also populate latestUserComments from fallback approach by collecting recent comments
      try {
        const recent: any[] = [];
        for (const p of posts) {
          try {
            const comments = await commentService.listByPost(p.uuid || p._id || '');
            if (Array.isArray(comments)) {
              for (const c of comments) {
                if (c.userId === uid) recent.push(c);
              }
            }
          } catch (_e) {}
        }
        // ordenar por fecha y limitar
        recent.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        this.latestUserComments.set(recent.slice(0,5));
      } catch (_e) {
        this.latestUserComments.set(null);
      }
      return;
    } catch (_e) {
  this.totalUserComments.set(0);
  this.latestUserComments.set(null);
      return;
    }
  }

  ngOnInit() {
    this.userHook.refetch();
    this.postHook.list();
  }

  constructor() {
    // React to changes on the user signal and refresh comment count
    effect(() => {
      const u = this.userHook.user();
      // kick-off when user becomes available
      if (u) {
        // populate comments count (fire-and-forget)
        this.fetchUserCommentsCount();
  // try to load recent posts as well
  this.latestUserComments.set(null);
      } else {
        this.totalUserComments.set(0);
      }
    }, { allowSignalWrites: true });
  }

  get isAuthenticated() {
    return isAuthenticatedApi();
  }

  get user() {
    return this.userHook.user();
  }

  logout() {
    logoutApi(); // Borra el token del localStorage
    // No redirigir, simplemente recargar la vista actual
    window.location.reload();
  }

  navigateToLogin() {

  this.router.navigateByUrl('/login');
  }

  navigateToSignup() {

  this.router.navigateByUrl('/signup');
  }

  // navegación a eventos completos
  goToEvents() { this.router.navigateByUrl('/events'); }
  goToPost(uuid: string) { if (uuid) this.router.navigateByUrl(`/post/${uuid}`); else this.router.navigateByUrl('/events'); }
  goToEventDetail(uuid?: string) {
    if (uuid) {
      // navegar al detalle del post
      this.router.navigateByUrl(`/post/${uuid}`);
    } else {
      this.router.navigateByUrl('/events');
    }
  }
  searchValue = '';
}
