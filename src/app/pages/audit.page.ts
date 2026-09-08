import { CommonModule, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppStateService } from '../core/app-state.service';
import { Order, OrderStatus, RestaurantId } from '../core/models';
import { formatTableNumberLabel } from '../core/table-layouts';

@Component({
  selector: 'app-audit-page',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  template: `
    <section class="page audit-page">
      @if (!canAccessAuditoria()) {
        <article class="panel">
          <h2>Acceso restringido</h2>
          <p>Tu perfil no tiene permisos para ver Auditoría de Comandas.</p>
        </article>
      } @else {
        <div class="audit-surface">
          <!-- CABECERA PRINCIPAL -->
          <header class="page-header audit-hero">
            <div class="audit-hero-titles">
              <div class="hero-icon-wrap">
                <i class="bi bi-shield-check" aria-hidden="true"></i>
              </div>
              <div>
                <h1>Auditoría de Comandas</h1>
                <p class="hero-subtitle">Panel general de supervisión, ciclo de vida, trazabilidad y control operativo</p>
              </div>
            </div>

            <div class="audit-actions-row">
              <button type="button" class="btn-action-refresh" (click)="retryLoad()" [disabled]="isDataLoading()">
                <i class="bi bi-arrow-clockwise" [class.spin-icon]="isDataLoading()" aria-hidden="true"></i>
                <span>{{ isDataLoading() ? 'Actualizando...' : 'Actualizar Datos' }}</span>
              </button>
            </div>
          </header>

          <!-- PANEL PRINCIPAL DE AUDITORIA -->
          <article class="panel audit-main-panel">
            <!-- Métricas Rápidas KPI -->
            <div class="audit-kpi-strip">
              <div class="kpi-card">
                <span class="kpi-tag">TOTAL COMANDAS</span>
                <strong class="kpi-number">{{ auditCounts().total }}</strong>
                <small class="kpi-hint">Registradas en sistema</small>
              </div>
              <div class="kpi-card card-cobrado">
                <span class="kpi-tag">COBRADAS</span>
                <strong class="kpi-number">{{ auditCounts().cobradas }}</strong>
                <small class="kpi-hint">Facturadas y cerradas</small>
              </div>
              <div class="kpi-card card-proceso">
                <span class="kpi-tag">EN PREPARACIÓN</span>
                <strong class="kpi-number">{{ auditCounts().enProceso }}</strong>
                <small class="kpi-hint">Cocina / Grill / Barra</small>
              </div>
              <div class="kpi-card card-pendiente">
                <span class="kpi-tag">PENDIENTES</span>
                <strong class="kpi-number">{{ auditCounts().pendientes }}</strong>
                <small class="kpi-hint">Por ingresar a cocina</small>
              </div>
              <div class="kpi-card card-anulado">
                <span class="kpi-tag">ANULADAS</span>
                <strong class="kpi-number">{{ auditCounts().anuladas }}</strong>
                <small class="kpi-hint">Canceladas con motivo</small>
              </div>
              <div class="kpi-card card-total">
                <span class="kpi-tag">TOTAL AUDITADO</span>
                <strong class="kpi-number">\${{ auditCounts().totalMonto | number:'1.2-2' }}</strong>
                <small class="kpi-hint">Ventas consolidadas</small>
              </div>
            </div>

            <!-- Selector de Rango de Fechas -->
            <div class="audit-date-bar">
              <div class="date-presets-group">
                <span class="date-bar-label"><i class="bi bi-calendar3" aria-hidden="true"></i> Periodo:</span>
                <button
                  type="button"
                  class="date-preset-chip"
                  [class.active]="auditDatePreset() === 'ALL'"
                  (click)="setDatePreset('ALL')"
                >
                  Todas las fechas
                </button>
                <button
                  type="button"
                  class="date-preset-chip"
                  [class.active]="auditDatePreset() === 'HOY'"
                  (click)="setDatePreset('HOY')"
                >
                  Hoy
                </button>
                <button
                  type="button"
                  class="date-preset-chip"
                  [class.active]="auditDatePreset() === 'AYER'"
                  (click)="setDatePreset('AYER')"
                >
                  Ayer
                </button>
                <button
                  type="button"
                  class="date-preset-chip"
                  [class.active]="auditDatePreset() === 'SEMANA'"
                  (click)="setDatePreset('SEMANA')"
                >
                  Últimos 7 días
                </button>
                <button
                  type="button"
                  class="date-preset-chip"
                  [class.active]="auditDatePreset() === 'MES'"
                  (click)="setDatePreset('MES')"
                >
                  Este Mes
                </button>
              </div>

              <div class="date-inputs-group">
                <label class="date-input-box">
                  <span>Desde:</span>
                  <input
                    type="date"
                    [ngModel]="auditDateFrom()"
                    (ngModelChange)="onDateFromChange($event)"
                  />
                </label>
                <label class="date-input-box">
                  <span>Hasta:</span>
                  <input
                    type="date"
                    [ngModel]="auditDateTo()"
                    (ngModelChange)="onDateToChange($event)"
                  />
                </label>
                @if (auditDateFrom() || auditDateTo()) {
                  <button
                    type="button"
                    class="btn-reset-dates"
                    (click)="setDatePreset('ALL')"
                    title="Ver historial completo sin filtro de fecha"
                  >
                    <i class="bi bi-x-circle-fill" aria-hidden="true"></i> Quitar fecha
                  </button>
                }
              </div>
            </div>

            <!-- Barra Superior de Controles y Búsqueda -->
            <div class="audit-toolbar">
              <div class="audit-search-container">
                <i class="bi bi-search search-icon" aria-hidden="true"></i>
                <input
                  type="text"
                  [ngModel]="auditSearchQuery()"
                  (ngModelChange)="onAuditSearchChange($event)"
                  placeholder="Buscar por # comanda, cliente, CI, mesa, producto, mesonero, referencia..."
                  class="search-input"
                />
                @if (auditSearchQuery()) {
                  <button type="button" class="btn-clear-search" (click)="onAuditSearchChange('')" title="Borrar búsqueda">
                    <i class="bi bi-x-circle-fill" aria-hidden="true"></i>
                  </button>
                }
              </div>

              <div class="audit-dropdown-filters">
                <!-- Selector de Local -->
                <label class="filter-field">
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

                <!-- Selector de Origen / Canal -->
                <label class="filter-field">
                  <span>Origen</span>
                  <select [ngModel]="auditSourceFilter()" (ngModelChange)="setAuditSourceFilter($event)">
                    <option value="ALL">Todos los orígenes</option>
                    <option value="MESONERO">Mesonero</option>
                    <option value="QR">Código QR</option>
                  </select>
                </label>

                <!-- Selector de Método de Pago -->
                <label class="filter-field">
                  <span>Método de Pago</span>
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
            <div class="audit-status-strip">
              <span class="strip-label"><i class="bi bi-funnel-fill" aria-hidden="true"></i> Clasificar por Estado:</span>
              <div class="status-chips-wrap">
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
            </div>

            <!-- Tabla de Auditoría Ordenable -->
            @if (isDataLoading() && !allAuditOrders().length) {
              <div class="state-card">
                <span class="state-spinner" aria-hidden="true"></span>
                <strong>Cargando registro de auditoría de comandas...</strong>
              </div>
            } @else if (dataError() && !allAuditOrders().length) {
              <div class="state-card">
                <strong>{{ dataError() }}</strong>
                <div class="state-actions-row">
                  <button type="button" class="btn-ghost state-retry-btn" (click)="retryLoad()">
                    <i class="bi bi-arrow-clockwise" aria-hidden="true"></i> Reintentar
                  </button>
                  <button type="button" class="btn-ghost state-cancel-btn" (click)="cancelLoad()">
                    <i class="bi bi-x-circle" aria-hidden="true"></i> Cancelar
                  </button>
                </div>
              </div>
            } @else if (sortedAuditOrders().length) {
              <div class="audit-table-wrap">
                <table class="audit-table">
                  <thead>
                    <tr>
                      <th (click)="toggleAuditSort('id')" class="sortable-header" title="Ordenar por # Comanda">
                        <div class="th-flex">
                          <span># Comanda</span>
                          <i [class]="auditSortColumn() === 'id' ? (auditSortDirection() === 'asc' ? 'bi bi-sort-up' : 'bi bi-sort-down') : 'bi bi-arrow-down-up'" aria-hidden="true"></i>
                        </div>
                      </th>
                      <th (click)="toggleAuditSort('createdAt')" class="sortable-header" title="Ordenar por Fecha y Hora">
                        <div class="th-flex">
                          <span>Fecha y Hora</span>
                          <i [class]="auditSortColumn() === 'createdAt' ? (auditSortDirection() === 'asc' ? 'bi bi-sort-up' : 'bi bi-sort-down') : 'bi bi-arrow-down-up'" aria-hidden="true"></i>
                        </div>
                      </th>
                      <th (click)="toggleAuditSort('table')" class="sortable-header" title="Ordenar por Mesa">
                        <div class="th-flex">
                          <span>Mesa</span>
                          <i [class]="auditSortColumn() === 'table' ? (auditSortDirection() === 'asc' ? 'bi bi-sort-up' : 'bi bi-sort-down') : 'bi bi-arrow-down-up'" aria-hidden="true"></i>
                        </div>
                      </th>
                      <th (click)="toggleAuditSort('client')" class="sortable-header" title="Ordenar por Cliente">
                        <div class="th-flex">
                          <span>Cliente</span>
                          <i [class]="auditSortColumn() === 'client' ? (auditSortDirection() === 'asc' ? 'bi bi-sort-up' : 'bi bi-sort-down') : 'bi bi-arrow-down-up'" aria-hidden="true"></i>
                        </div>
                      </th>
                      <th>Local(es)</th>
                      <th>Origen / Creador</th>
                      <th (click)="toggleAuditSort('status')" class="sortable-header" title="Ordenar por Estado">
                        <div class="th-flex">
                          <span>Estado</span>
                          <i [class]="auditSortColumn() === 'status' ? (auditSortDirection() === 'asc' ? 'bi bi-sort-up' : 'bi bi-sort-down') : 'bi bi-arrow-down-up'" aria-hidden="true"></i>
                        </div>
                      </th>
                      <th (click)="toggleAuditSort('total')" class="sortable-header text-right" title="Ordenar por Total">
                        <div class="th-flex text-right">
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
                          <span class="order-id-badge">{{ order.id }}</span>
                        </td>
                        <td class="date-cell">
                          <strong>{{ order.createdAt | date:'dd/MM/yyyy' }}</strong>
                          <small>{{ order.createdAt | date:'hh:mm a' }}</small>
                        </td>
                        <td>
                          <span class="table-badge">Mesa {{ tableLabel(order) }}</span>
                        </td>
                        <td>
                          <div class="client-cell">
                            <strong>{{ order.clientName || 'Sin nombre' }}</strong>
                            @if (order.clientDocumentId) {
                              <small>CI: {{ order.clientDocumentId }}</small>
                            }
                          </div>
                        </td>
                        <td>
                          <div class="locals-tags">
                            @for (local of orderRestaurants(order); track local) {
                              <span class="local-tag">{{ localLabel(local) }}</span>
                            }
                          </div>
                        </td>
                        <td>
                          <div class="creator-cell">
                            <span class="source-tag" [class.source-qr]="order.source === 'QR'">
                              <i [class]="order.source === 'QR' ? 'bi bi-qr-code' : 'bi bi-person-badge'" aria-hidden="true"></i>
                              {{ order.source === 'QR' ? 'QR' : 'Mesonero' }}
                            </span>
                            <small>{{ getUserDisplayName(order.createdByUserId) }}</small>
                          </div>
                        </td>
                        <td>
                          <span class="status-badge" [style.background]="auditStatusBadgeStyle(order.status).bg" [style.color]="auditStatusBadgeStyle(order.status).color" [style.border-color]="auditStatusBadgeStyle(order.status).border">
                            {{ auditStatusLabel(order.status) }}
                          </span>
                        </td>
                        <td class="text-right total-cell">
                          <strong>\${{ auditOrderTotal(order) | number:'1.2-2' }}</strong>
                          <small>{{ order.items.length }} {{ order.items.length === 1 ? 'item' : 'items' }}</small>
                        </td>
                        <td class="text-right actions-cell" (click)="$event.stopPropagation()">
                          <div class="row-actions">
                            <button
                              type="button"
                              class="btn-audit"
                              (click)="openAuditDetailModal(order)"
                              title="Ver trazabilidad completa"
                            >
                              <i class="bi bi-eye-fill" aria-hidden="true"></i> Auditar
                            </button>
                            @if (order.status === 'COBRADO') {
                              <button
                                type="button"
                                class="btn-reprint"
                                (click)="printSingleOrderTicket(order.id)"
                                title="Reimprimir comprobante de caja"
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

              <!-- Paginación Estricta a 10 Elementos -->
              <div class="audit-pagination-footer">
                <span class="page-count-text">
                  Mostrando comandas <strong>{{ (auditCurrentPage() - 1) * auditPageSize() + 1 }}</strong> a <strong>{{ (auditCurrentPage() * auditPageSize() > sortedAuditOrders().length ? sortedAuditOrders().length : auditCurrentPage() * auditPageSize()) }}</strong> de <strong>{{ sortedAuditOrders().length }}</strong> encontradas
                </span>
                <div class="pagination-buttons">
                  <button
                    type="button"
                    class="btn-page-nav"
                    [disabled]="auditCurrentPage() <= 1"
                    (click)="goToAuditPage(auditCurrentPage() - 1)"
                  >
                    <i class="bi bi-chevron-left" aria-hidden="true"></i> Anterior
                  </button>
                  <span class="page-indicator">
                    Página <strong>{{ auditCurrentPage() }}</strong> de <strong>{{ auditTotalPages() }}</strong>
                  </span>
                  <button
                    type="button"
                    class="btn-page-nav"
                    [disabled]="auditCurrentPage() >= auditTotalPages()"
                    (click)="goToAuditPage(auditCurrentPage() + 1)"
                  >
                    Siguiente <i class="bi bi-chevron-right" aria-hidden="true"></i>
                  </button>
                </div>
              </div>
            } @else {
              <div class="empty-audit-state">
                <i class="bi bi-inbox" aria-hidden="true"></i>
                <h3>No se encontraron comandas</h3>
                <p>No hay resultados que coincidan con la búsqueda o los filtros aplicados.</p>
                <button type="button" class="btn-reset-filters" (click)="resetAuditFilters()">
                  <i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i> Restablecer filtros
                </button>
              </div>
            }
          </article>
        </div>
      }

      <!-- MODAL DE DETALLE Y TRAZABILIDAD DE AUDITORIA -->
      @if (isAuditDetailModalOpen() && selectedAuditOrder(); as order) {
        <div class="overlay" (click)="closeAuditDetailModal()">
          <article class="modal audit-modal" (click)="$event.stopPropagation()">
            <div class="modal-head">
              <div class="modal-head-titles">
                <span class="badge-auditoria">AUDITORÍA</span>
                <div>
                  <h2>Comanda {{ order.id }}</h2>
                  <small>Mesa {{ tableLabel(order) }} · Creada el {{ order.createdAt | date:'dd/MM/yyyy hh:mm:ss a' }}</small>
                </div>
              </div>
              <button type="button" class="btn-ghost" (click)="closeAuditDetailModal()" aria-label="Cerrar modal">
                <i class="bi bi-x-lg" aria-hidden="true"></i>
              </button>
            </div>

            <div class="audit-modal-body">
              <!-- Resumen de Ciclo y Estado -->
              <div class="audit-summary-box" [style.background]="auditStatusBadgeStyle(order.status).bg" [style.border-color]="auditStatusBadgeStyle(order.status).border">
                <div class="summary-box-top">
                  <div class="status-wrap">
                    <span class="status-badge" [style.background]="auditStatusBadgeStyle(order.status).bg" [style.color]="auditStatusBadgeStyle(order.status).color" [style.border-color]="auditStatusBadgeStyle(order.status).border" style="font-size: 0.88rem; padding: 0.35rem 0.85rem;">
                      {{ auditStatusLabel(order.status) }}
                    </span>
                    <strong style="color: #1e293b;">Ciclo y Trazabilidad de la Orden</strong>
                  </div>
                  <span class="summary-total-val">
                    Total: \${{ auditOrderTotal(order) | number:'1.2-2' }}
                  </span>
                </div>

                <div class="audit-meta-grid">
                  <div class="meta-item">
                    <span class="meta-label">Cliente:</span>
                    <strong class="meta-value">{{ order.clientName || 'Sin registrar' }}</strong>
                  </div>
                  <div class="meta-item">
                    <span class="meta-label">Cédula / Documento:</span>
                    <strong class="meta-value">{{ order.clientDocumentId || 'N/A' }}</strong>
                  </div>
                  <div class="meta-item">
                    <span class="meta-label">Canal de Ingreso:</span>
                    <strong class="meta-value">{{ order.source === 'QR' ? 'Autoservicio QR' : 'Mesonero' }}</strong>
                  </div>
                  <div class="meta-item">
                    <span class="meta-label">Registrada por:</span>
                    <strong class="meta-value">{{ getUserDisplayName(order.createdByUserId) }}</strong>
                  </div>
                  <div class="meta-item">
                    <span class="meta-label">Hora de Apertura:</span>
                    <strong class="meta-value">{{ order.createdAt | date:'short' }}</strong>
                  </div>
                  @if (order.closedAt) {
                    <div class="meta-item">
                      <span class="meta-label">Hora de Cobro / Cierre:</span>
                      <strong class="meta-value">{{ order.closedAt | date:'short' }}</strong>
                    </div>
                  }
                  @if (order.cancelledAt) {
                    <div class="meta-item" style="grid-column: span 2;">
                      <span class="meta-label" style="color: #b91c1c;">Hora de Anulación:</span>
                      <strong class="meta-value" style="color: #b91c1c;">{{ order.cancelledAt | date:'short' }} (Por: {{ getUserDisplayName(order.cancelledByUserId) }})</strong>
                    </div>
                  }
                </div>
              </div>

              <!-- Registro de Pago y Facturación -->
              @if (order.paymentMethod || order.closedAt) {
                <div class="audit-payment-box">
                  <h4><i class="bi bi-credit-card-2-front-fill" style="color: #2563eb;" aria-hidden="true"></i> Registro de Pago y Facturación</h4>
                  <div class="audit-meta-grid">
                    <div class="meta-item">
                      <span class="meta-label">Método:</span>
                      <strong class="meta-value">{{ order.paymentMethod || 'No especificado' }}</strong>
                    </div>
                    <div class="meta-item">
                      <span class="meta-label">Referencia:</span>
                      <strong class="meta-value">{{ order.paymentReference || 'Sin referencia' }}</strong>
                    </div>
                    <div class="meta-item">
                      <span class="meta-label">Monto USD:</span>
                      <strong class="meta-value">\${{ (order.paymentAmountUsd || auditOrderTotal(order)) | number:'1.2-2' }}</strong>
                    </div>
                    <div class="meta-item">
                      <span class="meta-label">Monto Bs:</span>
                      <strong class="meta-value">{{ (order.paymentAmountBs || (auditOrderTotal(order) * appBcvRate())) | number:'1.2-2' }} Bs.</strong>
                    </div>
                    @if (order.paymentVerificationStatus) {
                      <div class="meta-item">
                        <span class="meta-label">Verificación de Pago:</span>
                        <strong class="meta-value">{{ order.paymentVerificationStatus }}</strong>
                      </div>
                    }
                  </div>
                </div>
              }

              <!-- Tabla de Items y Trazabilidad de Preparación -->
              <h4 style="margin: 1rem 0 0.4rem; font-size: 0.95rem; color: #1e293b; font-weight: 800;">
                <i class="bi bi-receipt" aria-hidden="true"></i> Desglose de Productos Auditados ({{ order.items.length }})
              </h4>
              <div class="subtable-container">
                <table class="audit-modal-subtable">
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
                            <small class="item-note"><i class="bi bi-chat-left-text" aria-hidden="true"></i> {{ item.note }}</small>
                          }
                        </td>
                        <td>
                          <span class="area-badge">{{ item.area }}</span>
                        </td>
                        <td>
                          <span class="local-tag">{{ localLabel(item.restaurantId) }}</span>
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

            <div class="modal-foot">
              <button type="button" class="btn-ghost" (click)="closeAuditDetailModal()">
                Cerrar Auditoría
              </button>
              <button
                type="button"
                class="btn-action-primary"
                (click)="printSingleOrderTicket(order.id)"
              >
                <i class="bi bi-printer-fill" aria-hidden="true"></i> Reimprimir Factura / Comprobante
              </button>
            </div>
          </article>
        </div>
      }
    </section>
  `,
  styles: `
    .audit-page {
      font-family: 'Montserrat', 'Sora', sans-serif;
      color: #171717;
    }

    .audit-surface {
      display: grid;
      gap: 1.25rem;
      padding: 1rem 1.1rem 1.5rem;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 1.5rem;
    }

    .audit-hero {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 1rem;
    }

    .audit-hero-titles {
      display: flex;
      align-items: center;
      gap: 0.85rem;
    }

    .hero-icon-wrap {
      width: 50px;
      height: 50px;
      border-radius: 0.9rem;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      color: #38bdf8;
      display: grid;
      place-items: center;
      font-size: 1.65rem;
      flex-shrink: 0;
      box-shadow: 0 8px 16px rgba(15, 23, 42, 0.15);
    }

    .page-header h1 {
      margin: 0;
      color: #0f172a;
      font-size: clamp(1.8rem, 3.5vw, 2.4rem);
      font-weight: 900;
      letter-spacing: -0.03em;
      line-height: 1.1;
    }

    .hero-subtitle {
      margin: 0.25rem 0 0;
      color: #64748b;
      font-size: 0.92rem;
      font-weight: 600;
    }

    .btn-action-refresh {
      min-height: 42px;
      padding: 0.5rem 1.2rem;
      border-radius: 0.75rem;
      border: 1px solid #cbd5e1;
      background: #ffffff;
      color: #0f172a;
      font-weight: 800;
      font-size: 0.86rem;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
      transition: all 0.15s ease;
    }
    .btn-action-refresh:hover:not(:disabled) {
      background: #0f172a;
      color: #ffffff;
      border-color: #0f172a;
    }

    .spin-icon {
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .audit-main-panel {
      background: #ffffff;
      border-radius: 1.25rem;
      border: 1px solid #e2e8f0;
      box-shadow: 0 4px 20px rgba(15, 23, 42, 0.05);
      padding: 1.35rem;
      display: grid;
      gap: 1.25rem;
    }

    /* KPI STRIP */
    .audit-kpi-strip {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 0.75rem;
    }

    .kpi-card {
      display: flex;
      flex-direction: column;
      padding: 0.75rem 0.95rem;
      border-radius: 0.85rem;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.02);
    }

    .kpi-tag {
      font-size: 0.68rem;
      font-weight: 800;
      color: #64748b;
      letter-spacing: 0.04em;
    }

    .kpi-number {
      font-size: 1.45rem;
      font-weight: 900;
      color: #0f172a;
      margin: 0.2rem 0;
      line-height: 1;
    }

    .kpi-hint {
      font-size: 0.72rem;
      color: #94a3b8;
      font-weight: 600;
    }

    .kpi-card.card-cobrado { background: #ecfdf5; border-color: #a7f3d0; }
    .kpi-card.card-cobrado .kpi-number { color: #047857; }

    .kpi-card.card-proceso { background: #fffbeb; border-color: #fde68a; }
    .kpi-card.card-proceso .kpi-number { color: #b45309; }

    .kpi-card.card-pendiente { background: #f1f5f9; border-color: #cbd5e1; }
    .kpi-card.card-pendiente .kpi-number { color: #475569; }

    .kpi-card.card-anulado { background: #fef2f2; border-color: #fecaca; }
    .kpi-card.card-anulado .kpi-number { color: #b91c1c; }

    .kpi-card.card-total { background: #f0fdf4; border-color: #86efac; }
    .kpi-card.card-total .kpi-number { color: #15803d; }

    /* DATE RANGE BAR */
    .audit-date-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.85rem;
      padding: 0.85rem 1rem;
      background: #ffffff;
      border-radius: 0.95rem;
      border: 1px solid #e2e8f0;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.02);
    }

    .date-presets-group {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      flex-wrap: wrap;
    }

    .date-bar-label {
      font-size: 0.8rem;
      font-weight: 800;
      color: #475569;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      margin-right: 0.25rem;
    }

    .date-preset-chip {
      padding: 0.35rem 0.75rem;
      border-radius: 0.55rem;
      border: 1px solid #cbd5e1;
      background: #f8fafc;
      color: #475569;
      font-size: 0.78rem;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      transition: all 0.15s ease;
    }
    .date-preset-chip:hover {
      background: #f1f5f9;
      border-color: #94a3b8;
    }
    .date-preset-chip.active {
      background: #0f172a;
      color: #ffffff;
      border-color: #0f172a;
      box-shadow: 0 2px 6px rgba(15, 23, 42, 0.18);
    }

    .date-inputs-group {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      flex-wrap: wrap;
    }

    .date-input-box {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.8rem;
      font-weight: 700;
      color: #475569;
    }

    .date-input-box input[type="date"] {
      height: 36px;
      padding: 0 0.55rem;
      border-radius: 0.55rem;
      border: 1px solid #cbd5e1;
      background: #ffffff;
      color: #1e293b;
      font-size: 0.82rem;
      font-weight: 600;
      outline: none;
      transition: border-color 0.15s ease;
    }
    .date-input-box input[type="date"]:focus {
      border-color: #2563eb;
    }

    .btn-reset-dates {
      height: 36px;
      padding: 0 0.65rem;
      border-radius: 0.55rem;
      border: 1px solid #fecaca;
      background: #fef2f2;
      color: #dc2626;
      font-size: 0.78rem;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      transition: all 0.15s ease;
    }
    .btn-reset-dates:hover {
      background: #fee2e2;
      border-color: #f87171;
    }

    /* TOOLBAR */
    .audit-toolbar {
      display: grid;
      grid-template-columns: 1.6fr 2.4fr;
      gap: 0.85rem;
      align-items: center;
    }

    @media (max-width: 900px) {
      .audit-toolbar {
        grid-template-columns: 1fr;
      }
    }

    .audit-search-container {
      position: relative;
      display: flex;
      align-items: center;
    }

    .audit-search-container .search-icon {
      position: absolute;
      left: 0.9rem;
      color: #94a3b8;
      font-size: 0.95rem;
      pointer-events: none;
    }

    .search-input {
      width: 100%;
      height: 44px;
      padding: 0 2.2rem 0 2.5rem;
      border-radius: 0.75rem;
      border: 1.5px solid #cbd5e1;
      font-size: 0.9rem;
      color: #0f172a;
      background: #ffffff;
      outline: none;
      transition: all 0.15s ease;
    }
    .search-input:focus {
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
    }

    .btn-clear-search {
      position: absolute;
      right: 0.8rem;
      background: none;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      font-size: 1rem;
      padding: 0;
      display: grid;
      place-items: center;
    }
    .btn-clear-search:hover { color: #475569; }

    .audit-dropdown-filters {
      display: flex;
      flex-wrap: wrap;
      gap: 0.65rem;
      align-items: center;
    }

    .filter-field {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.82rem;
      font-weight: 700;
      color: #475569;
      flex: 1 1 auto;
      min-width: 140px;
    }

    .filter-field select {
      flex: 1;
      height: 42px;
      border-radius: 0.65rem;
      border: 1px solid #cbd5e1;
      background: #ffffff;
      padding: 0 0.6rem;
      font-size: 0.84rem;
      color: #0f172a;
      font-weight: 600;
      outline: none;
    }
    .filter-field select:focus {
      border-color: #2563eb;
    }

    /* STATUS CHIPS */
    .audit-status-strip {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      flex-wrap: wrap;
      padding: 0.65rem 0.95rem;
      background: #f8fafc;
      border-radius: 0.85rem;
      border: 1px solid #e2e8f0;
    }

    .strip-label {
      font-size: 0.82rem;
      font-weight: 800;
      color: #475569;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }

    .status-chips-wrap {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      flex-wrap: wrap;
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
    .status-chip.chip-cobrado.active { background: #059669; border-color: #059669; }
    .status-chip.chip-entregado.active { background: #2563eb; border-color: #2563eb; }
    .status-chip.chip-proceso.active { background: #d97706; border-color: #d97706; }
    .status-chip.chip-pendiente.active { background: #475569; border-color: #475569; }
    .status-chip.chip-anulado.active { background: #dc2626; border-color: #dc2626; }

    /* TABLE */
    .audit-table-wrap {
      overflow-x: auto;
      border: 1px solid #e2e8f0;
      border-radius: 0.85rem;
      background: #ffffff;
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

    .sortable-header {
      cursor: pointer;
      transition: background 0.15s ease;
    }
    .sortable-header:hover {
      background: #f1f5f9;
      color: #0f172a;
    }

    .th-flex {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
    }
    .th-flex i {
      font-size: 0.85rem;
      color: #94a3b8;
    }
    .sortable-header:hover .th-flex i {
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

    .order-id-badge {
      font-family: monospace;
      font-weight: 800;
      font-size: 0.88rem;
      color: #0f172a;
      background: #f1f5f9;
      padding: 0.2rem 0.45rem;
      border-radius: 0.4rem;
      border: 1px solid #e2e8f0;
    }

    .date-cell {
      display: flex;
      flex-direction: column;
      line-height: 1.2;
    }
    .date-cell strong { font-size: 0.82rem; color: #0f172a; }
    .date-cell small { font-size: 0.74rem; color: #64748b; }

    .table-badge {
      font-weight: 800;
      font-size: 0.82rem;
      color: #334155;
      background: #f1f5f9;
      padding: 0.2rem 0.5rem;
      border-radius: 0.45rem;
      border: 1px solid #cbd5e1;
      white-space: nowrap;
    }

    .client-cell {
      display: flex;
      flex-direction: column;
      line-height: 1.25;
    }
    .client-cell strong { color: #0f172a; font-size: 0.86rem; }
    .client-cell small { color: #64748b; font-size: 0.74rem; }

    .locals-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
    }

    .local-tag {
      font-size: 0.72rem;
      font-weight: 800;
      padding: 0.15rem 0.45rem;
      border-radius: 0.35rem;
      background: #f0fdf4;
      color: #166534;
      border: 1px solid #bbf7d0;
      white-space: nowrap;
    }

    .creator-cell {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
      line-height: 1.2;
    }
    .creator-cell small { font-size: 0.74rem; color: #64748b; }

    .source-tag {
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
    .source-tag.source-qr {
      background: #fdf4ff;
      color: #86198f;
      border-color: #f5d0fe;
    }

    .status-badge {
      display: inline-block;
      font-size: 0.75rem;
      font-weight: 800;
      padding: 0.25rem 0.6rem;
      border-radius: 0.5rem;
      border: 1px solid transparent;
      white-space: nowrap;
    }

    .total-cell {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      line-height: 1.2;
    }
    .total-cell strong { font-size: 0.95rem; color: #059669; font-weight: 900; }
    .total-cell small { font-size: 0.72rem; color: #64748b; }

    .row-actions {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }

    .btn-audit {
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
    .btn-audit:hover {
      background: #0f172a;
      color: #ffffff;
      border-color: #0f172a;
    }

    .btn-reprint {
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
    .btn-reprint:hover {
      background: #2563eb;
      color: #ffffff;
    }

    /* PAGINATION */
    .audit-pagination-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.75rem;
      padding-top: 0.85rem;
      border-top: 1px solid #f1f5f9;
    }

    .page-count-text { color: #64748b; font-size: 0.84rem; }

    .pagination-buttons {
      display: flex;
      align-items: center;
      gap: 0.45rem;
    }

    .btn-page-nav {
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
    .btn-page-nav:hover:not(:disabled) {
      background: #f1f5f9;
      border-color: #94a3b8;
    }
    .btn-page-nav:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    .page-indicator {
      font-size: 0.84rem;
      color: #475569;
      padding: 0 0.4rem;
    }

    /* EMPTY STATE */
    .empty-audit-state {
      padding: 3rem 1.5rem;
      text-align: center;
      background: #f8fafc;
      border-radius: 0.85rem;
      border: 1px dashed #cbd5e1;
    }
    .empty-audit-state i {
      font-size: 2.5rem;
      color: #94a3b8;
      display: block;
      margin-bottom: 0.5rem;
    }
    .empty-audit-state h3 {
      margin: 0;
      color: #0f172a;
      font-size: 1.15rem;
      font-weight: 800;
    }
    .empty-audit-state p {
      margin: 0.35rem 0 0.65rem;
      color: #64748b;
      font-size: 0.86rem;
    }

    .btn-reset-filters {
      padding: 0.45rem 0.9rem;
      border-radius: 0.55rem;
      border: 1px solid #cbd5e1;
      background: #ffffff;
      color: #0f172a;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }
    .btn-reset-filters:hover {
      background: #f1f5f9;
    }

    /* MODAL */
    .audit-modal {
      width: min(860px, 96vw);
      max-height: 92vh;
      overflow-y: auto;
      border-radius: 1.25rem;
      background: #ffffff;
      padding: 1.5rem;
    }

    .modal-head-titles {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .badge-auditoria {
      font-size: 0.72rem;
      font-weight: 900;
      letter-spacing: 0.08em;
      padding: 0.25rem 0.6rem;
      border-radius: 0.45rem;
      background: #0f172a;
      color: #38bdf8;
    }

    .audit-modal-body {
      display: grid;
      gap: 1.15rem;
      margin-top: 1rem;
    }

    .audit-summary-box {
      padding: 1rem 1.15rem;
      border-radius: 0.85rem;
      border: 1px solid #e2e8f0;
      display: grid;
      gap: 0.85rem;
    }

    .summary-box-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    .status-wrap {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .summary-total-val {
      font-weight: 800;
      font-size: 1.15rem;
      color: #059669;
    }

    .audit-meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 0.65rem 1.2rem;
    }

    .meta-item {
      display: flex;
      flex-direction: column;
      line-height: 1.2;
    }
    .meta-label {
      font-size: 0.72rem;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }
    .meta-value {
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
    .audit-payment-box h4 {
      margin: 0 0 0.5rem;
      font-size: 0.9rem;
      color: #334155;
      font-weight: 800;
    }

    .subtable-container {
      max-height: 280px;
      overflow-y: auto;
      border: 1px solid #e2e8f0;
      border-radius: 0.75rem;
    }

    .audit-modal-subtable {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.84rem;
    }
    .audit-modal-subtable thead tr {
      background: #f1f5f9;
      color: #475569;
      font-size: 0.75rem;
      font-weight: 800;
      text-transform: uppercase;
    }
    .audit-modal-subtable th {
      padding: 0.6rem 0.75rem;
      text-align: left;
    }
    .audit-modal-subtable td {
      padding: 0.55rem 0.75rem;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
    }

    .item-note {
      display: block;
      color: #d97706;
      font-size: 0.74rem;
      font-weight: 700;
      margin-top: 0.15rem;
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
    .item-status-pill.item-status-pendiente { background: #f1f5f9; color: #64748b; }
    .item-status-pill.item-status-en_proceso { background: #fffbeb; color: #b45309; }
    .item-status-pill.item-status-listo { background: #f0fdf4; color: #15803d; }
    .item-status-pill.item-status-entregado { background: #eff6ff; color: #1d4ed8; }
    .item-status-pill.item-status-anulado { background: #fef2f2; color: #b91c1c; }

    .modal-foot {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.75rem;
      margin-top: 1.25rem;
      padding-top: 1rem;
      border-top: 1px solid #e2e8f0;
    }

    .btn-action-primary {
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
      color: #fff;
      padding: 0.55rem 1.25rem;
      border-radius: 0.65rem;
      font-weight: 800;
      border: none;
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
    }
    .btn-action-primary:hover {
      filter: brightness(1.08);
    }
  `
})
export class AuditPageComponent {
  private readonly state = inject(AppStateService);

  readonly canAccessAuditoria = computed(() => this.state.canAccessModule('auditoria'));
  readonly localKeys = computed<RestaurantId[]>(() => this.state.allowedRestaurantIds());
  readonly isDataLoading = computed(() => this.state.runtimeDataLoading());
  readonly dataError = computed(() => this.state.runtimeDataError());
  readonly canSelectAllRestaurants = computed(() => this.localKeys().length > 1);

  readonly auditSearchQuery = signal('');
  readonly auditDatePreset = signal<'ALL' | 'HOY' | 'AYER' | 'SEMANA' | 'MES' | 'CUSTOM'>('ALL');
  readonly auditDateFrom = signal<string>('');
  readonly auditDateTo = signal<string>('');
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

  readonly dateFilteredOrders = computed<Order[]>(() => {
    const orders = this.allAuditOrders();
    const fromDate = this.auditDateFrom();
    const toDate = this.auditDateTo();
    if (!fromDate && !toDate) {
      return orders;
    }
    const fromMs = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : 0;
    const toMs = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : Infinity;

    return orders.filter((order) => {
      const orderTime = new Date(order.createdAt).getTime();
      return orderTime >= fromMs && orderTime <= toMs;
    });
  });

  readonly auditCounts = computed(() => {
    const orders = this.dateFilteredOrders();
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
    const orders = this.dateFilteredOrders();
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
        const orderPayment = order.paymentMethod || 'SIN_REGISTRO';
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

  private toDateInputValue(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  setDatePreset(preset: 'ALL' | 'HOY' | 'AYER' | 'SEMANA' | 'MES'): void {
    this.auditDatePreset.set(preset);
    this.auditCurrentPage.set(1);
    const now = new Date();

    if (preset === 'ALL') {
      this.auditDateFrom.set('');
      this.auditDateTo.set('');
    } else if (preset === 'HOY') {
      const todayStr = this.toDateInputValue(now);
      this.auditDateFrom.set(todayStr);
      this.auditDateTo.set(todayStr);
    } else if (preset === 'AYER') {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const yestStr = this.toDateInputValue(yesterday);
      this.auditDateFrom.set(yestStr);
      this.auditDateTo.set(yestStr);
    } else if (preset === 'SEMANA') {
      const weekAgo = new Date(now);
      weekAgo.setDate(now.getDate() - 6);
      this.auditDateFrom.set(this.toDateInputValue(weekAgo));
      this.auditDateTo.set(this.toDateInputValue(now));
    } else if (preset === 'MES') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      this.auditDateFrom.set(this.toDateInputValue(firstDay));
      this.auditDateTo.set(this.toDateInputValue(now));
    }
  }

  onDateFromChange(value: string): void {
    this.auditDateFrom.set(value);
    this.auditDatePreset.set('CUSTOM');
    this.auditCurrentPage.set(1);
  }

  onDateToChange(value: string): void {
    this.auditDateTo.set(value);
    this.auditDatePreset.set('CUSTOM');
    this.auditCurrentPage.set(1);
  }

  resetAuditFilters(): void {
    this.auditSearchQuery.set('');
    this.auditDatePreset.set('ALL');
    this.auditDateFrom.set('');
    this.auditDateTo.set('');
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

  auditOrderTotal(order: Order): number {
    const restaurant = this.auditRestaurantFilter();
    return order.items
      .filter((item) => restaurant === 'ALL' || item.restaurantId === restaurant)
      .reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  }

  tableLabel(order: Order): string {
    return formatTableNumberLabel(order.tableNumber);
  }

  localLabel(local: RestaurantId): string {
    return this.state.restaurants().find((r) => r.id === local)?.name ?? local;
  }

  appBcvRate(): number {
    return this.state.appSettings().bcvRate || 1;
  }

  retryLoad(): void {
    void this.state.retryRuntimeDataLoad();
  }

  cancelLoad(): void {
    this.state.clearRuntimeDataError();
  }

  printSingleOrderTicket(orderId: string): void {
    const order = this.state.orders().find((o) => o.id === orderId);
    if (!order) {
      return;
    }

    const bcv = this.state.appSettings().bcvRate || 1;
    const itemsHtml = order.items
      .map(
        (item) => `
        <tr>
          <td style="padding: 2px 0;">${item.quantity}x ${item.productName}</td>
          <td style="text-align: right; padding: 2px 0;">$${(item.quantity * item.unitPrice).toFixed(2)}</td>
        </tr>
      `
      )
      .join('');

    const nonCancelledItems = order.items.filter((i) => i.status !== 'ANULADO');
    const subtotal = nonCancelledItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const totalUsd = order.paymentAmountUsd || this.auditOrderTotal(order);
    const totalBs = order.paymentAmountBs || totalUsd * bcv;

    this.state.queueConsumptionPrintJob({
      restaurantIds: [...new Set(order.items.map((i) => i.restaurantId))],
      localLabels: [...new Set(order.items.map((i) => this.localLabel(i.restaurantId)))],
      tableLabels: [this.tableLabel(order)],
      orderIds: [order.id],
      clientName: order.clientName,
      clientDocumentId: order.clientDocumentId ?? '',
      items: nonCancelledItems.map((i) => ({
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
      paymentReference: order.paymentReference ?? '',
      isReprint: true
    });

    const ticketWindow = window.open('', '_blank', 'width=320,height=600');
    if (!ticketWindow) {
      return;
    }

    ticketWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Factura ${order.id}</title>
          <style>
            @page { size: 80mm auto; margin: 0; }
            body { font-family: 'Courier New', monospace; font-size: 12px; margin: 5mm; color: #000; }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .bold { font-weight: bold; }
            .divider { border-top: 1px dashed #000; margin: 6px 0; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
          </style>
        </head>
        <body>
          <div class="text-center bold" style="font-size: 14px;">FUDY - PAPA & SON</div>
          <div class="text-center">Comprobante de Caja</div>
          <div class="divider"></div>
          <div><strong>Comanda:</strong> ${order.id}</div>
          <div><strong>Mesa:</strong> ${this.tableLabel(order)}</div>
          <div><strong>Cliente:</strong> ${order.clientName || 'Consumidor Final'}</div>
          <div><strong>Fecha:</strong> ${new Date(order.closedAt || order.createdAt).toLocaleString()}</div>
          ${order.paymentMethod ? `<div><strong>Pago:</strong> ${order.paymentMethod}</div>` : ''}
          ${order.paymentReference ? `<div><strong>Ref:</strong> ${order.paymentReference}</div>` : ''}
          <div class="divider"></div>
          <table>
            <thead>
              <tr style="border-bottom: 1px solid #000;">
                <th style="text-align: left;">Item</th>
                <th style="text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
          <div class="divider"></div>
          <div class="text-right bold" style="font-size: 13px;">TOTAL: $${totalUsd.toFixed(2)}</div>
          <div class="text-right">TOTAL BS: ${totalBs.toFixed(2)} Bs.</div>
          <div class="text-right" style="font-size: 10px;">Tasa BCV: ${bcv.toFixed(2)} Bs/$</div>
          <div class="divider"></div>
          <div class="text-center" style="font-size: 10px; margin-top: 8px;">¡Gracias por su visita!</div>
          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `);
    ticketWindow.document.close();
  }
}
