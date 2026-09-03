import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

export interface VenezuelaDolarRate {
  moneda: string;
  fuente: string;
  nombre: string;
  compra: number | null;
  venta: number | null;
  promedio: number | null;
  fechaActualizacion: string;
}

@Injectable({
  providedIn: 'root',
})
export class DolarService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = 'https://ve.dolarapi.com/v1/dolares';

  obtenerOficial(): Observable<VenezuelaDolarRate> {
    return this.http.get<VenezuelaDolarRate>(`${this.apiUrl}/oficial`);
  }

  obtenerTasaBcvDelDia(): Observable<number> {
    return this.obtenerOficial().pipe(
      map((response) => {
        const rate = response.promedio ?? response.venta ?? response.compra ?? 0;
        return Number.isFinite(rate) ? rate : 0;
      })
    );
  }
}
