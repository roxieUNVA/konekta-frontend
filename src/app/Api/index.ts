import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { logoutApi } from '../Services/Auth';

@Injectable({
  providedIn: 'root'
})
export class KonektaApiService {
  private readonly baseURL: string;
  private readonly jwtSecret: string;

  constructor(private http: HttpClient, private router: Router) {
    this.baseURL = environment.apiUrl;
    this.jwtSecret = environment.jwtSecret;
  }

  private getHeaders(): HttpHeaders {
    let headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'api-key': this.jwtSecret
    });

    // Obtener token del localStorage si existe
    const token = localStorage.getItem('token');
      if (token) {
        try {
          const parsedToken = JSON.parse(token);
          headers = headers.set('Authorization', `Bearer ${parsedToken}`);
        } catch (e) {
          // mantener solo advertencia mínima
          // token inválido en localStorage; se ignora silenciosamente
        }
      }

    return headers;
  }

  private handleAuthError = (error: any): Observable<never> => {
    if (error.status === 401 || error.status === 403) {
      // Token expirado o no válido, cerrar sesión
      logoutApi();
      this.router.navigate(['/']);
    }
    return throwError(() => error);
  };

  // Método GET genérico
  get<T>(endpoint: string): Observable<T> {
    const url = `${this.baseURL}${endpoint}`;
    const headers = this.getHeaders();
    return this.http.get<any>(url, { headers, observe: 'response' as 'body' }).pipe(
      map((resp: any) => resp.body as T),
      catchError(this.handleAuthError)
    );
  }

  // Método POST genérico
  post<T>(endpoint: string, data: any): Observable<T> {
  const url = `${this.baseURL}${endpoint}`;
  const headers = this.getHeaders();
    // información mínima en producción: no loguear body
  return this.http.post<T>(url, data, { headers }).pipe(
    catchError(this.handleAuthError)
  );
  }

  // Método PUT genérico
  put<T>(endpoint: string, data: any): Observable<T> {
    return this.http.put<T>(`${this.baseURL}${endpoint}`, data, {
      headers: this.getHeaders()
    }).pipe(
      catchError(this.handleAuthError)
    );
  }

  // Método DELETE genérico (sin body) – elimina Content-Type para evitar 400 en algunos backends
  delete<T>(endpoint: string): Observable<T> {
    const url = `${this.baseURL}${endpoint}`;
    // Quitar Content-Type porque no hay body
    let headers = this.getHeaders();
    if (headers.has('Content-Type')) {
      headers = headers.delete('Content-Type');
    }
    return this.http.delete<T>(url, { headers }).pipe(
      catchError(this.handleAuthError)
    );
  }

  // Método DELETE con body opcional
  deleteWithBody<T>(endpoint: string, body: any): Observable<T> {
    const url = `${this.baseURL}${endpoint}`;
    const headers = this.getHeaders();
    return this.http.request<T>('DELETE', url, { body, headers }).pipe(
      catchError(this.handleAuthError)
    );
  }
}
