import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppStateService } from '../core/app-state.service';
import { Order, OrderStatus, PaymentMethod, RestaurantId } from '../core/models';
import { formatTableNumberLabel } from '../core/table-layouts';

interface ProductSales {
  productId: string;
  name: string;
  quantity: number;
  sales: number;
}

interface InventoryArticleSales {
  articleId: string;
  name: string;
  quantity: number;
  unit: string;
}

interface LocalSales {
  restaurantId: RestaurantId;
  label: string;
  sales: number;
}

interface CategorySales {
  categoryId: string;
  label: string;
  sales: number;
  quantity: number;
}

interface ReportOrderSummary {
  id: string;
  clientName: string;
  paidAt: string;
  total: number;
  paymentMethod: string;
  paymentReference: string;
}

type PaymentMethodFilter = PaymentMethod | 'SIN_REGISTRO';

@Component({
  selector: 'app-reports-page',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyPipe, DatePipe],
  template: `
    <section class="page">
      @if (!canAccessReportes()) {
        <article class="panel">
          <h2>Acceso restringido</h2>
          <p>Tu perfil no tiene permisos para ver Reportes.</p>
        </article>
      } @else {
      <div class="reports-surface">
        <header class="page-header report-hero">
          <div>
            <h1>Reportes</h1>
            <p class="hero-subtitle">Panel de Reporte</p>
          </div>

          <div class="report-actions-row">
            <button type="button" class="btn-action" (click)="openReportOptionsModal()">
              <span>Genera reporte</span>
            </button>
            <button type="button" class="btn-action btn-action-alt" (click)="openProductChartModal()">
              <span>Venta de Productos</span>
            </button>
          </div>
        </header>

        <article class="filters-strip">
          <label class="summary-field compact-field">
            <span>Local</span>
            <select [(ngModel)]="restaurant">
              @if (canSelectAllRestaurants()) {
                <option value="ALL">Todos</option>
              }
              @for (local of localKeys(); track local) {
                <option [value]="local">{{ localLabel(local) }}</option>
              }
            </select>
          </label>

          <label class="summary-field compact-field">
            <span>Fecha</span>
            <select [(ngModel)]="periodPreset" (ngModelChange)="applyPreset($event)">
              <option value="DIARIO">Ultimas 24 horas</option>
              <option value="SEMANAL">Ultimos 7 dias</option>
              <option value="MENSUAL">Ultimos 30 dias</option>
              <option value="RANGO">Rango manual</option>
            </select>
          </label>

          <label class="summary-field compact-field">
            <span>Desde (Fecha y Hora)</span>
            <input
              type="datetime-local"
              [ngModel]="fromDateTime()"
              (ngModelChange)="onRangeFieldChange('from', $event)"
              (input)="onRangeFieldChange('from', $any($event.target).value)"
            />
          </label>

          <label class="summary-field compact-field">
            <span>Hasta (Fecha y Hora)</span>
            <input
              type="datetime-local"
              [ngModel]="toDateTime()"
              (ngModelChange)="onRangeFieldChange('to', $event)"
              (input)="onRangeFieldChange('to', $any($event.target).value)"
            />
          </label>
        </article>

        <section class="kpi-grid kpi-grid-report">
          <article class="kpi-card report-card">
            <div class="kpi-head">
              <small>Ventas cobradas en rango</small>
              <button type="button" class="card-more" aria-label="Mas opciones">...</button>
            </div>
            <strong>{{ totalSales() | currency:'USD' }}</strong>
            <div class="kpi-foot">
              <span>{{ filteredOrders().length }} comandas cobradas</span>
              <span class="metric-pill">{{ reportHeaderLabel() }}</span>
            </div>
          </article>

          <article class="kpi-card report-card">
            <div class="kpi-head">
              <small>Ticket promedio</small>
              <button type="button" class="card-more" aria-label="Mas opciones">...</button>
            </div>
            <strong>{{ averageTicket() | currency:'USD' }}</strong>
            <div class="kpi-foot">
              <span>Total / comandas cobradas</span>
              <span class="metric-pill">{{ periodLabel() }}</span>
            </div>
          </article>

          <article class="kpi-card report-card">
            <div class="kpi-head">
              <small>Productos Vendidos</small>
              <button type="button" class="card-more" aria-label="Mas opciones" (click)="restaurant === 'PAPA_Y_SON' ? openProductListModal() : null" [style.visibility]="restaurant === 'PAPA_Y_SON' ? 'visible' : 'hidden'">...</button>
            </div>
            <strong>{{ totalItems() }}</strong>
            <div class="kpi-foot">
              <span>Items en el periodo filtrado</span>
              <span class="metric-pill alert">{{ selectedPaymentMethods.length }} pagos</span>
            </div>
          </article>
        </section>

        <section class="report-visual-grid">
          <article class="report-panel visual-panel">
            <div class="panel-heading">
              <h2>{{ restaurant === 'PAPA_Y_SON' ? 'Ventas por categorías' : 'Ventas por local' }}</h2>
              <span class="panel-select">{{ periodLabel() }}</span>
            </div>

            <div class="chart chart-bars report-bars">
              @if (restaurant === 'PAPA_Y_SON') {
                @for (item of categorySales(); track item.categoryId) {
                  <div class="bar-card">
                    <div class="bar-meta">
                      <strong>{{ item.label }} <small>({{ item.quantity }} uds)</small></strong>
                      <span>{{ item.sales | currency:'USD' }}</span>
                    </div>
                    <div class="bar-track">
                      <div class="bar-fill" [style.width.%]="item.sales > 0 ? (item.sales / categorySales()[0].sales) * 100 : 0"></div>
                    </div>
                  </div>
                }
              } @else {
                @for (item of localSales(); track item.restaurantId) {
                  <div class="bar-card">
                    <div class="bar-meta">
                      <strong>{{ item.label }}</strong>
                      <span>{{ item.sales | currency:'USD' }}</span>
                    </div>
                    <div class="bar-track">
                      <div class="bar-fill" [style.width.%]="barPercent(item.sales)"></div>
                    </div>
                  </div>
                }
              }
            </div>
          </article>

          <article class="report-panel visual-panel">
            <div class="panel-heading">
              <h2>Artículos y Productos consumidos</h2>
              <button type="button" class="panel-select" (click)="openProductChartModal()">Ver detalle</button>
            </div>

            <div class="chart chart-pie report-pie-card">
              @if (productSales().length || inventoryArticleSales().length) {
                <svg viewBox="0 0 100 100" class="pie-svg" aria-label="Grafica de torta por producto">
                  @for (slice of pieSlices(); track slice.name) {
                    <circle
                      cx="50"
                      cy="50"
                      r="30"
                      [attr.stroke]="slice.color"
                      stroke-width="20"
                      fill="none"
                      [attr.stroke-dasharray]="slice.dasharray"
                      [attr.stroke-dashoffset]="slice.dashoffset"
                      transform="rotate(-90 50 50)"
                    ></circle>
                  }
                </svg>

                <ul class="legend-list compact-legend">
                  @for (item of productSales().slice(0, 5); track item.productId) {
                    <li>
                      <span>
                        <span class="legend-dot" [style.background]="productColor(item.name)"></span>
                        {{ item.name }} ({{ item.quantity }} un)
                      </span>
                      <strong>{{ item.sales | currency:'USD' }}</strong>
                    </li>
                  }
                  @if (inventoryArticleSales().length) {
                    @for (item of inventoryArticleSales().slice(0, 3); track item.articleId) {
                      <li style="border-top: 1px dashed #e2e8f0; margin-top: 4px; padding-top: 4px;">
                        <span>
                          <i class="bi bi-box-seam" style="color: #64748b; font-size: 0.75rem;"></i>
                          {{ item.name }}
                        </span>
                        <strong style="color: #475569;">{{ item.quantity | number:'1.0-3' }} {{ item.unit | uppercase }}</strong>
                      </li>
                    }
                  }
                </ul>
              } @else {
                <p class="empty-state">No hay ventas por productos en el periodo seleccionado.</p>
              }
            </div>
          </article>
        </section>

        <article class="report-panel wide-panel">
          <div class="panel-heading" style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.75rem;">
            <h2 style="font-size: 1.15rem; font-weight: 900; color: #1e293b; margin: 0; display: flex; align-items: center; gap: 0.5rem;">
              <i class="bi bi-table" style="color: #2563eb;" aria-hidden="true"></i>
              Comandas por período
            </h2>
            <span style="font-weight: 800; background: #e0f2fe; color: #0369a1; padding: 0.25rem 0.65rem; border-radius: 0.75rem; font-size: 0.8rem;">
              {{ sortedReportOrders().length }} comandas cobradas
            </span>
          </div>

          @if (isDataLoading() && !sortedReportOrders().length) {
            <article class="state-card">
              <span class="state-spinner" aria-hidden="true"></span>
              <strong>Cargando comandas...</strong>
            </article>
          } @else if (dataError() && !sortedReportOrders().length) {
            <article class="state-card">
              <strong>{{ dataError() }}</strong>
              <div class="state-actions-row">
                <button type="button" class="btn-ghost state-retry-btn" (click)="retryLoad()">
                  <i class="bi bi-arrow-clockwise" aria-hidden="true"></i>
                  Reintentar
                </button>
                <button type="button" class="btn-ghost state-cancel-btn" (click)="cancelLoad()">
                  <i class="bi bi-x-circle" aria-hidden="true"></i>
                  Cancelar
                </button>
              </div>
            </article>
          } @else if (sortedReportOrders().length) {
            <div style="overflow-x: auto;">
              <table style="width: 100%; border-collapse: collapse; font-size: 0.88rem; text-align: left; background: #ffffff; border-radius: 0.75rem; border: 1px solid #e2e8f0; box-shadow: 0 2px 8px rgba(0,0,0,0.03);">
                <thead>
                  <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0; color: #475569; font-weight: 800;">
                    <th style="padding: 0.75rem 0.85rem; cursor: pointer; user-select: none;" (click)="toggleSort('id')" title="Ordenar por # Comanda">
                      <div style="display: flex; align-items: center; gap: 0.35rem;">
                        <span># Comanda</span>
                        <i class="bi" [class.bi-arrow-down-up]="sortColumn() !== 'id'" [class.bi-sort-alpha-down]="sortColumn() === 'id' && sortDirection() === 'asc'" [class.bi-sort-alpha-down-alt]="sortColumn() === 'id' && sortDirection() === 'desc'" style="color: #2563eb;"></i>
                      </div>
                    </th>
                    <th style="padding: 0.75rem 0.85rem; cursor: pointer; user-select: none;" (click)="toggleSort('paidAt')" title="Ordenar por Fecha / Hora">
                      <div style="display: flex; align-items: center; gap: 0.35rem;">
                        <span>Fecha / Hora</span>
                        <i class="bi" [class.bi-arrow-down-up]="sortColumn() !== 'paidAt'" [class.bi-sort-numeric-down]="sortColumn() === 'paidAt' && sortDirection() === 'asc'" [class.bi-sort-numeric-down-alt]="sortColumn() === 'paidAt' && sortDirection() === 'desc'" style="color: #2563eb;"></i>
                      </div>
                    </th>
                    <th style="padding: 0.75rem 0.85rem; cursor: pointer; user-select: none;" (click)="toggleSort('clientName')" title="Ordenar por Cliente / Mesa">
                      <div style="display: flex; align-items: center; gap: 0.35rem;">
                        <span>Cliente / Mesa</span>
                        <i class="bi" [class.bi-arrow-down-up]="sortColumn() !== 'clientName'" [class.bi-sort-alpha-down]="sortColumn() === 'clientName' && sortDirection() === 'asc'" [class.bi-sort-alpha-down-alt]="sortColumn() === 'clientName' && sortDirection() === 'desc'" style="color: #2563eb;"></i>
                      </div>
                    </th>
                    <th style="padding: 0.75rem 0.85rem; cursor: pointer; user-select: none;" (click)="toggleSort('paymentMethod')" title="Ordenar por Método de Pago">
                      <div style="display: flex; align-items: center; gap: 0.35rem;">
                        <span>Método de Pago</span>
                        <i class="bi" [class.bi-arrow-down-up]="sortColumn() !== 'paymentMethod'" [class.bi-sort-alpha-down]="sortColumn() === 'paymentMethod' && sortDirection() === 'asc'" [class.bi-sort-alpha-down-alt]="sortColumn() === 'paymentMethod' && sortDirection() === 'desc'" style="color: #2563eb;"></i>
                      </div>
                    </th>
                    <th style="padding: 0.75rem 0.85rem;">Referencia</th>
                    <th style="padding: 0.75rem 0.85rem; text-align: right; cursor: pointer; user-select: none;" (click)="toggleSort('total')" title="Ordenar por Total USD">
                      <div style="display: flex; align-items: center; justify-content: flex-end; gap: 0.35rem;">
                        <span>Total USD</span>
                        <i class="bi" [class.bi-arrow-down-up]="sortColumn() !== 'total'" [class.bi-sort-numeric-down]="sortColumn() === 'total' && sortDirection() === 'asc'" [class.bi-sort-numeric-down-alt]="sortColumn() === 'total' && sortDirection() === 'desc'" style="color: #2563eb;"></i>
                      </div>
                    </th>
                    <th style="padding: 0.75rem 0.85rem; text-align: right;">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  @for (order of paginatedReportOrders(); track order.id) {
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                      <td style="padding: 0.65rem 0.85rem; font-weight: 800; color: #1e293b;">#{{ order.id }}</td>
                      <td style="padding: 0.65rem 0.85rem; color: #64748b; font-size: 0.82rem;">{{ order.paidAt | date:'short' }}</td>
                      <td style="padding: 0.65rem 0.85rem; font-weight: 700; color: #334155;">{{ order.clientName || 'Sin cliente' }}</td>
                      <td style="padding: 0.65rem 0.85rem;">
                        <span style="font-size: 0.75rem; font-weight: 800; background: #e0f2fe; color: #0369a1; padding: 0.2rem 0.5rem; border-radius: 0.4rem;">
                          {{ order.paymentMethod }}
                        </span>
                      </td>
                      <td style="padding: 0.65rem 0.85rem; color: #64748b; font-size: 0.82rem;">{{ order.paymentReference || 'Sin ref' }}</td>
                      <td style="padding: 0.65rem 0.85rem; text-align: right; font-weight: 900; color: #059669;">
                        \${{ order.total | number:'1.2-2' }}
                      </td>
                      <td style="padding: 0.65rem 0.85rem; text-align: right;">
                        <button
                          type="button"
                          style="font-size: 0.75rem; font-weight: 800; padding: 0.35rem 0.7rem; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: #ffffff; border: none; border-radius: 0.5rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.35rem; box-shadow: 0 2px 6px rgba(37, 99, 235, 0.3);"
                          title="Imprimir ticket / factura individual"
                          (click)="printSingleOrderTicket(order.id)"
                        >
                          <i class="bi bi-printer-fill" aria-hidden="true"></i> Reimprimir Factura
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>

              <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid #e2e8f0; font-size: 0.85rem; flex-wrap: wrap; gap: 0.75rem;">
                <span style="color: #64748b; font-weight: 600;">
                  Mostrando comandas {{ (currentPage() - 1) * pageSize() + 1 }} a {{ (currentPage() * pageSize() > sortedReportOrders().length ? sortedReportOrders().length : currentPage() * pageSize()) }} de {{ sortedReportOrders().length }}
                </span>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                  <button
                    type="button"
                    [disabled]="currentPage() <= 1"
                    (click)="goToPage(currentPage() - 1)"
                    style="padding: 0.35rem 0.75rem; font-weight: 800; border-radius: 0.5rem; border: 1px solid #cbd5e1; background: #ffffff; color: #334155; cursor: pointer;"
                  >
                    <i class="bi bi-chevron-left"></i> Anterior
                  </button>
                  <span style="font-weight: 800; color: #1e293b; padding: 0 0.5rem;">
                    Página {{ currentPage() }} de {{ totalPages() }}
                  </span>
                  <button
                    type="button"
                    [disabled]="currentPage() >= totalPages()"
                    (click)="goToPage(currentPage() + 1)"
                    style="padding: 0.35rem 0.75rem; font-weight: 800; border-radius: 0.5rem; border: 1px solid #cbd5e1; background: #ffffff; color: #334155; cursor: pointer;"
                  >
                    Siguiente <i class="bi bi-chevron-right"></i>
                  </button>
                </div>
              </div>
            </div>
          } @else {
            <p class="empty-state">No hay comandas cobradas en el periodo seleccionado.</p>
          }
        </article>

        <!-- PANEL DE AUDITORIA GENERAL DE COMANDAS -->
        <article class="panel audit-section-panel">
          <div class="audit-header">
            <div class="audit-header-titles">
              <span class="audit-header-icon"><i class="bi bi-shield-check" aria-hidden="true"></i></span>
              <div>
                <h2 class="audit-title">Panel de Auditoría de Comandas</h2>
                <p class="audit-subtitle">Auditoría global de todas las órdenes, estados de preparación, canales y trazabilidad de cobro</p>
              </div>
            </div>

            <!-- Métricas KPI Rápidas -->
            <div class="audit-kpis">
              <div class="audit-kpi-chip">
                <span class="kpi-label">Total</span>
                <strong class="kpi-val">{{ auditCounts().total }}</strong>
              </div>
              <div class="audit-kpi-chip chip-cobrado">
                <span class="kpi-label">Cobradas</span>
                <strong class="kpi-val">{{ auditCounts().cobradas }}</strong>
              </div>
              <div class="audit-kpi-chip chip-proceso">
                <span class="kpi-label">En Proceso</span>
                <strong class="kpi-val">{{ auditCounts().enProceso }}</strong>
              </div>
              <div class="audit-kpi-chip chip-pendiente">
                <span class="kpi-label">Pendientes</span>
                <strong class="kpi-val">{{ auditCounts().pendientes }}</strong>
              </div>
              <div class="audit-kpi-chip chip-anulado">
                <span class="kpi-label">Anuladas</span>
                <strong class="kpi-val">{{ auditCounts().anuladas }}</strong>
              </div>
              <div class="audit-kpi-chip chip-total">
                <span class="kpi-label">Total Auditado</span>
                <strong class="kpi-val">\${{ auditCounts().totalMonto | number:'1.2-2' }}</strong>
              </div>
            </div>
          </div>

          <!-- Barra de Búsqueda y Filtros de Clasificación -->
          <div class="audit-controls-bar">
            <div class="audit-search-box">
              <i class="bi bi-search search-icon" aria-hidden="true"></i>
              <input
                type="text"
                [ngModel]="auditSearchQuery()"
                (ngModelChange)="onAuditSearchChange($event)"
                placeholder="Buscar por # comanda, cliente, mesa, producto, mesonero, referencia..."
                class="audit-search-input"
              />
              @if (auditSearchQuery()) {
                <button type="button" class="search-clear-btn" (click)="onAuditSearchChange('')" title="Limpiar búsqueda">
                  <i class="bi bi-x-circle-fill" aria-hidden="true"></i>
                </button>
              }
            </div>

            <div class="audit-filter-dropdowns">
              <!-- Clasificador por Local -->
              <label class="audit-select-label">
                <span>Local</span>
                <select [ngModel]="auditRestaurantFilter()" (ngModelChange)="setAuditRestaurantFilter($event)">
                  @if (canSelectAllRestaurants()) {
                    <option value="ALL">Todos los locales</option>
                  }
                  @for (local of localKeys(); track local) {
                    <option [value]="local">{{ localLabel(local) }}</option>
                  }
                </select>
              </label>

              <!-- Clasificador por Origen / Canal -->
              <label class="audit-select-label">
                <span>Origen</span>
                <select [ngModel]="auditSourceFilter()" (ngModelChange)="setAuditSourceFilter($event)">
                  <option value="ALL">Todos los orígenes</option>
                  <option value="MESONERO">Mesonero</option>
                  <option value="QR">Código QR</option>
                </select>
              </label>

              <!-- Clasificador por Método de Pago -->
              <label class="audit-select-label">
                <span>Método Pago</span>
                <select [ngModel]="auditPaymentFilter()" (ngModelChange)="setAuditPaymentFilter($event)">
                  <option value="ALL">Todos los métodos</option>
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="PAGO_MOVIL">Pago Móvil</option>
                  <option value="TRANSFERENCIA">Transferencia</option>
                  <option value="TARJETA">Tarjeta / Punto</option>
                  <option value="OTRO">Otro</option>
                  <option value="SIN_REGISTRO">Sin Registro</option>
                </select>
              </label>
            </div>
          </div>

          <!-- Clasificación por Estado (Chips interactivos) -->
          <div class="audit-status-chips">
            <span class="chips-title"><i class="bi bi-funnel-fill" aria-hidden="true"></i> Clasificar por Estado:</span>
            <button
              type="button"
              class="status-chip"
              [class.active]="auditStatusFilter() === 'ALL'"
              (click)="setAuditStatus('ALL')"
            >
              Todas ({{ auditCounts().total }})
            </button>
            <button
              type="button"
              class="status-chip chip-cobrado"
              [class.active]="auditStatusFilter() === 'COBRADO'"
              (click)="setAuditStatus('COBRADO')"
            >
              <i class="bi bi-check-circle-fill" aria-hidden="true"></i> Cobradas ({{ auditCounts().cobradas }})
            </button>
            <button
              type="button"
              class="status-chip chip-entregado"
              [class.active]="auditStatusFilter() === 'ENTREGADO'"
              (click)="setAuditStatus('ENTREGADO')"
            >
              <i class="bi bi-bag-check-fill" aria-hidden="true"></i> Entregadas ({{ auditCounts().entregadas }})
            </button>
            <button
              type="button"
              class="status-chip chip-proceso"
              [class.active]="auditStatusFilter() === 'EN_PROCESO'"
              (click)="setAuditStatus('EN_PROCESO')"
            >
              <i class="bi bi-clock-history" aria-hidden="true"></i> En Preparación ({{ auditCounts().enProceso }})
            </button>
            <button
              type="button"
              class="status-chip chip-pendiente"
              [class.active]="auditStatusFilter() === 'PENDIENTE'"
              (click)="setAuditStatus('PENDIENTE')"
            >
              <i class="bi bi-hourglass-split" aria-hidden="true"></i> Pendientes ({{ auditCounts().pendientes }})
            </button>
            <button
              type="button"
              class="status-chip chip-anulado"
              [class.active]="auditStatusFilter() === 'ANULADO'"
              (click)="setAuditStatus('ANULADO')"
            >
              <i class="bi bi-x-octagon-fill" aria-hidden="true"></i> Anuladas ({{ auditCounts().anuladas }})
            </button>
          </div>

          <!-- Tabla de Auditoría Ordenable -->
          @if (isDataLoading() && !allAuditOrders().length) {
            <div class="state-card" style="margin: 1.5rem 0;">
              <span class="state-spinner" aria-hidden="true"></span>
              <strong>Cargando registro de auditoría...</strong>
            </div>
          } @else if (sortedAuditOrders().length) {
            <div class="audit-table-wrapper">
              <table class="audit-table">
                <thead>
                  <tr>
                    <th (click)="toggleAuditSort('id')" class="sortable-th" title="Ordenar por # Comanda">
                      <div class="th-content">
                        <span># Comanda</span>
                        <i [class]="auditSortColumn() === 'id' ? (auditSortDirection() === 'asc' ? 'bi bi-sort-up' : 'bi bi-sort-down') : 'bi bi-arrow-down-up'" aria-hidden="true"></i>
                      </div>
                    </th>
                    <th (click)="toggleAuditSort('createdAt')" class="sortable-th" title="Ordenar por Fecha y Hora">
                      <div class="th-content">
                        <span>Fecha y Hora</span>
                        <i [class]="auditSortColumn() === 'createdAt' ? (auditSortDirection() === 'asc' ? 'bi bi-sort-up' : 'bi bi-sort-down') : 'bi bi-arrow-down-up'" aria-hidden="true"></i>
                      </div>
                    </th>
                    <th (click)="toggleAuditSort('table')" class="sortable-th" title="Ordenar por Mesa">
                      <div class="th-content">
                        <span>Mesa</span>
                        <i [class]="auditSortColumn() === 'table' ? (auditSortDirection() === 'asc' ? 'bi bi-sort-up' : 'bi bi-sort-down') : 'bi bi-arrow-down-up'" aria-hidden="true"></i>
                      </div>
                    </th>
                    <th (click)="toggleAuditSort('client')" class="sortable-th" title="Ordenar por Cliente">
                      <div class="th-content">
                        <span>Cliente</span>
                        <i [class]="auditSortColumn() === 'client' ? (auditSortDirection() === 'asc' ? 'bi bi-sort-up' : 'bi bi-sort-down') : 'bi bi-arrow-down-up'" aria-hidden="true"></i>
                      </div>
                    </th>
                    <th>Local(es)</th>
                    <th>Origen / Creado por</th>
                    <th (click)="toggleAuditSort('status')" class="sortable-th" title="Ordenar por Estado">
                      <div class="th-content">
                        <span>Estado</span>
                        <i [class]="auditSortColumn() === 'status' ? (auditSortDirection() === 'asc' ? 'bi bi-sort-up' : 'bi bi-sort-down') : 'bi bi-arrow-down-up'" aria-hidden="true"></i>
                      </div>
                    </th>
                    <th (click)="toggleAuditSort('total')" class="sortable-th text-right" title="Ordenar por Total">
                      <div class="th-content text-right">
                        <span>Total ($)</span>
                        <i [class]="auditSortColumn() === 'total' ? (auditSortDirection() === 'asc' ? 'bi bi-sort-up' : 'bi bi-sort-down') : 'bi bi-arrow-down-up'" aria-hidden="true"></i>
                      </div>
                    </th>
                    <th class="text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  @for (order of paginatedAuditOrders(); track order.id) {
                    <tr class="audit-row" (click)="openAuditDetailModal(order)">
                      <td>
                        <span class="audit-order-id">{{ order.id }}</span>
                      </td>
                      <td class="audit-date-cell">
                        <strong>{{ order.createdAt | date:'dd/MM/yyyy' }}</strong>
                        <small>{{ order.createdAt | date:'hh:mm a' }}</small>
                      </td>
                      <td>
                        <span class="audit-table-badge">Mesa {{ tableLabel(order) }}</span>
                      </td>
                      <td>
                        <div class="audit-client-cell">
                          <strong>{{ order.clientName || 'Sin nombre' }}</strong>
                          @if (order.clientDocumentId) {
                            <small>CI: {{ order.clientDocumentId }}</small>
                          }
                        </div>
                      </td>
                      <td>
                        <div class="audit-locals-cell">
                          @for (local of orderRestaurants(order); track local) {
                            <span class="audit-local-tag">{{ localLabel(local) }}</span>
                          }
                        </div>
                      </td>
                      <td>
                        <div class="audit-creator-cell">
                          <span class="audit-source-badge" [class.source-qr]="order.source === 'QR'">
                            <i [class]="order.source === 'QR' ? 'bi bi-qr-code' : 'bi bi-person-badge'" aria-hidden="true"></i>
                            {{ order.source === 'QR' ? 'QR' : 'Mesonero' }}
                          </span>
                          <small>{{ getUserDisplayName(order.createdByUserId) }}</small>
                        </div>
                      </td>
                      <td>
                        <span class="audit-status-badge" [style.background]="auditStatusBadgeStyle(order.status).bg" [style.color]="auditStatusBadgeStyle(order.status).color" [style.border-color]="auditStatusBadgeStyle(order.status).border">
                          {{ auditStatusLabel(order.status) }}
                        </span>
                      </td>
                      <td class="text-right audit-total-cell">
                        <strong>\${{ auditOrderTotal(order) | number:'1.2-2' }}</strong>
                        <small>{{ order.items.length }} {{ order.items.length === 1 ? 'item' : 'items' }}</small>
                      </td>
                      <td class="text-right audit-actions-cell" (click)="$event.stopPropagation()">
                        <div class="audit-action-btns">
                          <button
                            type="button"
                            class="btn-audit-detail"
                            (click)="openAuditDetailModal(order)"
                            title="Ver desglose y trazabilidad completa"
                          >
                            <i class="bi bi-eye-fill" aria-hidden="true"></i> Auditar
                          </button>
                          @if (order.status === 'COBRADO') {
                            <button
                              type="button"
                              class="btn-audit-reprint"
                              (click)="printSingleOrderTicket(order.id)"
                              title="Reimprimir ticket de caja"
                            >
                              <i class="bi bi-printer-fill" aria-hidden="true"></i>
                            </button>
                          }
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            <!-- Paginación de Auditoría (10 por página) -->
            <div class="audit-pagination-bar">
              <span class="pagination-info">
                Mostrando comandas <strong>{{ (auditCurrentPage() - 1) * auditPageSize() + 1 }}</strong> a <strong>{{ (auditCurrentPage() * auditPageSize() > sortedAuditOrders().length ? sortedAuditOrders().length : auditCurrentPage() * auditPageSize()) }}</strong> de <strong>{{ sortedAuditOrders().length }}</strong> encontradas
              </span>
              <div class="pagination-controls">
                <button
                  type="button"
                  class="pagination-btn"
                  [disabled]="auditCurrentPage() <= 1"
                  (click)="goToAuditPage(auditCurrentPage() - 1)"
                >
                  <i class="bi bi-chevron-left" aria-hidden="true"></i> Anterior
                </button>
                <span class="pagination-page-indicator">
                  Página <strong>{{ auditCurrentPage() }}</strong> de <strong>{{ auditTotalPages() }}</strong>
                </span>
                <button
                  type="button"
                  class="pagination-btn"
                  [disabled]="auditCurrentPage() >= auditTotalPages()"
                  (click)="goToAuditPage(auditCurrentPage() + 1)"
                >
                  Siguiente <i class="bi bi-chevron-right" aria-hidden="true"></i>
                </button>
              </div>
            </div>
          } @else {
            <div class="audit-empty-state">
              <i class="bi bi-inbox empty-icon" aria-hidden="true"></i>
              <h3>No se encontraron comandas</h3>
              <p>No hay resultados que coincidan con la búsqueda o los filtros seleccionados.</p>
              <button
                type="button"
                class="btn-ghost"
                (click)="resetAuditFilters()"
                style="margin-top: 0.5rem; border: 1px solid #cbd5e1; font-weight: 700;"
              >
                <i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i> Restablecer filtros de auditoría
              </button>
            </div>
          }
        </article>
      </div>

      @if (isReportOptionsModalOpen()) {
        <div class="overlay" (click)="closeReportOptionsModal()">
          <article class="modal detail-modal" (click)="$event.stopPropagation()">
            <div class="modal-head">
              <h2>Generar reportes</h2>
              <button type="button" class="btn-ghost" (click)="closeReportOptionsModal()">Cerrar</button>
            </div>

            <article class="panel filters-grid report-filters">
              <label>
                Local
                <select [(ngModel)]="restaurant">
                  @if (canSelectAllRestaurants()) {
                    <option value="ALL">Todos</option>
                  }
                  @for (local of localKeys(); track local) {
                    <option [value]="local">{{ localLabel(local) }}</option>
                  }
                </select>
              </label>

              <label>
                Preset
                <select [(ngModel)]="periodPreset" (ngModelChange)="applyPreset($event)">
                  <option value="DIARIO">Ultimas 24 horas</option>
                  <option value="SEMANAL">Ultimos 7 dias</option>
                  <option value="MENSUAL">Ultimos 30 dias</option>
                  <option value="RANGO">Rango manual</option>
                </select>
              </label>

              <div class="preset-chips">
                <button type="button" class="btn-ghost" [class.active-chip]="periodPreset === 'DIARIO'" (click)="applyPreset('DIARIO')">Diario</button>
                <button type="button" class="btn-ghost" [class.active-chip]="periodPreset === 'SEMANAL'" (click)="applyPreset('SEMANAL')">Semanal</button>
                <button type="button" class="btn-ghost" [class.active-chip]="periodPreset === 'MENSUAL'" (click)="applyPreset('MENSUAL')">Mensual</button>
                <button type="button" class="btn-ghost" [class.active-chip]="periodPreset === 'RANGO'" (click)="applyPreset('RANGO')">Manual</button>
              </div>

              <label>
                Desde (Fecha y Hora)
                <input
                  type="datetime-local"
                  [ngModel]="fromDateTime()"
                  (ngModelChange)="onRangeFieldChange('from', $event)"
                  (input)="onRangeFieldChange('from', $any($event.target).value)"
                />
              </label>

              <label>
                Hasta (Fecha y Hora)
                <input
                  type="datetime-local"
                  [ngModel]="toDateTime()"
                  (ngModelChange)="onRangeFieldChange('to', $event)"
                  (input)="onRangeFieldChange('to', $any($event.target).value)"
                />
              </label>

              <label class="summary-field-multi">
                Metodos de pago
                <select [(ngModel)]="selectedPaymentMethods" multiple>
                  @for (method of paymentMethodFilters; track method.value) {
                    <option [ngValue]="method.value">{{ method.label }}</option>
                  }
                </select>
                <div class="payment-method-actions">
                  <button type="button" class="btn-ghost" (click)="selectAllPaymentMethods()">Seleccionar todo</button>
                  <button type="button" class="btn-ghost" (click)="clearPaymentMethods()">Limpiar</button>
                </div>
              </label>

              <div class="print-cell">
                <button type="button" class="print-btn" (click)="printReport()">Imprimir PDF</button>
              </div>
            </article>
          </article>
        </div>
      }

      @if (isProductListModalOpen()) {
        <div class="overlay" (click)="closeProductListModal()">
          <article class="modal detail-modal" (click)="$event.stopPropagation()">
            <div class="modal-head">
              <h2>Lista de productos vendidos</h2>
              <button type="button" class="btn-ghost" (click)="closeProductListModal()">Cerrar</button>
            </div>

            <p class="detail-summary">
              Rango aplicado: {{ getNormalizedRange().from | date:'short' }} a {{ getNormalizedRange().to | date:'short' }}
            </p>

            <div class="table-container" style="max-height: 400px; overflow-y: auto;">
              <table style="width: 100%; border-collapse: collapse; margin-top: 1rem;">
                <thead>
                  <tr style="border-bottom: 1px solid #ccc; text-align: left;">
                    <th style="padding: 0.5rem;">Producto</th>
                    <th style="padding: 0.5rem; text-align: center;">Cantidad</th>
                    <th style="padding: 0.5rem; text-align: right;">Precio Uni.</th>
                    <th style="padding: 0.5rem; text-align: right;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  @for (item of productSales(); track item.productId) {
                    <tr style="border-bottom: 1px solid #eee;">
                      <td style="padding: 0.5rem;">{{ item.name }}</td>
                      <td style="padding: 0.5rem; text-align: center;">{{ item.quantity }}</td>
                      <td style="padding: 0.5rem; text-align: right;">{{ (item.sales / item.quantity) | currency:'USD' }}</td>
                      <td style="padding: 0.5rem; text-align: right;">
                        <strong>{{ item.sales | currency:'USD' }}</strong>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </article>
        </div>
      }

      @if (isProductChartModalOpen()) {
        <div class="overlay" (click)="closeProductChartModal()">
          <article class="modal detail-modal" (click)="$event.stopPropagation()">
            <div class="modal-head">
              <h2>{{ restaurant === 'PAPA_Y_SON' ? 'Artículos consumidos' : 'Ventas por productos' }}</h2>
              <button type="button" class="btn-ghost" (click)="closeProductChartModal()">Cerrar</button>
            </div>

            <p class="detail-summary">
              Rango aplicado: {{ getNormalizedRange().from | date:'short' }} a {{ getNormalizedRange().to | date:'short' }}
              · {{ periodLabel() }}
            </p>

            <article class="panel filters-grid report-filters inline-filters">
              <label>
                Preset
                <select [(ngModel)]="periodPreset" (ngModelChange)="applyPreset($event)">
                  <option value="DIARIO">Ultimas 24 horas</option>
                  <option value="SEMANAL">Ultimos 7 dias</option>
                  <option value="MENSUAL">Ultimos 30 dias</option>
                  <option value="RANGO">Rango manual</option>
                </select>
              </label>

              <label>
                Desde (Fecha y Hora)
                <input
                  type="datetime-local"
                  [ngModel]="fromDateTime()"
                  (ngModelChange)="onRangeFieldChange('from', $event)"
                  (input)="onRangeFieldChange('from', $any($event.target).value)"
                />
              </label>

              <label>
                Hasta (Fecha y Hora)
                <input
                  type="datetime-local"
                  [ngModel]="toDateTime()"
                  (ngModelChange)="onRangeFieldChange('to', $event)"
                  (input)="onRangeFieldChange('to', $any($event.target).value)"
                />
              </label>
            </article>

            <div class="chart chart-pie">
              @if ((restaurant === 'PAPA_Y_SON' ? inventoryArticleSales() : productSales()).length) {
                <svg viewBox="0 0 100 100" class="pie-svg" aria-label="Grafica de torta por producto">
                  @for (slice of pieSlices(); track slice.name) {
                    <circle
                      cx="50"
                      cy="50"
                      r="30"
                      [attr.stroke]="slice.color"
                      stroke-width="20"
                      fill="none"
                      [attr.stroke-dasharray]="slice.dasharray"
                      [attr.stroke-dashoffset]="slice.dashoffset"
                      transform="rotate(-90 50 50)"
                    ></circle>
                  }
                </svg>

                <ul class="legend-list">
                  @if (restaurant === 'PAPA_Y_SON') {
                    @for (item of inventoryArticleSales(); track item.articleId) {
                      <li>
                        <span class="legend-dot" [style.background]="productColor(item.name)"></span>
                        <span>{{ item.name }}</span>
                        <strong>{{ item.quantity | number:'1.0-3' }} {{ item.unit | uppercase }}</strong>
                      </li>
                    }
                  } @else {
                    @for (item of productSales(); track item.productId) {
                      <li>
                        <span class="legend-dot" [style.background]="productColor(item.name)"></span>
                        <span>{{ item.name }}</span>
                        <strong>{{ item.sales | currency:'USD' }}</strong>
                      </li>
                    }
                  }
                </ul>
              } @else {
                <p class="empty-state">No hay ventas por productos en el periodo seleccionado.</p>
              }
            </div>
          </article>
        </div>
      }

      <!-- MODAL DE DETALLE DE AUDITORIA DE COMANDA -->
      @if (isAuditDetailModalOpen() && selectedAuditOrder(); as order) {
        <div class="overlay" (click)="closeAuditDetailModal()">
          <article class="modal audit-detail-modal" (click)="$event.stopPropagation()">
            <div class="modal-head">
              <div style="display: flex; align-items: center; gap: 0.75rem;">
                <span class="modal-head-tag">AUDITORÍA</span>
                <div>
                  <h2 style="margin: 0; font-size: 1.35rem; color: #0f172a;">Comanda {{ order.id }}</h2>
                  <small style="color: #64748b; font-weight: 600;">Mesa {{ tableLabel(order) }} · Creada el {{ order.createdAt | date:'dd/MM/yyyy hh:mm:ss a' }}</small>
                </div>
              </div>
              <button type="button" class="btn-ghost" (click)="closeAuditDetailModal()" aria-label="Cerrar modal">
                <i class="bi bi-x-lg" aria-hidden="true"></i>
              </button>
            </div>

            <div class="audit-detail-body">
              <!-- Estado y Trazabilidad -->
              <div class="audit-status-summary-card" [style.background]="auditStatusBadgeStyle(order.status).bg" [style.border-color]="auditStatusBadgeStyle(order.status).border">
                <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem;">
                  <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <span class="audit-status-badge" [style.background]="auditStatusBadgeStyle(order.status).bg" [style.color]="auditStatusBadgeStyle(order.status).color" [style.border-color]="auditStatusBadgeStyle(order.status).border" style="font-size: 0.85rem; padding: 0.35rem 0.8rem;">
                      {{ auditStatusLabel(order.status) }}
                    </span>
                    <strong style="color: #1e293b; font-size: 0.95rem;">Ciclo y Trazabilidad</strong>
                  </div>
                  <span style="font-weight: 800; font-size: 1.15rem; color: #059669;">
                    Total: \${{ auditOrderTotal(order) | number:'1.2-2' }}
                  </span>
                </div>

                <div class="audit-trace-grid">
                  <div class="trace-item">
                    <span class="trace-label">Cliente:</span>
                    <strong class="trace-val">{{ order.clientName || 'Sin registrar' }}</strong>
                  </div>
                  <div class="trace-item">
                    <span class="trace-label">Cédula / Documento:</span>
                    <strong class="trace-val">{{ order.clientDocumentId || 'N/A' }}</strong>
                  </div>
                  <div class="trace-item">
                    <span class="trace-label">Canal de Ingreso:</span>
                    <strong class="trace-val">{{ order.source === 'QR' ? 'Autoservicio QR' : 'Mesonero' }}</strong>
                  </div>
                  <div class="trace-item">
                    <span class="trace-label">Registrada por:</span>
                    <strong class="trace-val">{{ getUserDisplayName(order.createdByUserId) }}</strong>
                  </div>
                  <div class="trace-item">
                    <span class="trace-label">Hora de Apertura:</span>
                    <strong class="trace-val">{{ order.createdAt | date:'short' }}</strong>
                  </div>
                  @if (order.closedAt) {
                    <div class="trace-item">
                      <span class="trace-label">Hora de Cobro / Cierre:</span>
                      <strong class="trace-val">{{ order.closedAt | date:'short' }}</strong>
                    </div>
                  }
                  @if (order.cancelledAt) {
                    <div class="trace-item" style="grid-column: span 2;">
                      <span class="trace-label" style="color: #b91c1c;">Hora de Anulación:</span>
                      <strong class="trace-val" style="color: #b91c1c;">{{ order.cancelledAt | date:'short' }} (Por: {{ getUserDisplayName(order.cancelledByUserId) }})</strong>
                    </div>
                  }
                </div>
              </div>

              <!-- Información de Pago (si aplica) -->
              @if (order.paymentMethod || order.closedAt) {
                <div class="audit-payment-box">
                  <h4 style="margin: 0 0 0.5rem; font-size: 0.9rem; color: #334155; font-weight: 800;">
                    <i class="bi bi-credit-card-2-front-fill" style="color: #2563eb;" aria-hidden="true"></i> Registro de Pago y Facturación
                  </h4>
                  <div class="audit-trace-grid">
                    <div class="trace-item">
                      <span class="trace-label">Método:</span>
                      <strong class="trace-val">{{ order.paymentMethod || 'No especificado' }}</strong>
                    </div>
                    <div class="trace-item">
                      <span class="trace-label">Referencia:</span>
                      <strong class="trace-val">{{ order.paymentReference || 'Sin referencia' }}</strong>
                    </div>
                    <div class="trace-item">
                      <span class="trace-label">Monto USD:</span>
                      <strong class="trace-val">\${{ (order.paymentAmountUsd || auditOrderTotal(order)) | number:'1.2-2' }}</strong>
                    </div>
                    <div class="trace-item">
                      <span class="trace-label">Monto Bs:</span>
                      <strong class="trace-val">{{ (order.paymentAmountBs || (auditOrderTotal(order) * appBcvRate())) | number:'1.2-2' }} Bs.</strong>
                    </div>
                    @if (order.paymentVerificationStatus) {
                      <div class="trace-item">
                        <span class="trace-label">Verificación de Pago:</span>
                        <strong class="trace-val">{{ order.paymentVerificationStatus }}</strong>
                      </div>
                    }
                  </div>
                </div>
              }

              <!-- Tabla de Items y Trazabilidad de Preparación -->
              <h4 style="margin: 1.25rem 0 0.5rem; font-size: 0.95rem; color: #1e293b; font-weight: 800;">
                <i class="bi bi-receipt" aria-hidden="true"></i> Desglose de Productos Auditados ({{ order.items.length }})
              </h4>
              <div class="table-container" style="max-height: 280px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 0.75rem;">
                <table class="audit-subtable">
                  <thead>
                    <tr>
                      <th>Cant.</th>
                      <th>Producto</th>
                      <th>Área / Cocina</th>
                      <th>Local</th>
                      <th>Estado del Item</th>
                      <th class="text-right">Precio</th>
                      <th class="text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (item of order.items; track item.id) {
                      <tr>
                        <td style="font-weight: 900; color: #0f172a;">{{ item.quantity }}x</td>
                        <td>
                          <strong>{{ item.productName }}</strong>
                          @if (item.note) {
                            <small class="item-audit-note"><i class="bi bi-chat-left-text" aria-hidden="true"></i> {{ item.note }}</small>
                          }
                        </td>
                        <td>
                          <span class="area-badge">{{ item.area }}</span>
                        </td>
                        <td>
                          <span class="audit-local-tag">{{ localLabel(item.restaurantId) }}</span>
                        </td>
                        <td>
                          <span class="item-status-pill" [class]="'item-status-' + (item.status || 'PENDIENTE').toLowerCase()">
                            {{ item.status || 'PENDIENTE' }}
                          </span>
                        </td>
                        <td class="text-right">\${{ item.unitPrice | number:'1.2-2' }}</td>
                        <td class="text-right" style="font-weight: 800; color: #059669;">
                          \${{ (item.quantity * item.unitPrice) | number:'1.2-2' }}
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>

            <div class="modal-foot" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid #e2e8f0;">
              <button type="button" class="btn-ghost" (click)="closeAuditDetailModal()">
                Cerrar Auditoría
              </button>
              <div style="display: flex; gap: 0.5rem;">
                <button
                  type="button"
                  class="btn-action"
                  style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: #fff; padding: 0.5rem 1.1rem; border-radius: 0.65rem; font-weight: 800; border: none; display: inline-flex; align-items: center; gap: 0.45rem; cursor: pointer;"
                  (click)="printSingleOrderTicket(order.id)"
                >
                  <i class="bi bi-printer-fill" aria-hidden="true"></i> Reimprimir Factura / Comprobante
                </button>
              </div>
            </div>
          </article>
        </div>
      }
      }
    </section>
  `,
  styles: `
    .page {
      font-family: 'Montserrat', 'Sora', sans-serif;
      color: #171717;
    }

    .reports-surface {
      display: grid;
      gap: 1rem;
      padding: 1rem 1.1rem 1.25rem;
      background: #f7f7f7;
      border: 1px solid #d7d7d7;
      border-radius: 1.6rem;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
    }

    .report-hero {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 1rem;
    }

    .page-header h1 {
      margin: 0;
      color: #111111;
      font-size: clamp(1.9rem, 4vw, 2.8rem);
      line-height: 1;
      font-weight: 900;
      letter-spacing: -0.03em;
    }

    .hero-subtitle {
      margin: 0.3rem 0 0;
      color: #1a1a1a;
      font-size: 1rem;
      font-weight: 700;
    }

    .report-actions-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.65rem;
      justify-content: end;
    }

    .btn-action {
      min-height: 44px;
      min-width: 176px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.65rem;
      border-radius: 0.55rem;
      font-size: 0.88rem;
      font-weight: 800;
      background: linear-gradient(180deg, #cca11f 0%, #b88a10 100%);
      color: #fff;
      border: 1px solid #a47a08;
      box-shadow: inset 0 1px 0 rgba(255, 243, 204, 0.55);
    }

    .btn-action-alt {
      background: linear-gradient(180deg, #cda223 0%, #b4840b 100%);
    }

    .filters-strip {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0.9rem;
    }

    .summary-field {
      display: grid;
      gap: 0.22rem;
      color: #141414;
      font-weight: 700;
    }

    .summary-field span {
      font-size: 0.9rem;
    }

    .summary-field select,
    .summary-field input {
      min-height: 34px;
      border-radius: 0.45rem;
      border: 1px solid #8e8e8e;
      background: #efefef;
      color: #212121;
      font-size: 0.86rem;
      font-weight: 700;
      padding: 0.35rem 0.65rem;
    }

    .compact-field {
      align-content: start;
    }

    .payment-method-actions {
      margin-top: 0.45rem;
      display: flex;
      gap: 0.45rem;
      flex-wrap: wrap;
    }

    .payment-method-actions .btn-ghost {
      min-height: 34px;
      padding: 0.35rem 0.65rem;
      font-size: 0.78rem;
    }

    .inline-filters {
      margin-top: 0.55rem;
    }

    .report-filters {
      background: linear-gradient(135deg, #f9fbff 0%, #f1f5ff 100%);
      border-color: #dfe6ff;
    }

    .preset-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
      align-items: end;
    }

    .active-chip {
      background: linear-gradient(135deg, #143f72 0%, #1e5b96 100%);
      color: #fff;
      border-color: transparent;
    }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 1rem;
    }

    .kpi-card {
      display: grid;
      gap: 0.35rem;
      border: 2px solid #d7d7d7;
      border-radius: 1.15rem;
      background: #ffffff;
      padding: 0.65rem 0.85rem;
      box-shadow: 0 2px 0 rgba(0, 0, 0, 0.03);
    }

    .kpi-head {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 0.5rem;
    }

    .kpi-card small {
      color: #1a1a1a;
      font-weight: 700;
      font-size: 0.85rem;
    }

    .kpi-card strong {
      color: #c79b19;
      font-size: clamp(1.45rem, 3vw, 1.75rem);
      line-height: 1.1;
      font-weight: 900;
    }

    .kpi-foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .kpi-card span {
      color: #303030;
      font-size: 0.78rem;
      font-weight: 700;
    }

    .metric-pill {
      padding: 0.2rem 0.45rem;
      border-radius: 0.55rem;
      font-size: 0.68rem;
      color: #4d6ba6;
      background: #eaf1ff;
    }

    .metric-pill.alert {
      color: #b54848;
      background: #ffe8e8;
    }

    .card-more {
      border: none;
      background: transparent;
      color: #232323;
      font-size: 1.15rem;
      font-weight: 900;
      line-height: 1;
      padding: 0;
    }

    .report-panel {
      border: 4px solid #d7d7d7;
      border-radius: 1.55rem;
      background: #ffffff;
      padding: 1rem 1.1rem 1.1rem;
    }

    .report-panel h2 {
      margin: 0 0 0.8rem;
      color: #111111;
      font-size: clamp(1.45rem, 2.4vw, 1.9rem);
      font-weight: 900;
      letter-spacing: -0.03em;
    }

    .panel-heading {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: start;
      margin-bottom: 0.85rem;
    }

    .panel-select {
      min-height: 34px;
      padding: 0.35rem 0.7rem;
      border-radius: 0.5rem;
      border: 1px solid #c7c7c7;
      background: #efefef;
      font-size: 0.78rem;
      font-weight: 700;
      color: #2c2c2c;
    }

    .select-wrap {
      display: grid;
      gap: 0.25rem;
      padding: 0;
      border: none;
      background: transparent;
      min-height: 0;
    }

    .select-wrap span {
      font-size: 0.76rem;
      text-align: right;
      color: #474747;
    }

    .select-wrap select {
      min-height: 38px;
      min-width: 180px;
      border-radius: 0.55rem;
      border: 1px solid #c7c7c7;
      background: #efefef;
      padding: 0.35rem 0.65rem;
      font: inherit;
    }

    .report-visual-grid {
      display: grid;
      grid-template-columns: 1.15fr 1fr;
      gap: 1rem;
    }

    .wide-panel {
      min-height: 170px;
    }

    .filters-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 0.75rem;
      align-items: end;
    }

    .print-cell {
      display: flex;
      align-items: end;
    }

    .print-btn {
      min-height: 40px;
      width: 100%;
    }

    .analytics-grid {
      align-items: start;
    }

    .chart {
      margin-bottom: 1rem;
    }

    .chart-pie {
      display: grid;
      grid-template-columns: 160px 1fr;
      gap: 1rem;
      align-items: center;
    }

    .pie-svg {
      width: 160px;
      height: 160px;
    }

    .legend-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 0.45rem;
    }

    .legend-list li {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.6rem;
      padding: 0.45rem 0.55rem;
      border-radius: 0.65rem;
      background: #fafafa;
      border: 1px solid #ececec;
    }

    .legend-list li span:first-child {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      min-width: 0;
    }

    .legend-dot {
      width: 0.65rem;
      height: 0.65rem;
      border-radius: 50%;
      display: inline-block;
      margin-right: 0.45rem;
    }

    .chart-bars {
      display: grid;
      gap: 0.8rem;
      margin-bottom: 1rem;
    }

    .bar-card {
      display: grid;
      gap: 0.45rem;
    }

    .bar-meta {
      display: flex;
      justify-content: space-between;
      gap: 0.7rem;
      color: #303030;
      font-size: 0.9rem;
    }

    .bar-track {
      height: 1rem;
      background: #f2f2f2;
      border-radius: 999px;
      overflow: hidden;
      border: 1px solid #d6d6d6;
    }

    .bar-fill {
      height: 100%;
      background: linear-gradient(180deg, #cba120 0%, #826512 100%);
      border-radius: inherit;
      min-width: 2%;
    }

    .report-order-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 0.6rem;
    }

    .report-order-list li {
      display: flex;
      justify-content: space-between;
      gap: 0.8rem;
      padding: 0.9rem 1rem;
      border-radius: 1rem;
      border: 1px solid #ebebeb;
      background: #fafafa;
      align-items: center;
    }

    .report-order-main {
      display: grid;
      gap: 0.2rem;
    }

    .report-order-main strong {
      color: #141414;
      font-size: 0.98rem;
    }

    .report-order-main small {
      color: #5e5e5e;
      font-weight: 700;
      font-size: 0.8rem;
    }

    .report-order-meta {
      display: grid;
      justify-items: end;
      gap: 0.34rem;
      text-align: right;
      color: #4d4d4d;
      font-size: 0.8rem;
    }

    .payment-chip {
      border-radius: 999px;
      padding: 0.18rem 0.5rem;
      font-size: 0.74rem;
      font-weight: 700;
      background: #f4edcf;
      color: #7c6010;
      border: 1px solid #ddc87c;
    }

    .overlay {
      position: fixed;
      inset: 0;
      background: rgba(34, 42, 78, 0.48);
      backdrop-filter: blur(3px);
      display: grid;
      place-items: center;
      padding: 1rem;
      z-index: 200;
    }

    .modal {
      width: min(760px, 100%);
      max-height: 92vh;
      overflow: auto;
      background: #ffffff;
      border: 1px solid #e5eaff;
      border-radius: 1rem;
      padding: 1rem;
      display: grid;
      gap: 0.9rem;
    }

    .modal-head,
    .detail-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.7rem;
    }

    .detail-summary {
      margin: 0;
      color: #6e769a;
    }

    .compact {
      gap: 0.45rem;
    }

    .compact li {
      padding: 0.55rem;
    }

    .empty-state {
      margin: 0;
      color: #5a5a5a;
      padding: 0.9rem 1rem;
      border-radius: 0.75rem;
      background: #f6f6f6;
      border: 1px solid #ebebeb;
    }

    .report-order-table {
      max-height: 320px;
      overflow: auto;
      padding-right: 0.2rem;
    }

    @media (max-width: 820px) {
      .page {
        padding-top: 4.6rem;
      }

      .reports-surface {
        padding: 1rem;
      }

      .report-hero,
      .panel-heading {
        grid-template-columns: 1fr;
        display: grid;
      }

      .report-actions-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        justify-content: stretch;
      }

      .btn-action {
        width: 100%;
        min-width: 0;
        min-height: 56px;
        font-size: 0.92rem;
      }

      .filters-strip,
      .report-visual-grid {
        grid-template-columns: 1fr;
      }

      .kpi-grid {
        grid-template-columns: 1fr 1fr;
      }

      .kpi-grid .kpi-card:last-child {
        grid-column: 1 / -1;
      }

      .kpi-card {
        padding: 0.9rem;
      }

      .report-panel {
        padding: 0.9rem 1rem;
      }

      .select-wrap select {
        min-width: 0;
      }

      .report-order-list li {
        align-items: start;
        flex-direction: column;
      }

      .report-order-meta {
        justify-items: start;
        text-align: left;
      }

      .chart-pie {
        grid-template-columns: 1fr;
        justify-items: center;
      }
    }

    /* --- AUDIT PANEL STYLES --- */
    .audit-section-panel {
      margin-top: 1.5rem;
      background: #ffffff;
      border-radius: 1.25rem;
      border: 1px solid #e2e8f0;
      box-shadow: 0 4px 20px rgba(15, 23, 42, 0.06);
      padding: 1.35rem;
      display: grid;
      gap: 1.15rem;
    }

    .audit-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 1rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid #f1f5f9;
    }

    .audit-header-titles {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .audit-header-icon {
      width: 44px;
      height: 44px;
      border-radius: 0.75rem;
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      color: #38bdf8;
      display: grid;
      place-items: center;
      font-size: 1.4rem;
      flex-shrink: 0;
      box-shadow: 0 4px 10px rgba(15, 23, 42, 0.15);
    }

    .audit-title {
      margin: 0;
      font-size: 1.35rem;
      font-weight: 900;
      color: #0f172a;
      letter-spacing: -0.02em;
    }

    .audit-subtitle {
      margin: 0.2rem 0 0;
      font-size: 0.84rem;
      color: #64748b;
      font-weight: 600;
    }

    .audit-kpis {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .audit-kpi-chip {
      display: flex;
      flex-direction: column;
      padding: 0.35rem 0.75rem;
      border-radius: 0.65rem;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      min-width: 74px;
    }

    .audit-kpi-chip .kpi-label {
      font-size: 0.68rem;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .audit-kpi-chip .kpi-val {
      font-size: 0.95rem;
      font-weight: 900;
      color: #1e293b;
    }

    .audit-kpi-chip.chip-cobrado {
      background: #ecfdf5;
      border-color: #a7f3d0;
    }
    .audit-kpi-chip.chip-cobrado .kpi-val { color: #047857; }

    .audit-kpi-chip.chip-proceso {
      background: #fffbeb;
      border-color: #fde68a;
    }
    .audit-kpi-chip.chip-proceso .kpi-val { color: #b45309; }

    .audit-kpi-chip.chip-pendiente {
      background: #f1f5f9;
      border-color: #cbd5e1;
    }
    .audit-kpi-chip.chip-pendiente .kpi-val { color: #475569; }

    .audit-kpi-chip.chip-anulado {
      background: #fef2f2;
      border-color: #fecaca;
    }
    .audit-kpi-chip.chip-anulado .kpi-val { color: #b91c1c; }

    .audit-kpi-chip.chip-total {
      background: #f0fdf4;
      border-color: #86efac;
    }
    .audit-kpi-chip.chip-total .kpi-val { color: #15803d; }

    .audit-controls-bar {
      display: grid;
      grid-template-columns: 1.5fr 2.5fr;
      gap: 0.85rem;
      align-items: center;
    }

    @media (max-width: 900px) {
      .audit-controls-bar {
        grid-template-columns: 1fr;
      }
    }

    .audit-search-box {
      position: relative;
      display: flex;
      align-items: center;
    }

    .audit-search-box .search-icon {
      position: absolute;
      left: 0.85rem;
      color: #94a3b8;
      font-size: 0.95rem;
      pointer-events: none;
    }

    .audit-search-input {
      width: 100%;
      height: 42px;
      padding: 0 2.2rem 0 2.4rem;
      border-radius: 0.75rem;
      border: 1.5px solid #cbd5e1;
      font-size: 0.88rem;
      color: #1e293b;
      background: #ffffff;
      outline: none;
      transition: all 0.15s ease;
    }

    .audit-search-input:focus {
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
    }

    .search-clear-btn {
      position: absolute;
      right: 0.75rem;
      background: none;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      font-size: 0.95rem;
      padding: 0;
      display: grid;
      place-items: center;
    }
    .search-clear-btn:hover { color: #475569; }

    .audit-filter-dropdowns {
      display: flex;
      flex-wrap: wrap;
      gap: 0.65rem;
      align-items: center;
    }

    .audit-select-label {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.82rem;
      font-weight: 700;
      color: #475569;
      flex: 1 1 auto;
      min-width: 140px;
    }

    .audit-select-label select {
      flex: 1;
      height: 40px;
      border-radius: 0.65rem;
      border: 1px solid #cbd5e1;
      background: #ffffff;
      padding: 0 0.6rem;
      font-size: 0.84rem;
      color: #1e293b;
      font-weight: 600;
      outline: none;
    }
    .audit-select-label select:focus {
      border-color: #2563eb;
    }

    .audit-status-chips {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      flex-wrap: wrap;
      padding: 0.65rem 0.85rem;
      background: #f8fafc;
      border-radius: 0.85rem;
      border: 1px solid #e2e8f0;
    }

    .chips-title {
      font-size: 0.8rem;
      font-weight: 800;
      color: #475569;
      margin-right: 0.35rem;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }

    .status-chip {
      padding: 0.35rem 0.75rem;
      border-radius: 0.55rem;
      border: 1px solid #cbd5e1;
      background: #ffffff;
      color: #475569;
      font-size: 0.78rem;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      transition: all 0.15s ease;
    }
    .status-chip:hover {
      background: #f1f5f9;
      border-color: #94a3b8;
    }
    .status-chip.active {
      background: #0f172a;
      color: #ffffff;
      border-color: #0f172a;
      box-shadow: 0 2px 6px rgba(15, 23, 42, 0.2);
    }
    .status-chip.chip-cobrado.active {
      background: #059669;
      border-color: #059669;
    }
    .status-chip.chip-entregado.active {
      background: #2563eb;
      border-color: #2563eb;
    }
    .status-chip.chip-proceso.active {
      background: #d97706;
      border-color: #d97706;
    }
    .status-chip.chip-pendiente.active {
      background: #475569;
      border-color: #475569;
    }
    .status-chip.chip-anulado.active {
      background: #dc2626;
      border-color: #dc2626;
    }

    .audit-table-wrapper {
      overflow-x: auto;
      border: 1px solid #e2e8f0;
      border-radius: 0.85rem;
      background: #ffffff;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.02);
    }

    .audit-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.86rem;
      text-align: left;
    }

    .audit-table thead tr {
      background: #f8fafc;
      border-bottom: 2px solid #e2e8f0;
      color: #475569;
      font-weight: 800;
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .audit-table th {
      padding: 0.75rem 0.85rem;
      user-select: none;
      white-space: nowrap;
    }

    .sortable-th {
      cursor: pointer;
      transition: background 0.15s ease;
    }
    .sortable-th:hover {
      background: #f1f5f9;
      color: #1e293b;
    }

    .th-content {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
    }
    .th-content i {
      font-size: 0.85rem;
      color: #94a3b8;
    }
    .sortable-th:hover .th-content i {
      color: #2563eb;
    }

    .audit-row {
      border-bottom: 1px solid #f1f5f9;
      cursor: pointer;
      transition: background 0.12s ease;
    }
    .audit-row:hover {
      background: #f8fafc;
    }

    .audit-table td {
      padding: 0.65rem 0.85rem;
      vertical-align: middle;
    }

    .audit-order-id {
      font-family: monospace;
      font-weight: 800;
      font-size: 0.88rem;
      color: #1e293b;
      background: #f1f5f9;
      padding: 0.2rem 0.45rem;
      border-radius: 0.4rem;
      border: 1px solid #e2e8f0;
    }

    .audit-date-cell {
      display: flex;
      flex-direction: column;
      line-height: 1.2;
    }
    .audit-date-cell strong {
      font-size: 0.82rem;
      color: #1e293b;
    }
    .audit-date-cell small {
      font-size: 0.74rem;
      color: #64748b;
    }

    .audit-table-badge {
      font-weight: 800;
      font-size: 0.82rem;
      color: #334155;
      background: #f1f5f9;
      padding: 0.2rem 0.5rem;
      border-radius: 0.45rem;
      border: 1px solid #cbd5e1;
      white-space: nowrap;
    }

    .audit-client-cell {
      display: flex;
      flex-direction: column;
      line-height: 1.25;
    }
    .audit-client-cell strong {
      color: #0f172a;
      font-size: 0.86rem;
    }
    .audit-client-cell small {
      color: #64748b;
      font-size: 0.74rem;
    }

    .audit-locals-cell {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
    }

    .audit-local-tag {
      font-size: 0.72rem;
      font-weight: 800;
      padding: 0.15rem 0.45rem;
      border-radius: 0.35rem;
      background: #f0fdf4;
      color: #166534;
      border: 1px solid #bbf7d0;
      white-space: nowrap;
    }

    .audit-creator-cell {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
      line-height: 1.2;
    }
    .audit-creator-cell small {
      font-size: 0.74rem;
      color: #64748b;
    }

    .audit-source-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.72rem;
      font-weight: 800;
      padding: 0.15rem 0.45rem;
      border-radius: 0.35rem;
      background: #eff6ff;
      color: #1d4ed8;
      border: 1px solid #bfdbfe;
      width: fit-content;
    }
    .audit-source-badge.source-qr {
      background: #fdf4ff;
      color: #86198f;
      border-color: #f5d0fe;
    }

    .audit-status-badge {
      display: inline-block;
      font-size: 0.75rem;
      font-weight: 800;
      padding: 0.25rem 0.6rem;
      border-radius: 0.5rem;
      border: 1px solid transparent;
      white-space: nowrap;
    }

    .audit-total-cell {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      line-height: 1.2;
    }
    .audit-total-cell strong {
      font-size: 0.95rem;
      color: #059669;
      font-weight: 900;
    }
    .audit-total-cell small {
      font-size: 0.72rem;
      color: #64748b;
    }

    .audit-action-btns {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }

    .btn-audit-detail {
      font-size: 0.76rem;
      font-weight: 800;
      padding: 0.35rem 0.7rem;
      border-radius: 0.5rem;
      border: 1px solid #cbd5e1;
      background: #ffffff;
      color: #0f172a;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      transition: all 0.15s ease;
    }
    .btn-audit-detail:hover {
      background: #0f172a;
      color: #ffffff;
      border-color: #0f172a;
    }

    .btn-audit-reprint {
      font-size: 0.76rem;
      font-weight: 800;
      padding: 0.35rem 0.55rem;
      border-radius: 0.5rem;
      border: 1px solid #bfdbfe;
      background: #eff6ff;
      color: #1d4ed8;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      transition: all 0.15s ease;
    }
    .btn-audit-reprint:hover {
      background: #2563eb;
      color: #ffffff;
    }

    .audit-pagination-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.75rem;
      padding-top: 0.85rem;
      border-top: 1px solid #f1f5f9;
      font-size: 0.85rem;
    }

    .pagination-info {
      color: #64748b;
      font-size: 0.82rem;
    }

    .pagination-controls {
      display: flex;
      align-items: center;
      gap: 0.45rem;
    }

    .pagination-btn {
      padding: 0.35rem 0.75rem;
      font-weight: 800;
      font-size: 0.82rem;
      border-radius: 0.5rem;
      border: 1px solid #cbd5e1;
      background: #ffffff;
      color: #334155;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      transition: all 0.15s ease;
    }
    .pagination-btn:hover:not(:disabled) {
      background: #f1f5f9;
      border-color: #94a3b8;
    }
    .pagination-btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    .pagination-page-indicator {
      font-size: 0.82rem;
      color: #475569;
      padding: 0 0.4rem;
    }

    .audit-empty-state {
      padding: 3rem 1.5rem;
      text-align: center;
      background: #f8fafc;
      border-radius: 0.85rem;
      border: 1px dashed #cbd5e1;
    }
    .audit-empty-state .empty-icon {
      font-size: 2.5rem;
      color: #94a3b8;
      display: block;
      margin-bottom: 0.5rem;
    }
    .audit-empty-state h3 {
      margin: 0;
      color: #1e293b;
      font-size: 1.1rem;
      font-weight: 800;
    }
    .audit-empty-state p {
      margin: 0.35rem 0 0.5rem;
      color: #64748b;
      font-size: 0.86rem;
    }

    /* Modal de Auditoría Detallada */
    .audit-detail-modal {
      width: min(840px, 96vw);
      max-height: 92vh;
      overflow-y: auto;
      border-radius: 1.25rem;
      background: #ffffff;
      padding: 1.5rem;
    }

    .modal-head-tag {
      font-size: 0.72rem;
      font-weight: 900;
      letter-spacing: 0.08em;
      padding: 0.25rem 0.6rem;
      border-radius: 0.45rem;
      background: #0f172a;
      color: #38bdf8;
    }

    .audit-detail-body {
      display: grid;
      gap: 1.15rem;
      margin-top: 1rem;
    }

    .audit-status-summary-card {
      padding: 1rem 1.15rem;
      border-radius: 0.85rem;
      border: 1px solid #e2e8f0;
      display: grid;
      gap: 0.85rem;
    }

    .audit-trace-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 0.65rem 1.2rem;
    }

    .trace-item {
      display: flex;
      flex-direction: column;
      line-height: 1.2;
    }
    .trace-label {
      font-size: 0.72rem;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }
    .trace-val {
      font-size: 0.88rem;
      color: #0f172a;
      margin-top: 0.15rem;
    }

    .audit-payment-box {
      padding: 0.95rem 1.15rem;
      border-radius: 0.85rem;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
    }

    .audit-subtable {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.84rem;
    }
    .audit-subtable thead tr {
      background: #f1f5f9;
      color: #475569;
      font-size: 0.75rem;
      font-weight: 800;
      text-transform: uppercase;
    }
    .audit-subtable th {
      padding: 0.6rem 0.75rem;
      text-align: left;
    }
    .audit-subtable td {
      padding: 0.55rem 0.75rem;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
    }

    .area-badge {
      font-size: 0.7rem;
      font-weight: 800;
      padding: 0.15rem 0.45rem;
      border-radius: 0.35rem;
      background: #f1f5f9;
      color: #475569;
      border: 1px solid #cbd5e1;
    }

    .item-status-pill {
      font-size: 0.72rem;
      font-weight: 800;
      padding: 0.15rem 0.5rem;
      border-radius: 0.4rem;
      text-transform: uppercase;
    }
    .item-status-pill.item-status-pendiente {
      background: #f1f5f9;
      color: #64748b;
    }
    .item-status-pill.item-status-en_proceso {
      background: #fffbeb;
      color: #b45309;
    }
    .item-status-pill.item-status-listo {
      background: #f0fdf4;
      color: #15803d;
    }
    .item-status-pill.item-status-entregado {
      background: #eff6ff;
      color: #1d4ed8;
    }
    .item-status-pill.item-status-anulado {
      background: #fef2f2;
      color: #b91c1c;
    }

    .item-audit-note {
      display: block;
      color: #d97706;
      font-size: 0.74rem;
      font-weight: 700;
      margin-top: 0.15rem;
    }

  `
})
export class ReportsPageComponent {
  private readonly state = inject(AppStateService);
  readonly canAccessReportes = computed(() => this.state.canAccessModule('reportes'));
  readonly localKeys = computed<RestaurantId[]>(() => this.state.allowedRestaurantIds());
  readonly isDataLoading = computed(() => this.state.runtimeDataLoading());
  readonly dataError = computed(() => this.state.runtimeDataError());
  readonly reportHeaderLabel = computed(() => {
    if (this.restaurant !== 'ALL') {
      return this.localLabel(this.restaurant);
    }

    const allowed = this.localKeys();
    if (allowed.length === 1) {
      return this.localLabel(allowed[0]);
    }

    return 'General';
  });
  readonly isReportOptionsModalOpen = signal(false);
  readonly isProductChartModalOpen = signal(false);
  readonly isProductListModalOpen = signal(false);

  restaurant: RestaurantId | 'ALL' = 'ALL';
  periodPreset: 'DIARIO' | 'SEMANAL' | 'MENSUAL' | 'RANGO' = 'DIARIO';
  readonly fromDateTime = signal('');
  readonly toDateTime = signal('');
  selectedPaymentMethods: PaymentMethodFilter[] = [
    'EFECTIVO',
    'PAGO_MOVIL',
    'TRANSFERENCIA',
    'TARJETA',
    'OTRO',
    'SIN_REGISTRO'
  ];
  readonly paymentMethodFilters: Array<{ value: PaymentMethodFilter; label: string }> = [
    { value: 'EFECTIVO', label: 'Efectivo' },
    { value: 'PAGO_MOVIL', label: 'Pago movil' },
    { value: 'TRANSFERENCIA', label: 'Transferencia' },
    { value: 'TARJETA', label: 'Tarjeta' },
    { value: 'OTRO', label: 'Otro' },
    { value: 'SIN_REGISTRO', label: 'Sin registro' }
  ];

  readonly filteredOrders = computed(() => {
    const { from, to } = this.getNormalizedRange();

    return this.state.getVisibleOrdersForModule('reportes').filter((order) => {
      if (order.status !== 'COBRADO') {
        return false;
      }

      const paymentMethod = this.getPaymentMethodFilterValue(order);
      if (!this.selectedPaymentMethods.includes(paymentMethod)) {
        return false;
      }

      const reportDate = new Date(order.closedAt || order.createdAt);
      if (reportDate < from || reportDate > to) {
        return false;
      }

      if (this.restaurant === 'ALL') {
        return true;
      }

      return order.items.some((item) => item.restaurantId === this.restaurant);
    });
  });

  readonly productSales = computed<ProductSales[]>(() => {
    const map = new Map<string, ProductSales>();

    this.filteredOrders().forEach((order) => {
      order.items.forEach((item) => {
        if (this.restaurant !== 'ALL' && item.restaurantId !== this.restaurant) {
          return;
        }

        const found = map.get(item.productId);
        const sales = item.quantity * item.unitPrice;
        if (found) {
          found.quantity += item.quantity;
          found.sales += sales;
          return;
        }

        map.set(item.productId, {
          productId: item.productId,
          name: item.productName,
          quantity: item.quantity,
          sales
        });
      });
    });

    return Array.from(map.values()).sort((a, b) => b.sales - a.sales);
  });

  readonly inventoryArticleSales = computed<InventoryArticleSales[]>(() => {
    const map = new Map<string, InventoryArticleSales>();
    const articles = this.state.inventoryArticles().filter(a => a.restaurantId === 'PAPA_Y_SON');
    
    const productToArticlesMap = new Map<string, Array<{ articleId: string; quantityPerSale: number; name: string; unit: string }>>();
    articles.forEach(article => {
       article.linkedProducts.forEach(link => {
           const existing = productToArticlesMap.get(link.productId) || [];
           existing.push({ articleId: article.id, quantityPerSale: link.quantityPerSale, name: article.name, unit: article.unit });
           productToArticlesMap.set(link.productId, existing);
       });
    });

    this.filteredOrders().forEach((order) => {
      order.items.forEach((item) => {
        if (item.restaurantId !== 'PAPA_Y_SON') {
          return;
        }

        const linkedArticles = productToArticlesMap.get(item.productId);
        if (linkedArticles) {
           linkedArticles.forEach(link => {
              const consumedQuantity = item.quantity * link.quantityPerSale;
              const found = map.get(link.articleId);
              if (found) {
                 found.quantity += consumedQuantity;
              } else {
                 map.set(link.articleId, {
                    articleId: link.articleId,
                    name: link.name,
                    quantity: consumedQuantity,
                    unit: link.unit
                 });
              }
           });
        }
      });
    });

    return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity);
  });

  readonly categorySales = computed<CategorySales[]>(() => {
    const totals = new Map<string, { label: string; sales: number; quantity: number }>();
    
    const productToCategory = new Map<string, string>();
    this.state.products().forEach(p => productToCategory.set(p.id, p.category));
    
    const categoryNames = new Map<string, string>();
    this.state.productCategories().forEach(c => categoryNames.set(c.id, c.name));

    this.filteredOrders().forEach((order) => {
      order.items.forEach((item) => {
        if (item.restaurantId !== 'PAPA_Y_SON') return;

        const categoryId = productToCategory.get(item.productId);
        if (!categoryId) return;

        const current = totals.get(categoryId) ?? {
          label: categoryNames.get(categoryId) ?? categoryId,
          sales: 0,
          quantity: 0
        };
        current.sales += item.quantity * item.unitPrice;
        current.quantity += item.quantity;
        totals.set(categoryId, current);
      });
    });

    return Array.from(totals.entries()).map(([categoryId, data]) => ({
      categoryId,
      ...data
    })).sort((a, b) => b.sales - a.sales);
  });

  readonly localSales = computed<LocalSales[]>(() => {
    const totals = new Map<RestaurantId, number>();
    this.localKeys().forEach((restaurantId) => {
      totals.set(restaurantId, 0);
    });

    this.filteredOrders().forEach((order) => {
      order.items.forEach((item) => {
        totals.set(item.restaurantId, (totals.get(item.restaurantId) ?? 0) + item.quantity * item.unitPrice);
      });
    });

    const values: LocalSales[] = this.localKeys().map((restaurantId) => ({
      restaurantId,
      label: this.localLabel(restaurantId),
      sales: totals.get(restaurantId) ?? 0
    }));

    return values.filter((item) => this.restaurant === 'ALL' || item.restaurantId === this.restaurant);
  });

  readonly totalItems = computed(() =>
    this.filteredOrders().reduce(
      (sum, order) => sum + order.items.reduce((inner, item) => inner + item.quantity, 0),
      0
    )
  );

  readonly totalSales = computed(() =>
    this.filteredOrders().reduce((sum, order) => sum + this.orderTotal(order), 0)
  );

  readonly reportOrders = computed<ReportOrderSummary[]>(() =>
    this.filteredOrders()
      .map((order) => ({
        id: order.id,
        clientName: order.clientName,
        paidAt: order.closedAt || order.createdAt,
        total: this.orderTotal(order),
        paymentMethod: this.getPaymentMethodLabel(order),
        paymentReference: order.paymentReference?.trim() || 'SIN REFERENCIA'
      }))
      .sort((left, right) => new Date(right.paidAt).getTime() - new Date(left.paidAt).getTime())
  );

  readonly averageTicket = computed(() => {
    const ordersCount = this.filteredOrders().length;
    if (!ordersCount) {
      return 0;
    }

    return this.totalSales() / ordersCount;
  });

  readonly sortColumn = signal<'id' | 'paidAt' | 'clientName' | 'paymentMethod' | 'total'>('paidAt');
  readonly sortDirection = signal<'asc' | 'desc'>('desc');
  readonly currentPage = signal(1);
  readonly pageSize = signal(10);

  readonly totalPages = computed(() => {
    const total = this.sortedReportOrders().length;
    return Math.max(1, Math.ceil(total / this.pageSize()));
  });

  readonly paginatedReportOrders = computed(() => {
    const page = Math.min(this.currentPage(), this.totalPages());
    const start = (page - 1) * this.pageSize();
    return this.sortedReportOrders().slice(start, start + this.pageSize());
  });

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
    }
  }

  toggleSort(column: 'id' | 'paidAt' | 'clientName' | 'paymentMethod' | 'total'): void {
    if (this.sortColumn() === column) {
      this.sortDirection.update((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set('desc');
    }
    this.currentPage.set(1);
  }

  readonly sortedReportOrders = computed(() => {
    const orders = [...this.reportOrders()];
    const col = this.sortColumn();
    const dir = this.sortDirection() === 'asc' ? 1 : -1;

    return orders.sort((a, b) => {
      if (col === 'total') {
        return (a.total - b.total) * dir;
      }
      if (col === 'paidAt') {
        const timeA = new Date(a.paidAt).getTime();
        const timeB = new Date(b.paidAt).getTime();
        return (timeA - timeB) * dir;
      }
      if (col === 'id') {
        return a.id.localeCompare(b.id) * dir;
      }
      if (col === 'clientName') {
        return (a.clientName || '').localeCompare(b.clientName || '') * dir;
      }
      if (col === 'paymentMethod') {
        return (a.paymentMethod || '').localeCompare(b.paymentMethod || '') * dir;
      }
      return 0;
    });
  });

  tableLabel(order: Order): string {
    return formatTableNumberLabel(order.tableNumber, order.items.map((item) => item.restaurantId));
  }

  printSingleOrderTicket(orderId: string): void {
    const order = this.state.orders().find((o) => o.id === orderId);
    if (!order) {
      return;
    }

    const bcv = this.state.appSettings().bcvRate;
    const subtotal = order.items
      .filter((i) => i.status !== 'ANULADO')
      .reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const totalUsd = order.paymentAmountUsd ?? subtotal;
    const totalBs = order.paymentAmountBs ?? (totalUsd * bcv);

    this.state.queueConsumptionPrintJob({
      restaurantIds: [...new Set(order.items.map((i) => i.restaurantId))],
      localLabels: [...new Set(order.items.map((i) => this.localLabel(i.restaurantId)))],
      tableLabels: [this.tableLabel(order)],
      orderIds: [order.id],
      clientName: order.clientName,
      clientDocumentId: order.clientDocumentId ?? '',
      items: order.items
        .filter((i) => i.status !== 'ANULADO')
        .map((i) => ({
          productName: i.productName,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          total: i.quantity * i.unitPrice
        })),
      subtotalUsd: subtotal,
      tipUsd: 0,
      taxBs: 0,
      totalUsd,
      totalBs,
      paymentMethod: order.paymentMethod ?? 'EFECTIVO',
      paymentReference: order.paymentReference ?? ''
    });

    const popup = window.open('', '_blank', 'width=400,height=600');
    if (!popup) {
      return;
    }

    const itemsRows = order.items
      .filter((i) => i.status !== 'ANULADO')
      .map((i) => '<tr><td style="padding:4px 0;">' + i.quantity + 'x ' + i.productName + '</td><td style="text-align:right;padding:4px 0;">$' + (i.quantity * i.unitPrice).toFixed(2) + '</td></tr>')
      .join('');

    const formattedDate = new Date(order.closedAt || order.createdAt).toLocaleString('es-VE');
    const refLine = order.paymentReference ? '<p><strong>Ref:</strong> ' + order.paymentReference + '</p>' : '';

    const htmlContent = [
      '<!DOCTYPE html><html><head><title>Factura #' + order.id + '</title>',
      '<style>body{font-family:monospace;padding:15px;width:280px;margin:0 auto;color:#000;}h2{text-align:center;margin:0 0 5px 0;text-transform:uppercase;font-size:1.2rem;}p{margin:3px 0;font-size:0.85rem;}hr{border:none;border-top:1px dashed #000;margin:10px 0;}table{width:100%;font-size:0.85rem;border-collapse:collapse;}.right{text-align:right;}.bold{font-weight:bold;}.center{text-align:center;}</style>',
      '</head><body>',
      '<h2>PAPA Y SON</h2>',
      '<p class="center">COMPROBANTE / FACTURA DE PAGO</p>',
      '<hr>',
      '<p><strong>Orden:</strong> #' + order.id + '</p>',
      '<p><strong>Cliente:</strong> ' + order.clientName + '</p>',
      '<p><strong>Mesa:</strong> ' + this.tableLabel(order) + '</p>',
      '<p><strong>Fecha:</strong> ' + formattedDate + '</p>',
      '<p><strong>Metodo:</strong> ' + (order.paymentMethod || 'EFECTIVO') + '</p>',
      refLine,
      '<hr>',
      '<table><thead><tr><th style="text-align:left;">Cant/Item</th><th style="text-align:right;">Total</th></tr></thead><tbody>',
      itemsRows,
      '</tbody></table>',
      '<hr>',
      '<p class="bold right" style="font-size:1.05rem;">TOTAL USD: $' + totalUsd.toFixed(2) + '</p>',
      '<p class="right" style="font-size:0.95rem;">TOTAL BS: Bs. ' + totalBs.toFixed(2) + '</p>',
      '<hr>',
      '<p class="center">¡Gracias por su preferencia!</p>',
      '</body></html>'
    ].join('\n');

    popup.document.open();
    popup.document.write(htmlContent);
    popup.document.close();
    popup.focus();
    setTimeout(() => popup.print(), 250);
  }

  readonly pieSlices = computed(() => {
    const useInventory = this.restaurant === 'PAPA_Y_SON' && this.inventoryArticleSales().length > 0;
    const items = useInventory ? this.inventoryArticleSales() : this.productSales();
    const total = useInventory 
      ? (items as InventoryArticleSales[]).reduce((sum, item) => sum + item.quantity, 0)
      : (items as ProductSales[]).reduce((sum, item) => sum + item.sales, 0);
      
    if (!total) {
      return [];
    }

    let offset = 0;
    return items.slice(0, 6).map((item) => {
      const value = useInventory ? (item as InventoryArticleSales).quantity : (item as ProductSales).sales;
      const fraction = value / total;
      const dash = fraction * 188.5;
      const slice = {
        name: item.name,
        color: this.productColor(item.name),
        dasharray: `${dash} 188.5`,
        dashoffset: -offset
      };
      offset += dash;
      return slice;
    });
  });

  constructor() {
    const allowed = this.state.allowedRestaurantIds();
    if (allowed.length === 1) {
      this.restaurant = allowed[0];
    }
    this.applyPreset('DIARIO');
  }

  canSelectAllRestaurants(): boolean {
    return this.localKeys().length > 1;
  }

  applyPreset(preset: 'DIARIO' | 'SEMANAL' | 'MENSUAL' | 'RANGO'): void {
    this.periodPreset = preset;
    this.currentPage.set(1);
    if (preset === 'RANGO') {
      return;
    }

    const now = new Date();
    const from = new Date(now);
    const to = new Date(now);

    if (preset === 'DIARIO') {
      from.setHours(0, 0, 0, 0);
      to.setHours(23, 59, 59, 999);
    } else if (preset === 'SEMANAL') {
      from.setDate(now.getDate() - 7);
      from.setHours(0, 0, 0, 0);
      to.setHours(23, 59, 59, 999);
    } else {
      from.setDate(now.getDate() - 30);
      from.setHours(0, 0, 0, 0);
      to.setHours(23, 59, 59, 999);
    }

    this.fromDateTime.set(this.toDatetimeLocalValue(from));
    this.toDateTime.set(this.toDatetimeLocalValue(to));
  }

  selectAllPaymentMethods(): void {
    this.selectedPaymentMethods = this.paymentMethodFilters.map((item) => item.value);
  }

  clearPaymentMethods(): void {
    this.selectedPaymentMethods = [];
  }

  onRangeFieldChange(type?: 'from' | 'to', value?: string): void {
    this.periodPreset = 'RANGO';
    this.currentPage.set(1);
    if (type === 'from' && value !== undefined) {
      this.fromDateTime.set(value);
    } else if (type === 'to' && value !== undefined) {
      this.toDateTime.set(value);
    }
  }

  openReportOptionsModal(): void {
    this.isReportOptionsModalOpen.set(true);
  }

  closeReportOptionsModal(): void {
    this.isReportOptionsModalOpen.set(false);
  }

  openProductChartModal(): void {
    this.isProductChartModalOpen.set(true);
  }

  closeProductChartModal(): void {
    this.isProductChartModalOpen.set(false);
  }

  openProductListModal(): void {
    this.isProductListModalOpen.set(true);
  }

  closeProductListModal(): void {
    this.isProductListModalOpen.set(false);
  }

  retryLoad(): void {
    void this.state.retryRuntimeDataLoad();
  }

  cancelLoad(): void {
    this.state.clearRuntimeDataError();
  }

  periodLabel(): string {
    if (this.periodPreset === 'DIARIO') {
      return 'Diario';
    }

    if (this.periodPreset === 'SEMANAL') {
      return 'Semanal';
    }

    if (this.periodPreset === 'MENSUAL') {
      return 'Mensual';
    }

    return 'Rango manual';
  }

  localLabel(local: RestaurantId): string {
    return this.state.restaurants().find((restaurant) => restaurant.id === local)?.name ?? local;
  }

  orderTotal(order: Order): number {
    return order.items
      .filter((item) => this.restaurant === 'ALL' || item.restaurantId === this.restaurant)
      .reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  }

  auditOrderTotal(order: Order): number {
    const restaurant = this.auditRestaurantFilter();
    return order.items
      .filter((item) => restaurant === 'ALL' || item.restaurantId === restaurant)
      .reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  }

  private orderTotalByRestaurant(order: Order, restaurantId: RestaurantId): number {
    return order.items
      .filter((item) => item.restaurantId === restaurantId)
      .reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  }

  barPercent(value: number): number {
    const max = Math.max(...this.localSales().map((item) => item.sales), 0);
    if (max === 0) {
      return 0;
    }

    return (value / max) * 100;
  }

  productColor(seed: string): string {
    const palette = ['#6764ff', '#ff8f71', '#2f7a48', '#5aa8ff', '#f4b942', '#b07cff'];
    const index = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0) % palette.length;
    return palette[index];
  }

  private getPaymentMethodLabel(order: Order): string {
    if (!order.paymentMethod) {
      return 'SIN REGISTRO';
    }

    return order.paymentMethod === 'PAGO_MOVIL' ? 'PAGO MOVIL' : order.paymentMethod;
  }

  private getPaymentMethodFilterValue(order: Order): PaymentMethodFilter {
    return order.paymentMethod ?? 'SIN_REGISTRO';
  }

  private selectedPaymentMethodLabels(): string[] {
    const selectedSet = new Set(this.selectedPaymentMethods);
    return this.paymentMethodFilters
      .filter((item) => selectedSet.has(item.value))
      .map((item) => item.label);
  }

  printReport(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const { from, to } = this.getNormalizedRange();
    const visibleRestaurantIds = this.restaurant === 'ALL' ? this.localKeys() : [this.restaurant];
    const ordersById = new Map(this.filteredOrders().map((order) => [order.id, order]));
    const restaurantHeaders = visibleRestaurantIds
      .map((restaurantId) => `<th>${this.localLabel(restaurantId)}</th>`)
      .join('');
    const content = `
      <html>
        <head>
          <title>Reporte de Ventas</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #222; }
            h1, h2 { margin: 0 0 8px; }
            p { margin: 0 0 10px; }
            .meta { margin-bottom: 16px; }
            .section { margin-top: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background: #f4f4f4; }
          </style>
        </head>
        <body>
          <h1>Reporte de Ventas</h1>
          <div class="meta">
            <p><strong>Local:</strong> ${this.restaurant === 'ALL' ? 'Todos' : this.localLabel(this.restaurant)}</p>
            <p><strong>Desde:</strong> ${from.toLocaleString()}</p>
            <p><strong>Hasta:</strong> ${to.toLocaleString()}</p>
            <p><strong>Metodos de pago:</strong> ${this.selectedPaymentMethodLabels().join(', ') || 'Ninguno'}</p>
            <p><strong>Total ventas:</strong> $${this.totalSales().toFixed(2)}</p>
          </div>

          <div class="section">
            <h2>Ventas por productos</h2>
            <table>
              <thead><tr><th>Producto</th><th>Cantidad</th><th>Precio Uni.</th><th>Total</th></tr></thead>
              <tbody>
                ${this.productSales()
                  .map(
                    (item) =>
                      `<tr><td>${item.name}</td><td>${item.quantity}</td><td>$${(item.sales / item.quantity).toFixed(2)}</td><td>$${item.sales.toFixed(2)}</td></tr>`
                  )
                  .join('')}
              </tbody>
            </table>
          </div>

          ${this.restaurant === 'PAPA_Y_SON' ? `
          <div class="section">
            <h2>Artículos consumidos</h2>
            <table>
              <thead><tr><th>Artículo</th><th>Cantidad</th><th>Unidad</th></tr></thead>
              <tbody>
                ${this.inventoryArticleSales()
                  .map((item) => `<tr><td>${item.name}</td><td>${Number(item.quantity).toFixed(3)}</td><td>${item.unit}</td></tr>`)
                  .join('')}
              </tbody>
            </table>
          </div>
          ` : ''}

          <div class="section">
            <h2>${this.restaurant === 'PAPA_Y_SON' ? 'Ventas por categorías' : 'Ventas por local'}</h2>
            <table>
              <thead><tr><th>${this.restaurant === 'PAPA_Y_SON' ? 'Categoría' : 'Local'}</th><th>Ventas</th></tr></thead>
              <tbody>
                ${this.restaurant === 'PAPA_Y_SON'
                  ? this.categorySales()
                      .map((item) => `<tr><td>${item.label}</td><td>$${item.sales.toFixed(2)}</td></tr>`)
                      .join('')
                  : this.localSales()
                      .map((item) => `<tr><td>${item.label}</td><td>$${item.sales.toFixed(2)}</td></tr>`)
                      .join('')}
              </tbody>
            </table>
          </div>

          <div class="section">
            <h2>Comandas del periodo</h2>
            <table>
              <thead><tr><th>Comanda</th><th>Cliente</th><th>Metodo de pago</th><th>Referencia</th><th>Fecha de pago</th>${restaurantHeaders}<th>Monto</th></tr></thead>
              <tbody>
                ${this.reportOrders()
                  .map((item) => {
                    const order = ordersById.get(item.id);
                    const restaurantCells = visibleRestaurantIds
                      .map((restaurantId) => {
                        const restaurantTotal = order ? this.orderTotalByRestaurant(order, restaurantId) : 0;
                        return `<td>$${restaurantTotal.toFixed(2)}</td>`;
                      })
                      .join('');

                    return `<tr><td>${item.id}</td><td>${item.clientName}</td><td>${item.paymentMethod}</td><td>${item.paymentReference}</td><td>${new Date(item.paidAt).toLocaleString()}</td>${restaurantCells}<td>$${item.total.toFixed(2)}</td></tr>`;
                  })
                  .join('')}
              </tbody>
            </table>
          </div>

          <div class="section">
            <h2>Resumen</h2>
            <p><strong>Comandas cobradas:</strong> ${this.filteredOrders().length}</p>
            <p><strong>Items vendidos:</strong> ${this.totalItems()}</p>
            <p><strong>Ticket promedio:</strong> $${this.averageTicket().toFixed(2)}</p>
          </div>
        </body>
      </html>
    `;

    const popup = window.open('', '_blank', 'width=900,height=700');
    if (!popup) {
      return;
    }

    popup.document.open();
    popup.document.write(content);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  private getFromDate(): Date {
    const val = this.fromDateTime();
    if (!val) {
      return new Date(Date.now() - 24 * 60 * 60 * 1000);
    }

    return new Date(val);
  }

  private getToDate(): Date {
    const val = this.toDateTime();
    if (!val) {
      return new Date(Date.now() + 24 * 60 * 60 * 1000);
    }

    const d = new Date(val);
    d.setSeconds(59, 999);
    return d;
  }

  getNormalizedRange(): { from: Date; to: Date } {
    const from = this.getFromDate();
    const to = this.getToDate();

    if (from.getTime() <= to.getTime()) {
      return { from, to };
    }

    return { from: to, to: from };
  }

  private toDatetimeLocalValue(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  // --- LOGICA DEL PANEL DE AUDITORIA GENERAL DE COMANDAS ---
  readonly auditSearchQuery = signal('');
  readonly auditStatusFilter = signal<string>('ALL');
  readonly auditRestaurantFilter = signal<string>('ALL');
  readonly auditSourceFilter = signal<string>('ALL');
  readonly auditPaymentFilter = signal<string>('ALL');
  readonly auditSortColumn = signal<'id' | 'createdAt' | 'table' | 'client' | 'status' | 'total'>('createdAt');
  readonly auditSortDirection = signal<'asc' | 'desc'>('desc');
  readonly auditCurrentPage = signal<number>(1);
  readonly auditPageSize = signal<number>(10);
  readonly selectedAuditOrder = signal<Order | null>(null);
  readonly isAuditDetailModalOpen = signal<boolean>(false);

  readonly allAuditOrders = computed<Order[]>(() => {
    const rawOrders = this.state.orders();
    const allowedLocals = this.localKeys();
    if (this.canSelectAllRestaurants()) {
      return rawOrders;
    }
    return rawOrders.filter((order) =>
      order.items.some((item) => allowedLocals.includes(item.restaurantId))
    );
  });

  readonly auditCounts = computed(() => {
    const orders = this.allAuditOrders();
    let total = orders.length;
    let cobradas = 0;
    let entregadas = 0;
    let enProceso = 0;
    let pendientes = 0;
    let anuladas = 0;
    let totalMonto = 0;

    for (const order of orders) {
      if (order.status === 'COBRADO') cobradas++;
      else if (order.status === 'ENTREGADO') entregadas++;
      else if (order.status === 'EN_PROCESO' || order.status === 'LISTO') enProceso++;
      else if (order.status === 'PENDIENTE') pendientes++;
      else if (order.status === 'ANULADO') anuladas++;

      if (order.status !== 'ANULADO') {
        totalMonto += this.auditOrderTotal(order);
      }
    }

    return { total, cobradas, entregadas, enProceso, pendientes, anuladas, totalMonto };
  });

  readonly filteredAuditOrders = computed<Order[]>(() => {
    const orders = this.allAuditOrders();
    const query = this.auditSearchQuery().trim().toLowerCase();
    const status = this.auditStatusFilter();
    const restaurant = this.auditRestaurantFilter();
    const source = this.auditSourceFilter();
    const payment = this.auditPaymentFilter();

    return orders.filter((order) => {
      // Filtro de Estado
      if (status !== 'ALL') {
        if (status === 'EN_PROCESO' && (order.status === 'EN_PROCESO' || order.status === 'LISTO')) {
          // Coincide con preparación activa
        } else if (order.status !== status) {
          return false;
        }
      }

      // Filtro de Restaurante
      if (restaurant !== 'ALL') {
        if (!order.items.some((i) => i.restaurantId === restaurant)) {
          return false;
        }
      }

      // Filtro de Origen
      if (source !== 'ALL') {
        if (order.source !== source) {
          return false;
        }
      }

      // Filtro de Pago
      if (payment !== 'ALL') {
        const orderPayment = this.getPaymentMethodFilterValue(order);
        if (orderPayment !== payment) {
          return false;
        }
      }

      // Filtro de Búsqueda de texto
      if (query) {
        const idMatch = order.id.toLowerCase().includes(query);
        const clientMatch = (order.clientName || '').toLowerCase().includes(query);
        const docMatch = (order.clientDocumentId || '').toLowerCase().includes(query);
        const tableMatch = String(order.tableNumber).includes(query) || this.tableLabel(order).toLowerCase().includes(query);
        const userCreator = this.getUserDisplayName(order.createdByUserId).toLowerCase();
        const userMatch = userCreator.includes(query);
        const refMatch = (order.paymentReference || '').toLowerCase().includes(query);
        const methodMatch = (order.paymentMethod || '').toLowerCase().includes(query);
        const itemsMatch = order.items.some((item) =>
          item.productName.toLowerCase().includes(query)
        );

        if (!idMatch && !clientMatch && !docMatch && !tableMatch && !userMatch && !refMatch && !methodMatch && !itemsMatch) {
          return false;
        }
      }

      return true;
    });
  });

  readonly sortedAuditOrders = computed<Order[]>(() => {
    const orders = [...this.filteredAuditOrders()];
    const col = this.auditSortColumn();
    const dir = this.auditSortDirection() === 'asc' ? 1 : -1;

    return orders.sort((a, b) => {
      if (col === 'total') {
        return (this.auditOrderTotal(a) - this.auditOrderTotal(b)) * dir;
      }
      if (col === 'createdAt') {
        return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
      }
      if (col === 'id') {
        return a.id.localeCompare(b.id) * dir;
      }
      if (col === 'table') {
        return (a.tableNumber - b.tableNumber) * dir;
      }
      if (col === 'client') {
        return (a.clientName || '').localeCompare(b.clientName || '') * dir;
      }
      if (col === 'status') {
        return a.status.localeCompare(b.status) * dir;
      }
      return 0;
    });
  });

  readonly auditTotalPages = computed<number>(() => {
    const total = this.sortedAuditOrders().length;
    return Math.max(1, Math.ceil(total / this.auditPageSize()));
  });

  readonly paginatedAuditOrders = computed<Order[]>(() => {
    const page = Math.min(this.auditCurrentPage(), this.auditTotalPages());
    const start = (page - 1) * this.auditPageSize();
    return this.sortedAuditOrders().slice(start, start + this.auditPageSize());
  });

  toggleAuditSort(col: 'id' | 'createdAt' | 'table' | 'client' | 'status' | 'total'): void {
    if (this.auditSortColumn() === col) {
      this.auditSortDirection.update((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      this.auditSortColumn.set(col);
      this.auditSortDirection.set(col === 'createdAt' || col === 'total' ? 'desc' : 'asc');
    }
    this.auditCurrentPage.set(1);
  }

  goToAuditPage(page: number): void {
    if (page >= 1 && page <= this.auditTotalPages()) {
      this.auditCurrentPage.set(page);
    }
  }

  onAuditSearchChange(term: string): void {
    this.auditSearchQuery.set(term);
    this.auditCurrentPage.set(1);
  }

  setAuditStatus(status: string): void {
    this.auditStatusFilter.set(status);
    this.auditCurrentPage.set(1);
  }

  setAuditRestaurantFilter(restaurant: string): void {
    this.auditRestaurantFilter.set(restaurant);
    this.auditCurrentPage.set(1);
  }

  setAuditSourceFilter(source: string): void {
    this.auditSourceFilter.set(source);
    this.auditCurrentPage.set(1);
  }

  setAuditPaymentFilter(payment: string): void {
    this.auditPaymentFilter.set(payment);
    this.auditCurrentPage.set(1);
  }

  resetAuditFilters(): void {
    this.auditSearchQuery.set('');
    this.auditStatusFilter.set('ALL');
    this.auditRestaurantFilter.set('ALL');
    this.auditSourceFilter.set('ALL');
    this.auditPaymentFilter.set('ALL');
    this.auditSortColumn.set('createdAt');
    this.auditSortDirection.set('desc');
    this.auditCurrentPage.set(1);
  }

  openAuditDetailModal(order: Order): void {
    this.selectedAuditOrder.set(order);
    this.isAuditDetailModalOpen.set(true);
  }

  closeAuditDetailModal(): void {
    this.selectedAuditOrder.set(null);
    this.isAuditDetailModalOpen.set(false);
  }

  getUserDisplayName(userId?: string): string {
    if (!userId) return 'Sistema / No asignado';
    const user = this.state.users().find((u) => u.id === userId);
    return user?.displayName || user?.email || userId;
  }

  auditStatusLabel(status: OrderStatus): string {
    switch (status) {
      case 'COBRADO': return 'Cobrado';
      case 'ENTREGADO': return 'Entregado';
      case 'LISTO': return 'Listo';
      case 'EN_PROCESO': return 'En Preparación';
      case 'PENDIENTE': return 'Pendiente';
      case 'ANULADO': return 'Anulado';
      default: return status;
    }
  }

  auditStatusBadgeStyle(status: OrderStatus): { bg: string; color: string; border: string } {
    switch (status) {
      case 'COBRADO':
        return { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' };
      case 'ENTREGADO':
        return { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' };
      case 'LISTO':
        return { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' };
      case 'EN_PROCESO':
        return { bg: '#fffbeb', color: '#b45309', border: '#fde68a' };
      case 'PENDIENTE':
        return { bg: '#f8fafc', color: '#475569', border: '#cbd5e1' };
      case 'ANULADO':
        return { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' };
      default:
        return { bg: '#f1f5f9', color: '#334155', border: '#e2e8f0' };
    }
  }

  orderRestaurants(order: Order): RestaurantId[] {
    return [...new Set(order.items.map((i) => i.restaurantId))];
  }

  appBcvRate(): number {
    return this.state.appSettings().bcvRate || 1;
  }
}

