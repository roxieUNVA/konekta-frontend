import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { UserApiService } from '../../Services/User';
import { getTokenApi, logoutApi } from '../../Services/Auth';
import { User } from '../../Models/user';

@Component({
  selector: 'app-user',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './user.html',
  styleUrl: './user.scss'
})
export class UserPage implements OnInit {
  private userApi = inject(UserApiService);
  router = inject(Router); // made public for template back button

  loading = true;
  saving = false;
  deleting = false;
  error: string | null = null;
  saved = false;

  form: { name: string; email: string } | null = null;
  private userUuid: string | null = null;
  editing = false;
  dirty = false;
  private original: { name: string; email: string } | null = null;

  ngOnInit() {
    this.extractUuidFromToken();
    if (!this.userUuid) {
      this.error = 'Token inválido. Inicia sesión nuevamente';
      this.loading = false;
      return;
    }
    this.load();
  }

  private extractUuidFromToken() {
    const token = getTokenApi();
    if (!token) return;
    try {
      const parts = token.split('.');
      if (parts.length >= 2) {
        const payload = JSON.parse(atob(parts[1]));
        this.userUuid = payload.uuid || payload.user_uuid || null;
      }
    } catch (_) { /* ignore */ }
  }

  async load() {
    this.loading = true;
    this.error = null;
    try {
      if (!this.userUuid) throw new Error('Sin uuid de usuario');
      const user: User = await this.userApi.get(this.userUuid);
  this.form = { name: user.name, email: user.email };
  this.original = { ...this.form };
    } catch (e: any) {
      this.error = e?.error?.message || e?.message || 'Error cargando usuario';
    } finally {
      this.loading = false;
    }
  }

  async onSave() {
    if (!this.form || !this.userUuid) return;
    this.saving = true;
    this.error = null;
    this.saved = false;
    const payload: any = { name: this.form.name, email: this.form.email };
    try {
      const updated = await this.userApi.update(this.userUuid, payload);
      this.saved = true;
      // reflect canonical values from backend (e.g. email normalizado)
      this.form.name = updated.name;
      this.form.email = updated.email;
  this.original = { name: updated.name, email: updated.email };
  this.dirty = false;
    } catch (e: any) {
  const serverMsg = e?.error?.message || e?.message;
  this.error = serverMsg ? `Error guardando: ${serverMsg}` : 'Error guardando';
    } finally {
      this.saving = false;
      setTimeout(() => { this.saved = false; }, 1800);
    }
  }

  enableEdit() {
    this.editing = true;
  this.dirty = false;
  if (this.form) this.original = { ...this.form };
  }

  // Opcional: salir de modo edición (podrías añadir botón cancelar en el futuro)
  disableEdit() {
    this.editing = false;
    if (this.original && this.form) {
      this.form.name = this.original.name;
      this.form.email = this.original.email;
    }
    this.dirty = false;
  }

  // Detección de cambios simple (podría hacerse con getter pero preferimos mutar flag para menos cálculos)
  onFieldChange() {
    if (!this.form || !this.original) { this.dirty = false; return; }
    this.dirty = this.form.name !== this.original.name || this.form.email !== this.original.email;
  }

  async onDelete() {
    if (!this.userUuid) return;
    if (!confirm('¿Seguro que deseas eliminar tu cuenta? Esta acción es irreversible.')) return;
    this.deleting = true;
    this.error = null;
    try {
      await this.userApi.remove(this.userUuid);
      logoutApi();
      this.router.navigateByUrl('/signup');
    } catch (e: any) {
      this.error = e?.error?.message || e?.message || 'Error eliminando usuario';
    } finally {
      this.deleting = false;
    }
  }
}
