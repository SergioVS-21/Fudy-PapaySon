import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppStateService } from '../core/app-state.service';
import { Order, OrderItem, OrderSource, PaymentMethod, Product, RestaurantId } from '../core/models';
import {
  NEXT_RESTOBAR_AREA_LAYOUTS,
  NextRestobarAreaId,
  PAPA_AND_SON_AREA_LAYOUTS,
  PapaAndSonAreaId,
  formatTableNumberLabel,
  getNextRestobarAreaForTableNumber,
  getPapaAndSonAreaForTableNumber,
  isPapaAndSonTableNumber,
  isNextRestobarTableNumber
} from '../core/table-layouts';

const PAPA_AND_SON_IVA_RATE = 0.16;

@Component({
  selector: 'app-orders-page',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyPipe, DatePipe],
  template: `
    <section class="page">
      @if (!canAccessComandas()) {
        <article class="panel">
          <h2>Acceso restringido</h2>
          <p>Tu perfil no tiene permisos para ver Comandas.</p>
        </article>
      } @else {

      <header class="page-header orders-page-header">
        <h1 class="orders-title">
          Comandas
        </h1>
        <div class="orders-toolbar">
          <div class="orders-filter-row">
            <button type="button" class="segment-btn" [class.active]="ordersViewMode() === 'ACTIVAS'" (click)="ordersViewMode.set('ACTIVAS')">Activas</button>
            <button type="button" class="segment-btn" [class.active]="ordersViewMode() === 'ENTREGADAS'" (click)="ordersViewMode.set('ENTREGADAS')">Entregadas</button>
          </div>
          <button type="button" class="comanda-cta" (click)="openCreateModal()">
            + Nueva Comanda
          </button>
        </div>
      </header>

      @if (ordersViewMode() === 'ENTREGADAS') {
        <div class="panel history-table-container" style="background: #ffffff; border-radius: 1rem; padding: 1.25rem; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.05); margin-top: 1rem;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; border-bottom: 2px solid #f1f5f9; padding-bottom: 0.75rem;">
            <h2 style="font-size: 1.15rem; font-weight: 900; color: #1e293b; margin: 0; display: flex; align-items: center; gap: 0.5rem;">
              <i class="bi bi-receipt-cutoff" style="color: #059669;" aria-hidden="true"></i>
              Historial de Caja y Comandas Entregadas
            </h2>
            <span style="font-weight: 800; background: #d1fae5; color: #065f46; padding: 0.25rem 0.65rem; border-radius: 0.75rem; font-size: 0.8rem;">
              {{ visibleOrders().length }} comandas
            </span>
          </div>

          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.88rem; text-align: left;">
              <thead>
                <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0; color: #475569; font-weight: 800;">
                  <th style="padding: 0.65rem 0.85rem;"># Comanda</th>
                  <th style="padding: 0.65rem 0.85rem;">Mesa / Cliente</th>
                  <th style="padding: 0.65rem 0.85rem;">Fecha / Hora</th>
                  <th style="padding: 0.65rem 0.85rem;">Productos Pedidos</th>
                  <th style="padding: 0.65rem 0.85rem; text-align: right;">Total ($)</th>
                  <th style="padding: 0.65rem 0.85rem; text-align: center;">Estado</th>
                  <th style="padding: 0.65rem 0.85rem; text-align: right;">Acciones</th>
                </tr>
              </thead>
              <tbody>
                @for (order of visibleOrders(); track order.id) {
                  <tr style="border-bottom: 1px solid #f1f5f9; cursor: pointer;" (click)="openDetail(order.id)">
                    <td style="padding: 0.65rem 0.85rem; font-weight: 800; color: #1e293b;">#{{ order.id }}</td>
                    <td style="padding: 0.65rem 0.85rem; font-weight: 700; color: #334155;">
                      Mesa {{ tableLabel(order) }} <small style="color: #64748b; font-weight: normal;">({{ order.clientName }})</small>
                    </td>
                    <td style="padding: 0.65rem 0.85rem; color: #64748b;">
                      {{ (order.closedAt || order.createdAt) | date:'short' }}
                    </td>
                    <td style="padding: 0.65rem 0.85rem; font-size: 0.82rem; color: #1f2937;">
                      <ul style="list-style: none; margin: 0; padding: 0;">
                        @for (item of order.items; track item.id) {
                          @if (item.status !== 'ANULADO') {
                            <li><strong>{{ item.quantity }}x</strong> {{ item.productName }}</li>
                          }
                        }
                      </ul>
                    </td>
                    <td style="padding: 0.65rem 0.85rem; text-align: right; font-weight: 900; color: #059669;">
                      \${{ selectedOrderTotalFor(order) | number:'1.2-2' }}
                    </td>
                    <td style="padding: 0.65rem 0.85rem; text-align: center;">
                      <span class="status-pill" [class]="'status-pill ' + statusClass(order.status)" style="font-size: 0.72rem; padding: 0.15rem 0.45rem;">
                        {{ statusLabel(order.status, order) }}
                      </span>
                    </td>
                    <td style="padding: 0.65rem 0.85rem; text-align: right;">
                      <button
                        type="button"
                        style="font-size: 0.75rem; font-weight: 800; padding: 0.35rem 0.7rem; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: #ffffff; border: none; border-radius: 0.5rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.35rem; box-shadow: 0 2px 6px rgba(37, 99, 235, 0.3);"
                        title="Agregar más productos a esta comanda"
                        (click)="$event.stopPropagation(); openAddItemsToOrder(order.id)"
                      >
                        <i class="bi bi-plus-circle-fill" aria-hidden="true"></i> Agregar más productos
                      </button>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="7" style="padding: 1.5rem; text-align: center; color: #64748b; font-style: italic;">
                      No hay comandas entregadas o cobradas en el historial de caja.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      } @else {
        <div class="orders-cards orders-cards-grid">
          @if (isDataLoading() && !visibleOrders().length) {
            <article class="state-card">
              <span class="state-spinner" aria-hidden="true"></span>
              <strong>Cargando comandas...</strong>
            </article>
          } @else if (dataError() && !visibleOrders().length) {
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
          } @else {
          @for (order of visibleOrders(); track order.id) {
            <article
              class="order-card clickable-card"
              [class]="'order-card clickable-card ' + statusClass(order.status)"
              (click)="openDetail(order.id)"
            >
              <div class="order-card-head">
                <div class="order-client-meta">
                  @if (order.id.startsWith('PPS')) {
                    <span class="order-client-name">Mesa {{ tableLabel(order) }}</span>
                    <span class="order-table-meta">
                      {{ order.items.length }} items
                      @if (!order.clientName.startsWith('Mesa ')) {
                        | {{ order.clientName }}
                      }
                    </span>
                    @if (isAdmin()) {
                      <span class="order-table-meta" style="color: #a4b4cb; display: block; font-size: 0.9em;">{{ getCreatorLabel(order) }}</span>
                    }
                  } @else {
                    <span class="order-client-name">{{ order.clientName }}</span>
                    <span class="order-table-meta">{{ order.items.length }} items | Mesa {{ tableLabel(order) }}</span>
                  }
                  <span class="order-number">#{{ order.id }}</span>
                </div>
              </div>

              @if (hasReadyItems(order)) {
                <div class="ready-summary-banner">
                  <i class="bi bi-check-circle-fill" aria-hidden="true"></i>
                  <span>{{ getReadyItemsCount(order) }} producto{{ getReadyItemsCount(order) > 1 ? 's' : '' }} listo{{ getReadyItemsCount(order) > 1 ? 's' : '' }} para retirar</span>
                </div>
              }

              <div class="order-items-block">
                <span class="order-items-label">Comanda</span>
                <ul class="order-lines">
                  @for (item of order.items; track item.id) {
                    <li class="order-line-item" [class.is-ready]="item.status === 'LISTO'" [class.is-delivered]="item.status === 'ENTREGADO'">
                      <span class="line-product-info">
                        <strong class="line-qty">{{ item.quantity }}x</strong> {{ item.productName }}
                      </span>
                      @if (item.status === 'LISTO') {
                        <button
                          type="button"
                          class="line-status-chip chip-ready btn-action-retirar"
                          title="Hacer clic para marcar como RETIRADO / ENTREGADO"
                          (click)="deliverItem($event, order.id, item.id)"
                        >
                          <i class="bi bi-check-circle-fill" aria-hidden="true"></i> RETIRAR
                        </button>
                      } @else if (item.status === 'ENTREGADO') {
                        <span class="line-status-chip chip-delivered">
                          <i class="bi bi-check2-all" aria-hidden="true"></i> Entregado
                        </span>
                      } @else {
                        <span class="line-status-chip chip-pending">
                          <i class="bi bi-clock-history" aria-hidden="true"></i> En prep.
                        </span>
                      }
                    </li>
                  }
                </ul>
              </div>
              <span class="status-pill order-state" [class]="'status-pill order-state ' + statusClass(order.status)">
                {{ statusLabel(order.status, order) }}
              </span>
            </article>
          } @empty {
            <p class="empty-state">No tienes comandas activas aun.</p>
          }
          }
        </div>
      }

        @if (lastCreatedId()) {
          <p class="success">Comanda creada: {{ lastCreatedId() }}</p>
        }

        <article class="account-inline-box account-inline-box--results">
          @if (accountLookupDocumentId && groupedAccountOrders().length) {
            <p class="summary">
              Cliente: <strong>{{ groupedAccountClientName() }}</strong> · {{ groupedAccountOrders().length }} comandas ·
              Total: <strong>{{ groupedAccountTotal() | currency:'USD' }}</strong>
            </p>

            <ul class="list grouped-account-list compact-account-list">
              @if (isDataLoading() && !groupedAccountOrders().length) {
                <li class="state-card">
                  <span class="state-spinner" aria-hidden="true"></span>
                  <strong>Buscando cuentas...</strong>
                </li>
              } @else if (dataError() && !groupedAccountOrders().length) {
                <li class="state-card">
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
                </li>
              } @else {
              @for (order of groupedAccountOrders(); track order.id) {
                <li>
                  <div>
                    <strong>{{ order.id }}</strong>
                    <small>Mesa {{ tableLabel(order) }} · {{ order.createdAt | date:'short' }}</small>
                    <small>{{ order.items.length }} items · Estado {{ statusLabel(order.status, order) }}</small>
                  </div>
                  <strong>{{ orderTotalFromOrder(order) | currency:'USD' }}</strong>
                </li>
              }
              }
            </ul>
          } @else if (accountLookupDocumentId) {
            <p class="empty-state">No hay comandas pendientes para esa cedula.</p>
          }
        </article>

      @if (isCreateModalOpen()) {
        <div class="overlay" (click)="closeCreateModal()">
          <article class="modal create-order-modal" [class.create-order-modal--products]="currentStep() === 4" (click)="$event.stopPropagation()">
            <div class="modal-head modal-head--wizard">
              <h2>{{ editingOrderId() ? 'Agregar productos a comanda' : 'Nueva comanda' }}</h2>
              <button type="button" class="btn-ghost modal-close-btn" (click)="closeCreateModal()">
                <span class="btn-content"><i class="bi bi-x-lg btn-icon" aria-hidden="true"></i>Cerrar</span>
              </button>
            </div>

            <div class="stepper order-stepper">
              <button type="button" class="step order-step" [class.active]="currentStep() >= 1" (click)="goToStep(1)">1. Mesa</button>
              @if (!isPapaAndSonSelected()) {
                <button type="button" class="step order-step" [class.active]="currentStep() >= 2" [disabled]="!canContinueFromStep1()" (click)="goToStep(2)">2. Cliente</button>
              }
              <button type="button" class="step order-step" [class.active]="currentStep() >= 3" [disabled]="isPapaAndSonSelected() ? !canContinueFromStep1() : !canContinueFromStep2()" (click)="goToStep(3)">{{ isPapaAndSonSelected() ? '2' : '3' }}. Restaurante</button>
              <button type="button" class="step order-step" [class.active]="currentStep() >= 4" [disabled]="!selectedRestaurant()" (click)="goToStep(4)">{{ isPapaAndSonSelected() ? '3' : '4' }}. Productos</button>
            </div>

            <div class="modal-body" [class.with-floating-bar]="currentStep() === 4" [class.table-selection-mode]="currentStep() === 1">
              <form class="form-grid">
                @if (currentStep() === 1) {
                  <div class="wizard-step">
                    <p class="step-title">Selecciona la mesa para abrir la comanda</p>
                    @if (restaurantOptions().length > 1) {
                      <div class="restaurant-switch restaurant-switch--step1">
                        @for (restaurant of restaurantOptions(); track restaurant.value) {
                          <button
                            type="button"
                            class="restaurant-btn"
                            [class.active]="selectedRestaurant() === restaurant.value"
                            (click)="selectRestaurant(restaurant.value)"
                          >
                            <span class="btn-content"><i [class]="restaurant.iconClass + ' btn-icon'" aria-hidden="true"></i>{{ restaurant.label }}</span>
                          </button>
                        }
                      </div>
                    }

                    @if (isNextRestobarSelected()) {
                      <section class="next-layout-picker next-layout-picker--step1">
                        <div class="next-layout-board">
                          <div class="next-layout-grid" [style.--table-columns]="selectedNextAreaLayout().columns">
                            @for (table of selectedNextAreaLayout().tables; track table.tableNumber) {
                              <button
                                type="button"
                                class="next-table-btn"
                                [class.active]="tableNumber === table.tableNumber"
                                [class.occupied]="isTableOccupied(table.tableNumber, 'NEXT_RESTOBAR')"
                                [style.grid-column]="table.col"
                                [style.grid-row]="table.row"
                                (click)="selectNextTable(table.tableNumber)"
                              >
                                {{ table.label }}
                              </button>
                            }
                          </div>
                        </div>

                        <div class="next-layout-sidebar">
                          <div class="next-area-switch">
                            @for (area of nextRestobarAreaLayouts; track area.id) {
                              <button
                                type="button"
                                class="next-area-btn"
                                [class.active]="selectedNextArea() === area.id"
                                (click)="selectNextArea(area.id)"
                              >
                                {{ area.label }}
                              </button>
                            }
                          </div>

                          <div class="next-layout-actions">
                            <small class="client-hint next-layout-hint">
                              @if (tableNumber > 0) {
                                Mesa seleccionada: {{ currentTableLabel() }}
                              } @else {
                                Selecciona una mesa para continuar.
                              }
                            </small>
                          </div>
                        </div>
                      </section>
                    } @else if (isPapaAndSonSelected()) {
                      <section class="next-layout-picker next-layout-picker--step1 papa-layout-picker">
                        <div class="next-layout-board">
                          <div class="next-layout-grid" [style.--table-columns]="selectedPapaAndSonAreaLayout().columns">
                            @for (table of selectedPapaAndSonAreaLayout().tables; track table.tableNumber) {
                              <button
                                type="button"
                                class="next-table-btn"
                                [class.active]="tableNumber === table.tableNumber"
                                [class.occupied]="getTableOccupancyStatus(table.tableNumber, 'PAPA_Y_SON') === 'MINE'"
                                [class.occupied-others]="getTableOccupancyStatus(table.tableNumber, 'PAPA_Y_SON') === 'OTHERS'"
                                [style.grid-column]="table.col"
                                [style.grid-row]="table.row"
                                (click)="selectPapaAndSonTable(table.tableNumber)"
                              >
                                {{ table.label }}
                              </button>
                            }
                          </div>
                        </div>

                        <div class="next-layout-sidebar">
                          <div class="next-area-switch">
                            @for (area of papaAndSonAreaLayouts; track area.id) {
                              <button
                                type="button"
                                class="next-area-btn"
                                [class.active]="selectedPapaAndSonArea() === area.id"
                                (click)="selectPapaAndSonArea(area.id)"
                              >
                                {{ area.label }}
                              </button>
                            }
                          </div>

                          <div class="next-layout-actions" style="align-content: start; margin-top: 1.5rem;">
                            <small class="client-hint next-layout-hint">
                              @if (tableNumber > 0) {
                                Mesa seleccionada: {{ currentTableLabel() }}
                              } @else {
                                Selecciona una mesa para continuar.
                              }
                            </small>
                            <button type="button" [disabled]="!canContinueFromStep1()" (click)="goToStep(2)" style="margin-top: 1rem; width: 100%;">
                              <span class="btn-content"><i class="bi bi-arrow-right btn-icon" aria-hidden="true"></i>Continuar</span>
                            </button>
                          </div>
                        </div>
                      </section>
                    } @else {
                      <label>
                        Numero de mesa
                        <input
                          type="number"
                          min="1"
                          [(ngModel)]="tableNumber"
                          name="tableNumber"
                          [readonly]="!!editingOrderId()"
                          required
                        />
                      </label>
                    }

                    @if (!isPapaAndSonSelected()) {
                      <button type="button" [disabled]="!canContinueFromStep1()" (click)="goToStep(2)">
                        <span class="btn-content"><i class="bi bi-arrow-right btn-icon" aria-hidden="true"></i>Continuar</span>
                      </button>
                    }
                  </div>
                }

                @if (currentStep() === 2) {
                  <div class="wizard-step">
                    <label>
                      Cedula del cliente
                      <input
                        type="text"
                        [(ngModel)]="clientDocumentId"
                        (ngModelChange)="handleClientDocumentChange($event)"
                        name="clientDocumentId"
                        [readonly]="!!editingOrderId()"
                        inputmode="numeric"
                        placeholder="Ej: 12345678"
                        required
                      />
                    </label>
                    @if (knownClientName()) {
                      <small class="client-hint">Cliente encontrado: {{ knownClientName() }}</small>
                    } @else if (clientName.trim()) {
                      <small class="client-hint">Cliente nuevo: {{ clientName }}</small>
                    }
                    <div class="actions">
                      <button type="button" class="btn-ghost" (click)="goToStep(1)">
                        <span class="btn-content"><i class="bi bi-arrow-left btn-icon" aria-hidden="true"></i>Atras</span>
                      </button>
                      <button type="button" [disabled]="!canContinueFromStep2()" (click)="continueFromClientStep()">
                        <span class="btn-content"><i class="bi bi-arrow-right btn-icon" aria-hidden="true"></i>Continuar</span>
                      </button>
                    </div>
                  </div>
                }

                @if (currentStep() === 3) {
                  <div class="wizard-step">
                    <p class="step-title">Selecciona el restaurante para abrir su menu</p>
                    <div class="restaurant-switch">
                      @for (restaurant of restaurantOptions(); track restaurant.value) {
                        <button
                          type="button"
                          class="restaurant-btn"
                          [class.active]="selectedRestaurant() === restaurant.value"
                          (click)="selectRestaurant(restaurant.value)"
                        >
                          <span class="btn-content"><i [class]="restaurant.iconClass + ' btn-icon'" aria-hidden="true"></i>{{ restaurant.label }}</span>
                        </button>
                      }
                    </div>
                    <small class="client-hint">
                      @if (selectedRestaurant()) {
                        Restaurante seleccionado: {{ selectedRestaurantLabel() }}.
                      } @else {
                        Selecciona el restaurante para continuar.
                      }
                    </small>
                    <div class="actions">
                      <button type="button" class="btn-ghost" (click)="goToStep(2)">
                        <span class="btn-content"><i class="bi bi-arrow-left btn-icon" aria-hidden="true"></i>Atras</span>
                      </button>
                      <button type="button" [disabled]="!canContinueFromRestaurantStep()" (click)="continueFromRestaurantStep()">
                        <span class="btn-content"><i class="bi bi-arrow-right btn-icon" aria-hidden="true"></i>Continuar</span>
                      </button>
                    </div>
                  </div>
                }

                @if (currentStep() === 4) {
                  <div class="wizard-step wizard-step--products">
                    <p class="step-title step-title--context">
                      Cliente: <strong>{{ clientName }}</strong> | Cedula {{ clientDocumentId }} | Mesa {{ currentTableLabel() }}
                    </p>
                    <p class="step-title step-title--restaurant">Restaurante activo: {{ selectedRestaurantLabel() }}</p>
                    @if (isPapaAndSonSelected()) {
                      <!-- Papa y Son: navegación por tarjetas de categoría -->
                      @if (!selectedPapaCategory()) {
                        <!-- Nivel 1: Grid de tarjetas de categoría -->
                        @if (papaCategoryGroups().length) {
                        <div class="papa-categories-grid">
                          @for (group of papaCategoryGroups(); track group.category) {
                            <article class="papa-category-card" (click)="selectPapaCategory(group.category)">
                              <div class="papa-category-card-icon">
                                <i [class]="categoryIconClass(group.category)" aria-hidden="true"></i>
                              </div>
                              <h4>{{ group.label }}</h4>
                              <small>{{ group.products.length }} productos</small>
                              @if (categorySelectedItems(group.category) > 0) {
                                <span class="papa-category-badge">{{ categorySelectedItems(group.category) }} en orden</span>
                              }
                            </article>
                          }
                        </div>
                        } @else {
                          <p class="empty-state">No hay productos disponibles para este restaurante.</p>
                        }
                      } @else {
                        <!-- Nivel 2: Productos de la categoría seleccionada -->
                        <section class="menu-layout--papa">
                          <main class="menu-products-main">
                            <div class="papa-products-header">
                              <button type="button" class="btn-ghost papa-back-btn" (click)="goBackToCategories()">
                                <span class="btn-content"><i class="bi bi-arrow-left btn-icon" aria-hidden="true"></i>Categorías</span>
                              </button>
                              <h2 class="menu-products-title">{{ selectedPapaCategoryLabel() }}</h2>
                            </div>
                            <label class="product-search-field product-picker-search product-picker-search--menu papa-product-search">
                              <i class="bi bi-search" aria-hidden="true"></i>
                              <input
                                type="text"
                                [ngModel]="productSearchQuery()"
                                (ngModelChange)="productSearchQuery.set($event || '')"
                                [ngModelOptions]="{ standalone: true }"
                                placeholder="Buscar producto..."
                              />
                            </label>

                            @if (filteredPapaCategoryProducts().length) {
                            <div class="category-products-grid">
                              @for (product of filteredPapaCategoryProducts(); track product.id) {
                                <article class="product-picker-card product-picker-card--menu">
                                  @if (product.imageUrl) {
                                    <img class="product-picker-image" [src]="product.imageUrl" [alt]="product.name" loading="lazy" />
                                  } @else {
                                    <div class="product-picker-image-fallback" aria-hidden="true">
                                      <i class="bi bi-card-image"></i>
                                    </div>
                                  }
                                  <div class="product-picker-copy">
                                    <div class="product-picker-head product-picker-head--menu">
                                      <strong>{{ product.name }}</strong>
                                      <span>{{ product.price | currency:'USD' }}</span>
                                    </div>
                                    <small>{{ product.description || ('Aquí va la descripción de ' + product.name.toLowerCase()) }}</small>
                                  </div>

                                  <div class="quantity-row quantity-row--menu">
                                    <button type="button" class="quantity-btn" (click)="decrementProductQuantity(product.id)">-</button>
                                    <strong>{{ productLineQuantity(product.id) }}</strong>
                                    <button type="button" class="quantity-btn" (click)="incrementProductQuantity(product.id)">+</button>
                                  </div>

                                  <button type="button" class="product-note-toggle" (click)="toggleCategoryNoteVisibility(product.id)">
                                    NOTAS
                                  </button>

                                  @if (isCategoryNoteVisible(product.id)) {
                                    <label class="line-note-input picker-note-input picker-note-input--menu">
                                      <input
                                        type="text"
                                        [ngModel]="productLineNote(product.id)"
                                        (ngModelChange)="updateProductNote(product.id, $event)"
                                        [ngModelOptions]="{ standalone: true }"
                                        placeholder="Ej: Sin cebolla"
                                      />
                                    </label>
                                  }
                                </article>
                              }
                            </div>
                            } @else {
                              <p class="empty-state">No hay productos disponibles para esta categoría.</p>
                            }
                          </main>

                          <aside class="menu-order-sidebar">
                            <div class="menu-order-sidebar-head">
                              <h3><i class="bi bi-receipt" aria-hidden="true"></i> Lista de la orden</h3>
                              <span class="menu-order-sidebar-badge">{{ lines().length }}</span>
                            </div>
                            <ul class="list menu-order-list">
                              @for (line of lines(); track line.id) {
                                <li class="menu-order-item">
                                  <div class="menu-order-item-info">
                                    <strong>{{ productName(line.productId) }}</strong>
                                    <small>{{ line.quantity }} x {{ lineUnitPrice(line.productId) | currency:'USD' }}</small>
                                  </div>
                                  <div class="menu-order-item-actions">
                                    <span>{{ lineTotal(line.productId, line.quantity) | currency:'USD' }}</span>
                                    <button type="button" class="menu-order-remove-btn" (click)="removeLine(line.id)">
                                      <i class="bi bi-x-lg" aria-hidden="true"></i>
                                    </button>
                                  </div>
                                </li>
                              } @empty {
                                <li class="menu-order-empty">
                                  <i class="bi bi-cart3" aria-hidden="true"></i>
                                  <span>Aún no agregas productos</span>
                                </li>
                              }
                            </ul>
                            <div class="menu-order-sidebar-footer">
                              <p class="menu-order-total"><span>Total estimado</span> <strong>{{ orderTotal() | currency:'USD' }}</strong></p>
                            </div>
                          </aside>
                        </section>
                      }
                    } @else {
                    @if (filteredProducts().length) {
                    <section class="menu-layout">
                      <!-- Sidebar de categorías (vertical) -->
                      <aside class="menu-category-sidebar">
                        <label class="product-search-field product-picker-search product-picker-search--menu menu-search-sidebar">
                          <i class="bi bi-search" aria-hidden="true"></i>
                          <input
                            type="text"
                            [ngModel]="productSearchQuery()"
                            (ngModelChange)="productSearchQuery.set($event || '')"
                            [ngModelOptions]="{ standalone: true }"
                            placeholder="Buscar..."
                          />
                        </label>
                        <nav class="menu-category-nav">
                          @for (group of groupedProducts(); track group.category) {
                            @if (group.products.length) {
                              <button
                                type="button"
                                class="menu-category-item"
                                [class.active]="selectedCategory() === group.category"
                                (click)="selectProductCategory(group.category)"
                              >
                                <i [class]="categoryIconClass(group.category)" aria-hidden="true"></i>
                                <span class="menu-category-item-label">{{ group.label }}</span>
                                <span class="menu-category-item-count">{{ group.products.length }}</span>
                              </button>
                            }
                          }
                        </nav>
                      </aside>

                      <!-- Grid de productos (centro) -->
                      <main class="menu-products-main">
                        <div class="menu-products-topbar">
                          <h2 class="menu-products-title">Menú</h2>
                          <span class="menu-products-subtitle">{{ selectedCategoryGroup()?.label || '' }}</span>
                        </div>

                        <!-- Chips de categorías para móvil/tablet vertical -->
                        <div class="menu-category-rail-mobile">
                          @for (group of groupedProducts(); track group.category) {
                            @if (group.products.length) {
                              <button
                                type="button"
                                class="menu-category-chip"
                                [class.active]="selectedCategory() === group.category"
                                (click)="selectProductCategory(group.category)"
                              >
                                <i [class]="categoryIconClass(group.category)" aria-hidden="true"></i>
                                <span>{{ group.label }}</span>
                              </button>
                            }
                          }
                        </div>

                        @if (selectedCategoryGroup()?.products?.length) {
                        <div class="category-products-grid">
                          @for (product of selectedCategoryGroup()!.products; track product.id) {
                            <article class="product-picker-card product-picker-card--menu">
                              @if (product.imageUrl) {
                                <img class="product-picker-image" [src]="product.imageUrl" [alt]="product.name" loading="lazy" />
                              } @else {
                                <div class="product-picker-image-fallback" aria-hidden="true">
                                  <i class="bi bi-card-image"></i>
                                </div>
                              }
                              <div class="product-picker-copy">
                                <div class="product-picker-head product-picker-head--menu">
                                  <strong>{{ product.name }}</strong>
                                  <span>{{ product.price | currency:'USD' }}</span>
                                </div>
                                <small>{{ product.description || ('Aquí va la descripción de ' + product.name.toLowerCase()) }}</small>
                              </div>

                              <div class="quantity-row quantity-row--menu">
                                <button type="button" class="quantity-btn" (click)="decrementProductQuantity(product.id)">-</button>
                                <strong>{{ productLineQuantity(product.id) }}</strong>
                                <button type="button" class="quantity-btn" (click)="incrementProductQuantity(product.id)">+</button>
                              </div>

                              <button type="button" class="product-note-toggle" (click)="toggleCategoryNoteVisibility(product.id)">
                                NOTAS
                              </button>

                              @if (isCategoryNoteVisible(product.id)) {
                                <label class="line-note-input picker-note-input picker-note-input--menu">
                                  <input
                                    type="text"
                                    [ngModel]="productLineNote(product.id)"
                                    (ngModelChange)="updateProductNote(product.id, $event)"
                                    [ngModelOptions]="{ standalone: true }"
                                    placeholder="Ej: Sin cebolla"
                                  />
                                </label>
                              }
                            </article>
                          }
                        </div>
                        } @else {
                          <p class="empty-state">No hay productos disponibles para esta categoria.</p>
                        }
                      </main>

                      <!-- Sidebar de resumen de orden (derecha) -->
                      <aside class="menu-order-sidebar">
                        <div class="menu-order-sidebar-head">
                          <h3><i class="bi bi-receipt" aria-hidden="true"></i> Lista de la orden</h3>
                          <span class="menu-order-sidebar-badge">{{ lines().length }}</span>
                        </div>
                        <ul class="list menu-order-list">
                          @for (line of lines(); track line.id) {
                            <li class="menu-order-item">
                              <div class="menu-order-item-info">
                                <strong>{{ productName(line.productId) }}</strong>
                                <small>{{ line.quantity }} x {{ lineUnitPrice(line.productId) | currency:'USD' }}</small>
                              </div>
                              <div class="menu-order-item-actions">
                                <span>{{ lineTotal(line.productId, line.quantity) | currency:'USD' }}</span>
                                <button type="button" class="menu-order-remove-btn" (click)="removeLine(line.id)">
                                  <i class="bi bi-x-lg" aria-hidden="true"></i>
                                </button>
                              </div>
                            </li>
                          } @empty {
                            <li class="menu-order-empty">
                              <i class="bi bi-cart3" aria-hidden="true"></i>
                              <span>Aún no agregas productos</span>
                            </li>
                          }
                        </ul>
                        <div class="menu-order-sidebar-footer">
                          <p class="menu-order-total"><span>Total estimado</span> <strong>{{ orderTotal() | currency:'USD' }}</strong></p>
                        </div>
                      </aside>
                    </section>
                    } @else {
                      <p>No hay productos disponibles para este restaurante.</p>
                    }
                    }
                  </div>
                }
              </form>

              @if (currentStep() !== 1 && currentStep() !== 4) {
              <article class="panel resume-panel resume-panel--products">
                <h3>Lista de la orden</h3>
                <ul class="list resume-list">
                  @for (line of lines(); track line.id) {
                    <li>
                      <div>
                        <strong>{{ productName(line.productId) }}</strong>
                        <small>{{ line.quantity }} x {{ lineUnitPrice(line.productId) | currency:'USD' }}</small>
                        <label class="line-note-input">
                          Nota
                          <input
                            type="text"
                            [ngModel]="line.note"
                            (ngModelChange)="updateLineNote(line.id, $event)"
                            [ngModelOptions]="{ standalone: true }"
                            placeholder="Ej: Sin cebolla"
                          />
                        </label>
                      </div>
                      <div class="stack">
                        <span>{{ lineTotal(line.productId, line.quantity) | currency:'USD' }}</span>
                        <button type="button" class="btn-ghost" (click)="removeLine(line.id)">
                          <span class="btn-content"><i class="bi bi-trash btn-icon" aria-hidden="true"></i>Quitar</span>
                        </button>
                      </div>
                    </li>
                  } @empty {
                    <li>Aun no agregas productos.</li>
                  }
                </ul>
                <p class="resume-total"><strong>Total estimado:</strong> {{ orderTotal() | currency:'USD' }}</p>
              </article>
              }
            </div>

            @if (currentStep() === 4) {
              <div class="floating-submit-bar floating-submit-bar--products">
                <button type="button" class="btn-ghost" (click)="goToStep(3)">
                  <span class="btn-content"><i class="bi bi-arrow-left btn-icon" aria-hidden="true"></i>Volver</span>
                </button>
                <div class="floating-bar-total">
                  <small>Total</small>
                  <strong>{{ orderTotal() | currency:'USD' }}</strong>
                </div>
                <button type="button" [disabled]="!lines().length" (click)="openConfirmModal()">
                  <span class="btn-content"><i class="bi bi-arrow-right-circle btn-icon" aria-hidden="true"></i>Continuar</span>
                </button>
              </div>
            }
          </article>
        </div>
      }

      @if (isCreateModalOpen() && isConfirmModalOpen()) {
        <div class="overlay overlay-front" (click)="closeConfirmModal()">
          <article class="modal detail-modal confirm-modal" (click)="$event.stopPropagation()">
            <div class="modal-head">
              <h2>Confirmar comanda</h2>
              <button type="button" class="btn-ghost" (click)="closeConfirmModal()">Modificar</button>
            </div>

            <p class="summary">
              Mesa {{ currentTableLabel() }} | Cliente: {{ clientName }} | Cedula: {{ clientDocumentId }} | {{ selectedRestaurantLabel() }}
            </p>

            <ul class="list">
              @for (line of lines(); track line.id) {
                <li>
                  <div>
                    <strong>{{ productName(line.productId) }}</strong>
                    <small>{{ line.quantity }} x {{ lineUnitPrice(line.productId) | currency:'USD' }}</small>
                    @if (line.note.trim()) {
                      <small class="line-note-view">Nota: {{ line.note }}</small>
                    }
                  </div>
                  <span>{{ lineTotal(line.productId, line.quantity) | currency:'USD' }}</span>
                </li>
              }
            </ul>

            <p><strong>Total estimado:</strong> {{ orderTotal() | currency:'USD' }}</p>

            <div class="detail-actions">
              <button type="button" class="btn-ghost" (click)="closeConfirmModal()">
                <span class="btn-content"><i class="bi bi-pencil-square btn-icon" aria-hidden="true"></i>Modificar</span>
              </button>
              <button type="button" [disabled]="isSubmittingOrder()" (click)="confirmSubmitOrder()">
                <span class="btn-content">
                  @if (isSubmittingOrder()) {
                    <span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                    Enviando...
                  } @else {
                    <i class="bi bi-check2-circle btn-icon" aria-hidden="true"></i>{{ editingOrderId() ? 'Confirmar agregado' : 'Enviar comanda' }}
                  }
                </span>
              </button>
            </div>
          </article>
        </div>
      }

      @if (isCreateModalOpen() && isClientNameModalOpen()) {
        <div class="overlay overlay-front" (click)="closeClientNameModal()">
          <article class="modal detail-modal confirm-modal" (click)="$event.stopPropagation()">
            <div class="modal-head">
              <h2>Registrar cliente</h2>
              <button type="button" class="btn-ghost" (click)="closeClientNameModal()">
                <span class="btn-content"><i class="bi bi-x-lg btn-icon" aria-hidden="true"></i>Cerrar</span>
              </button>
            </div>

            <p class="summary">
              No existe un cliente guardado con la cedula {{ clientDocumentId }}. Ingresa el nombre para continuar.
            </p>

            <label>
              Nombre del cliente
              <input
                type="text"
                [(ngModel)]="draftClientName"
                name="draftClientName"
                placeholder="Ej: Juan Perez"
                required
              />
            </label>

            <div class="detail-actions">
              <button type="button" class="btn-ghost" (click)="closeClientNameModal()">
                <span class="btn-content"><i class="bi bi-x-lg btn-icon" aria-hidden="true"></i>Cancelar</span>
              </button>
              <button type="button" [disabled]="draftClientName.trim().length < 2" (click)="confirmClientName()">
                <span class="btn-content"><i class="bi bi-arrow-right-circle btn-icon" aria-hidden="true"></i>Guardar y continuar</span>
              </button>
            </div>
          </article>
        </div>
      }

      @if (isEditClientModalOpen() && selectedOrder()) {
        <div class="overlay overlay-front" (click)="closeEditClientModal()">
          <article class="modal detail-modal" (click)="$event.stopPropagation()">
            <div class="modal-head">
              <h2>Editar Cliente</h2>
              <button type="button" class="btn-ghost" (click)="closeEditClientModal()">
                <span class="btn-content"><i class="bi bi-x-lg btn-icon" aria-hidden="true"></i>Cerrar</span>
              </button>
            </div>
            <div class="form-grid" style="padding: 1rem;">
              <label>
                Cedula del cliente
                <input
                  type="text"
                  [(ngModel)]="editClientDocumentId"
                  name="editClientDocumentId"
                  inputmode="numeric"
                  placeholder="Ej: 12345678"
                />
              </label>
              <label>
                Nombre del cliente
                <input
                  type="text"
                  [(ngModel)]="editClientName"
                  name="editClientName"
                  placeholder="Ej: Juan Perez"
                  required
                />
              </label>
            </div>
            <div class="detail-actions">
              <button type="button" class="btn-ghost" (click)="closeEditClientModal()">
                <span class="btn-content"><i class="bi bi-x-lg btn-icon" aria-hidden="true"></i>Cancelar</span>
              </button>
              <button type="button" (click)="saveEditClient()">
                <span class="btn-content"><i class="bi bi-check2-circle btn-icon" aria-hidden="true"></i>Guardar cambios</span>
              </button>
            </div>
          </article>
        </div>
      }

      @if (isDetailModalOpen() && selectedOrder()) {
        <div class="overlay" (click)="closeDetailModal()">
          <article class="modal detail-modal" (click)="$event.stopPropagation()">
            <div class="modal-head">
              <h2>Resumen de comanda</h2>
              <button type="button" class="btn-ghost" (click)="closeDetailModal()">
                <span class="btn-content"><i class="bi bi-x-lg btn-icon" aria-hidden="true"></i>Cerrar</span>
              </button>
            </div>

          

            <p  class="summary" style="display: flex; justify-content: space-between; align-items: center; gap: 1rem;">
              <strong>
                Mesa {{ tableLabel(selectedOrder()!) }} | Cliente: {{ selectedOrder()!.clientName }} |
                Cedula {{ selectedOrder()!.clientDocumentId || 'No registrada' }} |
                {{ selectedOrder()!.createdAt | date:'short' }}
              </strong>
              @if (isPapaAndSonSelected() || selectedOrder()!.items[0]?.restaurantId === 'PAPA_Y_SON') {
                <button type="button" class="btn-ghost" (click)="openEditClientModal()" style="padding: 0.3rem 0.6rem; min-height: auto;">
                  <span class="btn-content"><i class="bi bi-pencil" aria-hidden="true"></i></span>
                </button>
              }
            </p>

              <div class="detail-head" >
              <strong>{{ selectedOrder()!.id }}</strong>
              <span class="status-pill" [class]="'status-pill ' + statusClass(selectedOrder()!.status)">
                {{ statusLabel(selectedOrder()!.status, selectedOrder()!) }}
              </span>
            </div>

            <ul class="list">
              @for (item of selectedOrder()!.items; track item.id) {
                <li [style.opacity]="item.status === 'ENTREGADO' ? '0.65' : '1'" style="display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;">
                  <div style="flex: 1; min-width: 0;">
                    <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                      <strong>{{ item.productName }}</strong>
                      @if (item.status === 'LISTO') {
                        <button
                          type="button"
                          style="font-size: 0.72rem; font-weight: 800; padding: 0.2rem 0.6rem; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; border: none; border-radius: 1rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.3rem; box-shadow: 0 2px 6px rgba(16, 185, 129, 0.35);"
                          title="Hacer clic para marcar como RETIRADO / ENTREGADO"
                          (click)="deliverItem($event, selectedOrder()!.id, item.id)"
                        >
                          <i class="bi bi-check-circle-fill" aria-hidden="true"></i> RETIRAR
                        </button>
                      } @else if (item.status === 'ENTREGADO') {
                        <span style="font-size: 0.68rem; font-weight: 700; padding: 0.15rem 0.45rem; background: #e0e7ff; color: #3730a3; border: 1px solid #c7d2fe; border-radius: 1rem; display: inline-flex; align-items: center; gap: 0.25rem;">
                          <i class="bi bi-check2-all" aria-hidden="true"></i> Entregado
                        </span>
                      } @else {
                        <span style="font-size: 0.68rem; font-weight: 700; padding: 0.15rem 0.45rem; background: #fef3c7; color: #92400e; border: 1px solid #fde68a; border-radius: 1rem; display: inline-flex; align-items: center; gap: 0.25rem;">
                          <i class="bi bi-clock-history" aria-hidden="true"></i> En preparación
                        </span>
                      }
                    </div>
                    <small>{{ item.restaurantId }} / {{ item.area }}</small>
                    @if (item.note) {
                      <small class="line-note-view">Nota: {{ item.note }}</small>
                    }
                  </div>
                  <div class="stack" style="text-align: right; flex-shrink: 0;">
                    <small>{{ item.quantity }} x {{ item.unitPrice | currency:'USD' }}</small>
                    <span>{{ item.quantity * item.unitPrice | currency:'USD' }}</span>
                  </div>
                  @if (canDeleteSelectedOrderItem(item)) {
                    <button
                      type="button"
                      class="btn-ghost"
                      style="color: #ff5e5e; padding: 0.35rem 0.5rem; font-size: 1rem; border-radius: 0.4rem; flex-shrink: 0; min-height: unset; line-height: 1;"
                      title="Eliminar este producto de la comanda"
                      (click)="deleteSelectedOrderItem(item)"
                    >
                      <i class="bi bi-trash" aria-hidden="true"></i>
                    </button>
                  }
                </li>
              }
            </ul>

            <p><strong>Total:</strong> {{ selectedOrderTotal() | currency:'USD' }}</p>

            <div class="detail-actions">
              @if (canDeleteSelectedOrder()) {
                <button type="button" class="btn-ghost" (click)="deleteSelectedOrder()">
                  <span class="btn-content"><i class="bi bi-trash btn-icon" aria-hidden="true"></i>Eliminar comanda</span>
                </button>
              }

              @if (selectedOrder()!.status !== 'COBRADO' && !isPendingPaymentVerification(selectedOrder()!)) {
                <button type="button" class="btn-ghost" (click)="openAddItemsToOrder(selectedOrder()!.id)">
                  <span class="btn-content"><i class="bi bi-plus-circle btn-icon" aria-hidden="true"></i>Agregar productos</span>
                </button>
              }

              @if (selectedOrder()!.status === 'LISTO') {
                <button type="button" (click)="markDelivered(selectedOrder()!.id)">
                  <span class="btn-content"><i class="bi bi-check2-circle btn-icon" aria-hidden="true"></i>Recibido</span>
                </button>
              }

              @if (selectedOrder()!.status === 'ENTREGADO' && !isPendingPaymentVerification(selectedOrder()!)) {
                <button type="button" class="btn-ghost" (click)="toggleBillSummary()">
                  <span class="btn-content"><i class="bi bi-receipt btn-icon" aria-hidden="true"></i>{{ showBillSummary() ? 'Ocultar cuenta' : 'Mostrar cuenta' }}</span>
                </button>
              }
            </div>

            @if (isPendingPaymentVerification(selectedOrder()!)) {
              <p class="verification-pending-note">
                Pago movil enviado a Caja para verificar. Referencia: <strong>{{ selectedOrder()!.paymentReference }}</strong>
              </p>
            }

            @if (selectedOrder()!.status === 'ENTREGADO' && showBillSummary()) {
              <article class="bill-box">
                <h3>Cuenta a pagar</h3>
                <div class="bill-row">
                  <span>Cliente</span>
                  <strong>{{ selectedOrder()!.clientName }}</strong>
                </div>
                <div class="bill-row">
                  <span>Mesa</span>
                  <strong>{{ tableLabel(selectedOrder()!) }}</strong>
                </div>
                <div class="bill-row">
                  <span>Items</span>
                  <strong>{{ selectedOrder()!.items.length }}</strong>
                </div>
                <div class="bill-row">
                  <span>Subtotal</span>
                  <strong>{{ selectedOrderTotal() | currency:'USD' }}</strong>
                </div>
                <label class="bill-tip-toggle">
                  <input
                    type="checkbox"
                    [ngModel]="billTipEnabled()"
                    (ngModelChange)="billTipEnabled.set(!!$event)"
                  />
                  <span>Agregar propina mesero</span>
                </label>

                @if (billTipEnabled()) {
                  <label class="bill-tip-field">
                    <span>Porcentaje de propina</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      [ngModel]="billTipPercent()"
                      (ngModelChange)="updateBillTipPercent($event)"
                    />
                  </label>

                  <div class="bill-row">
                    <span>Propina ({{ billTipPercent() | number:'1.0-0' }}%)</span>
                    <strong>{{ selectedOrderTipAmount() | currency:'USD' }}</strong>
                  </div>
                }

                @if (selectedOrderHasPapaAndSonIva()) {
                  <div class="bill-row" [class.muted]="bcvRate() === 0">
                    <span>IVA (16%)</span>
                    <strong>{{ selectedOrderTaxBs() | number:'1.2-2' }} Bs</strong>
                  </div>
                }

                <div class="bill-row total">
                  <span>Total en dólares</span>
                  <strong>{{ selectedOrderPayableTotal() | currency:'USD' }}</strong>
                </div>

                <div class="bill-row" [class.muted]="bcvRate() === 0">
                  <span>Subtotal en Bs</span>
                  <strong>{{ selectedOrderTotalBs() | number:'1.2-2' }} Bs</strong>
                </div>

                <div class="bill-row total" [class.muted]="bcvRate() === 0">
                  <span>Total a pagar</span>
                  <strong>{{ selectedOrderPayableTotalBs() | number:'1.2-2' }} Bs</strong>
                </div>

                @if (shouldShowNextQr(selectedOrder()!)) {
                  <article class="next-qr-box">
                    <h4>Pago móvil Next Restobar</h4>
                    <img src="assets/img/qrnext.jpeg" alt="QR de pago Next Restobar" loading="lazy" />
                    <small>Escanea el QR y luego registra la referencia para cerrar la orden.</small>
                  </article>
                }
                @if (shouldShowPapaAndSonQr(selectedOrder()!)) {
                  <article class="next-qr-box">
                    <h4>Pago móvil Papa y Son</h4>
                    <img src="assets/img/QR PAGO MOVIL.jpeg" alt="QR de pago Papa y Son" loading="lazy" />
                    <small>Escanea el QR y luego registra la referencia para cerrar la orden.</small>
                  </article>
                }

                <button type="button" (click)="openReceivePaymentModal(selectedOrder()!.id)">
                  <span class="btn-content"><i class="bi bi-cash-coin btn-icon" aria-hidden="true"></i>Pago recibido</span>
                </button>
              </article>
            }
          </article>
        </div>
      }

      @if (isReceivePaymentModalOpen() && selectedOrder()) {
        <div class="overlay overlay-front" (click)="closeReceivePaymentModal()">
          <article class="modal detail-modal confirm-modal" (click)="$event.stopPropagation()">
            <div class="modal-head">
              <h2>Confirmar pago</h2>
              <button type="button" class="btn-ghost" (click)="closeReceivePaymentModal()">
                <span class="btn-content"><i class="bi bi-x-lg btn-icon" aria-hidden="true"></i>Cerrar</span>
              </button>
            </div>

            <p class="summary">
              {{ requiresPapaAndSonPaymentVerification(selectedOrder()!)
                ? 'Registra la referencia para enviar la verificacion a Caja.'
                : 'Registra la referencia de pago para cerrar la orden como en Caja.' }}
            </p>

            <label>
              Método de pago
              <select
                [ngModel]="paymentMethod()"
                (ngModelChange)="paymentMethod.set($event)"
                name="paymentMethod"
                style="width: 100%; padding: 0.6rem; border-radius: 0.375rem; border: 1px solid #ccc; font-size: 1rem; margin-top: 0.3rem;"
              >
                @for (method of modalPaymentMethods; track method.value) {
                  <option [value]="method.value">{{ method.label }}</option>
                }
              </select>
            </label>

            @if (paymentMethod() === 'PAGO_MOVIL') {
              <label style="margin-top: 1rem; display: block;">
                Referencia de pago móvil
                <input
                  type="text"
                  [ngModel]="paymentReference()"
                  (ngModelChange)="paymentReference.set($event || '')"
                  name="paymentReference"
                  placeholder="Ej: 0123456789"
                  required
                  style="width: 100%; padding: 0.6rem; border-radius: 0.375rem; border: 1px solid #ccc; font-size: 1rem; margin-top: 0.3rem;"
                />
              </label>
            }

            <div class="detail-actions">
              <button type="button" class="btn-ghost" (click)="closeReceivePaymentModal()">
                <span class="btn-content"><i class="bi bi-x-lg btn-icon" aria-hidden="true"></i>Cancelar</span>
              </button>
              <button type="button" [disabled]="paymentMethod() === 'PAGO_MOVIL' && paymentReference().trim().length < 3" (click)="confirmReceivePayment()">
                <span class="btn-content"><i class="bi bi-check2-circle btn-icon" aria-hidden="true"></i>{{ selectedOrder() && requiresPapaAndSonPaymentVerification(selectedOrder()!) ? 'Enviar a verificar' : 'Continuar y cerrar' }}</span>
              </button>
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
    }

    button {
      min-height: 44px;
      padding: 0.5rem 1rem;
      border-radius: 0.5rem;
      border: 1px solid #7a5f10;
      background: #b28d1b;
      color: #ffffff;
      font-weight: 700;
      font-size: 0.92rem;
      box-shadow: none;
      transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
    }

    button:hover {
      background: #7a5f10;
      border-color: #b28d1b;
      color: #ffffff;
    }

    button:disabled {
      background: #b49b50;
      border-color: #7a6935;
      color: #f8fbff;
      cursor: not-allowed;
    }

    .btn-ghost {
      background: #ffffff;
      border-color: #6c757d;
      color: #495057;
    }

    .btn-ghost:hover {
      background: #f8f9fa;
      border-color: #5c636a;
      color: #495057;
    }

    .page-header h1 {
      display: flex;
      align-items: center;
      gap: 0.7rem;
      margin: 0;
      color: #000000;
      font-size: clamp(1.75rem, 3.5vw, 2.45rem);
      line-height: 1;
      font-weight: 900;
      letter-spacing: -0.03em;
    }

    .page-header h1 i {
      font-size: 0.9em;
    }

    .orders-page-header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(300px, 500px);
      gap: 0.9rem 1.5rem;
      align-items: start;
      margin-bottom: 1.45rem;
    }

    .orders-title {
      margin: 0;
      color: #181818;
      font-size: clamp(2rem, 3.8vw, 3rem);
      font-weight: 900;
      letter-spacing: -0.05em;
      line-height: 0.96;
    }

    .orders-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 0.7rem;
      align-items: center;
    }

    .orders-filter-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
    }

    .orders-search-field {
      grid-column: 2;
      align-self: start;
      display: flex;
      align-items: center;
      gap: 0.7rem;
      min-height: 56px;
      padding: 0 1rem;
      border-radius: 1rem;
      border: 1px solid #e6e2db;
      background: #ededed;
      color: #7d7b76;
    }

    .orders-search-field i {
      font-size: 1.35rem;
      color: #7f7a72;
    }

    .orders-search-field input {
      min-height: 40px;
      padding: 0;
      border: none;
      background: transparent;
      color: #4a4641;
      font-size: 1.04rem;
      font-weight: 600;
      outline: none;
    }

    .orders-shell {
      display: grid;
      gap: 1rem;
    }

    .orders-topbar {
      display: grid;
      grid-template-columns: minmax(240px, 320px) minmax(260px, 300px);
      justify-content: space-between;
      gap: 1rem;
      align-items: start;
    }

    .head-row {
      display: flex;
      justify-content: flex-start;
      gap: 0.8rem;
      align-items: center;
      margin-bottom: 0;
    }

    .head-row h2 {
      margin: 0;
      color: #2a4a88;
      font-size: clamp(1.6rem, 3vw, 2rem);
      line-height: 1;
      font-weight: 900;
      letter-spacing: -0.03em;
    }

    .orders-segmented-control {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0;
      border: 2px solid #2a4a88;
      border-radius: 999px;
      overflow: hidden;
      width: min(100%, 360px);
      background: #ffffff;
    }

    .segment-btn {
      min-height: 46px;
      border: 1px solid #cfaf43;
      border-radius: 999px;
      background: #b9932f;
      color: #fff8e1;
      font-size: 0.92rem;
      font-weight: 800;
      box-shadow: none;
      transform: none;
      padding-inline: 1rem;
    }

    .segment-btn.active {
      background: #80610d;
      color: #fffef8;
      border-color: #80610d;
    }

    .comanda-cta {
      min-height: 46px;
      padding-inline: 1.05rem;
      font-size: 0.92rem;
      font-weight: 800;
      border-radius: 999px;
      justify-self: start;
      background: #cfaa36;
      color: #fff8e1;
      border: 1px solid #cfaa36;
      box-shadow: none;
      min-width: 0;
    }

    .comanda-cta:hover {
      background: #b28d1b;
      color: #ffffff;
      border-color: #b28d1b;
      box-shadow: none;
    }

    .comanda-cta .btn-content {
      gap: 0.7rem;
      font-weight: 900;
    }

    .comanda-cta .btn-icon {
      width: 1.9rem;
      height: 1.9rem;
      border-radius: 50%;
      border: 2px solid rgba(255, 255, 255, 0.8);
      display: grid;
      place-items: center;
      font-size: 1rem;
      background: rgba(255, 255, 255, 0.08);
    }

    .orders-cards {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1rem;
    }

    .orders-cards-grid {
      grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
      gap: 1.1rem;
    }

    .order-card {
      border-radius: 1.45rem;
      border: 3px solid #e3dfda;
      background: #ffffff;
      padding: 1rem 1rem 3.6rem;
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
      min-height: 280px;
      align-items: stretch;
      position: relative;
      box-shadow: 0 6px 18px rgba(157, 135, 83, 0.08);
    }

    .ready-summary-banner {
      font-size: 0.76rem;
      font-weight: 800;
      color: #065f46;
      background: #d1fae5;
      border: 1px solid #6ee7b7;
      padding: 0.35rem 0.65rem;
      border-radius: 0.65rem;
      display: flex;
      align-items: center;
      gap: 0.35rem;
      box-shadow: 0 2px 6px rgba(16, 185, 129, 0.18);
    }

    .order-card.PENDIENTE {
      border-color: #e8ddd1;
      box-shadow: 0 10px 24px rgba(206, 137, 102, 0.12);
    }

    .order-card.EN_PROCESO {
      border-color: #dbe4f1;
      box-shadow: 0 10px 24px rgba(70, 106, 171, 0.12);
    }

    .order-card.LISTO {
      border-color: #d6e6ff;
      box-shadow: 0 10px 24px rgba(86, 147, 219, 0.12);
    }

    .order-card.ENTREGADO {
      border-color: #d9eadb;
      box-shadow: 0 10px 24px rgba(85, 161, 101, 0.12);
    }

    .order-card.COBRADO {
      border-color: #e9e0f3;
      box-shadow: 0 10px 24px rgba(124, 94, 168, 0.12);
    }

    .clickable-card {
      cursor: pointer;
      transition: transform 0.18s ease, box-shadow 0.18s ease;
    }

    .clickable-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 16px 32px rgba(126, 112, 80, 0.18);
    }

    .order-card-head {
      display: flex;
      align-items: flex-start;
      gap: 0.85rem;
    }

    .order-avatar {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.98);
      display: grid;
      place-items: center;
      color: var(--brand-primary-dark);
      font-size: 2rem;
      box-shadow: inset 0 0 0 2px rgba(46, 200, 197, 0.12);
    }

    .order-avatar--board {
      width: 52px;
      height: 52px;
      flex: 0 0 auto;
      background: #fbf5e8;
      color: #282420;
      font-size: 1.5rem;
      border: 2px solid #ece2c6;
      box-shadow: none;
    }

    .order-client-meta {
      display: grid;
      gap: 0.14rem;
      min-width: 0;
      padding-right: 4rem;
    }

    .order-client-name {
      font-size: 1.08rem;
      line-height: 1.15;
      font-weight: 900;
      color: #181818;
    }

    .order-table-meta {
      color: #b9932f;
      font-size: 0.84rem;
      font-weight: 800;
    }

    .order-number {
      color: #87837c;
      font-size: 0.8rem;
      font-weight: 700;
    }

    .order-items-block {
      display: grid;
      gap: 0.28rem;
      margin-top: 0.2rem;
    }



    .order-lines {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 0.25rem;
      color: #1f2937;
      font-size: 0.9rem;
      font-weight: 800;
    }

    .order-line-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      padding: 0.25rem 0.45rem;
      border-radius: 0.45rem;
      background: rgba(255, 255, 255, 0.75);
      border: 1px solid #f3f4f6;
      transition: all 0.2s ease;
    }

    .order-line-item.is-ready {
      background: #ecfdf5;
      border-color: #a7f3d0;
      box-shadow: 0 2px 5px rgba(16, 185, 129, 0.12);
    }

    .order-line-item.is-delivered {
      opacity: 0.65;
    }

    .line-product-info {
      flex: 1;
      min-width: 0;
      color: #1f2937;
      font-weight: 700;
      word-break: break-word;
      font-size: 0.88rem;
    }

    .line-qty {
      color: #059669;
      font-weight: 900;
    }

    .line-status-chip {
      font-size: 0.65rem;
      font-weight: 800;
      padding: 0.12rem 0.42rem;
      border-radius: 0.6rem;
      display: inline-flex;
      align-items: center;
      gap: 0.2rem;
      flex-shrink: 0;
      letter-spacing: 0.02em;
    }

    .chip-ready {
      background: #10b981;
      color: #ffffff;
      box-shadow: 0 2px 5px rgba(16, 185, 129, 0.3);
    }

    .btn-action-retirar {
      border: none;
      cursor: pointer;
      transition: transform 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
    }

    .btn-action-retirar:hover {
      transform: scale(1.06);
      background: #059669;
      box-shadow: 0 4px 10px rgba(16, 185, 129, 0.4);
    }

    .chip-pending {
      background: #fef3c7;
      color: #92400e;
      border: 1px solid #fde68a;
    }

    .chip-delivered {
      background: #e0e7ff;
      color: #3730a3;
      border: 1px solid #c7d2fe;
    }

    .order-state {
      position: absolute;
      left: 1rem;
      bottom: 1rem;
    }

    .card-body {
      display: grid;
      gap: 0.25rem;
    }

    .card-body--mock {
      justify-items: start;
    }

    .card-client {
      font-size: 1.05rem;
      color: #ffffff;
      line-height: 1.2;
      font-weight: 900;
    }

    .card-document {
      display: inline-flex;
      align-items: center;
      min-height: 28px;
      padding: 0.18rem 0.7rem;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.97);
      color: #7b7e88;
      font-size: 0.78rem;
      font-weight: 800;
      border: 1px solid rgba(59, 87, 150, 0.35);
    }

    .card-status-pill {
      width: fit-content;
      max-width: 100%;
    }

    .line-note-input {
      margin-top: 0.35rem;
      display: grid;
      gap: 0.2rem;
      color: #667094;
      font-size: 0.8rem;
    }

    .client-hint {
      color: #2d6a46;
      font-weight: 700;
      margin-top: -0.2rem;
    }

    .line-note-input input {
      padding: 0.45rem 0.55rem;
    }

    .line-note-view {
      color: #54608a;
      font-weight: 600;
      margin-top: 0.22rem;
    }

    .status-pill {
      display: inline-block;
      padding: 0.2rem 0.55rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 700;
      border: 1px solid transparent;
      background: #ecefff;
      color: #545cb0;
    }

    .status-pill.PENDIENTE {
      background: #ffe7d3;
      color: #a86035;
      border-color: #ffd2b1;
    }

    .status-pill.EN_PROCESO {
      background: #ffe7d9;
      color: #c7684d;
      border-color: #f7c8b8;
    }

    .status-pill.LISTO {
      background: #d8ebff;
      color: #3170b6;
      border-color: #b8d8ff;
    }

    .status-pill.ENTREGADO {
      background: #c8f0d0;
      color: #247449;
      border-color: #a8e1b5;
    }

    .status-pill.COBRADO {
      background: #eee3ff;
      color: #6b43c3;
      border-color: #d2bfff;
    }

    .empty-state {
      margin: 0;
      color: #6e769a;
      padding: 0.7rem;
      border-radius: 0.75rem;
      background: #f7f9ff;
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

    .overlay-front {
      z-index: 240;
    }

    .modal {
      width: min(1100px, 100%);
      max-height: 92vh;
      overflow: auto;
      background: #ffffff;
      border: 1px solid #e5eaff;
      border-radius: 1rem;
      padding: 1rem;
      display: grid;
      gap: 0.9rem;
    }

    .create-order-modal {
      width: min(1100px, 100%);
      border-radius: 1.15rem;
      border: 1px solid #d9e3fb;
      padding: 1.1rem 1.15rem 6rem;
      box-shadow: 0 18px 40px rgba(42, 57, 106, 0.16);
    }

    .create-order-modal--products {
      width: min(1300px, 100%);
    }

    .detail-modal {
      width: min(760px, 100%);
    }

    .confirm-modal {
      width: min(680px, 100%);
    }

    .modal-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.7rem;
    }

    .modal-head--wizard h2 {
      margin: 0;
      color: #2c2c2c;
      font-size: 1.15rem;
      font-weight: 900;
      letter-spacing: -0.02em;
    }

    .modal-close-btn {
      min-height: 40px;
      padding: 0.45rem 0.9rem;
      border-radius: 0.55rem;
      border-color: #9aa6ba;
      color: #4e5565;
      font-size: 0.88rem;
      font-weight: 700;
    }

    .detail-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.7rem;
    }

    .detail-actions {
      display: flex;
      gap: 0.6rem;
      margin-top: 0.4rem;
    }

    .bill-box {
      margin-top: 0.6rem;
      border: 1px solid #dfe5ff;
      border-radius: 0.9rem;
      padding: 0.75rem;
      background: linear-gradient(140deg, #f7faff 0%, #eef3ff 100%);
      display: grid;
      gap: 0.45rem;
    }

    .bill-box h3 {
      margin: 0 0 0.3rem;
      color: #485282;
      font-size: 0.95rem;
    }

    .bill-row {
      display: flex;
      justify-content: space-between;
      gap: 0.6rem;
      color: #5d678f;
    }

    .bill-row.total {
      margin-top: 0.25rem;
      padding-top: 0.45rem;
      border-top: 1px dashed #cfd8ff;
      color: #3f4977;
    }

    .bill-row.muted {
      color: #8891b0;
    }

    .bill-tip-toggle {
      display: flex;
      align-items: center;
      gap: 0.55rem;
      margin-top: 0.25rem;
      color: #42507e;
      font-weight: 700;
    }

    .bill-tip-toggle input {
      width: 18px;
      height: 18px;
      accent-color: #0d6efd;
    }

    .bill-tip-field {
      display: grid;
      gap: 0.35rem;
      margin-top: 0.15rem;
      color: #52608d;
      font-size: 0.82rem;
      font-weight: 700;
    }

    .bill-tip-field input {
      min-height: 38px;
      max-width: 140px;
      border-radius: 0.75rem;
      border: 1px solid #ccd8ff;
      padding: 0.35rem 0.75rem;
      font-weight: 700;
      color: #4e587f;
      background: #ffffff;
    }

    .verification-pending-note {
      margin: 0.35rem 0 0;
      padding: 0.65rem 0.8rem;
      border-radius: 0.8rem;
      background: #fff4d8;
      color: #8b6500;
      font-weight: 700;
    }

    .account-panel small {
      color: #6c7597;
      font-weight: 600;
    }

    .account-inline-box {
      border: none;
      border-radius: 1.3rem;
      padding: 0.8rem 0.95rem;
      background: linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-primary-dark) 100%);
      display: grid;
      gap: 0.45rem;
      box-shadow: 0 14px 26px rgba(8, 214, 32, 0.18);
    }

    .account-inline-box h3 {
      margin: 0;
      font-size: 0.92rem;
      color: #ffffff;
      font-weight: 900;
    }

    .account-inline-box input {
      min-height: 30px;
      max-width: 220px;
      padding: 0.2rem 0.68rem;
      border-radius: 999px;
      border: none;
      font-size: 0.78rem;
      font-weight: 700;
      color: #63706c;
      background: rgba(255, 255, 255, 0.96);
    }

    .account-inline-box--results {
      margin-top: 0.15rem;
      background: #f9fbff;
      box-shadow: none;
      border: 1px solid #e3e9ff;
    }

    .account-inline-box--results h3 {
      color: #3b4671;
    }

    .compact-account-list {
      margin-top: 0.1rem;
    }

    .account-search-grid {
      margin-top: 0.45rem;
      display: grid;
      grid-template-columns: minmax(220px, 320px) auto;
      gap: 0.75rem;
      align-items: end;
    }

    .grouped-account-list strong {
      color: #364063;
    }

    .stepper {
      display: grid;
      grid-template-columns: repeat(4, minmax(120px, 1fr));
      gap: 0.5rem;
    }

    .order-stepper {
      gap: 0.45rem;
    }

    .step {
      background: #ffffff;
      color: #b1922b;
      border: 3px solid #6c757d;
      border-radius: 0.8rem;
      min-height: 58px;
      padding: 0.75rem 0.8rem;
      font-weight: 700;
      font-size: 0.96rem;
    }

    .order-step {
      min-height: 38px;
      border-width: 2px;
      border-color: #7d6415;
      background: #c39b1b;
      color: #fffef9;
      border-radius: 0.7rem;
      font-size: 0.82rem;
      font-weight: 800;
      padding: 0.4rem 0.5rem;
      box-shadow: inset 0 -1px 0 rgba(91, 68, 11, 0.24);
    }

    .step.active {
      background: #b28d1b;
      color: #fff;
      border-color: #7a5f10;
    }

    .wizard-step {
      display: grid;
      gap: 0.75rem;
    }

    .wizard-step--products {
      align-content: start;
      gap: 0.55rem;
    }

    .wizard-step button,
    .detail-actions button,
    .product-picker-actions button {
      min-height: 54px;
      padding: 0.75rem 1rem;
      font-size: 0.98rem;
      font-weight: 700;
      border-radius: 0.8rem;
    }

    .step-title {
      margin: 0;
      color: #61698f;
    }

    .step-title--context,
    .step-title--restaurant {
      color: #6b79a3;
      font-size: 0.86rem;
      font-weight: 600;
    }

    .step-title--context strong,
    .step-title--restaurant strong {
      color: inherit;
    }

    .restaurant-switch {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.9rem;
    }

    .restaurant-btn {
      background: #ffffff;
      color: #495057;
      border: 1px solid #6c757d;
      border-radius: 1.1rem;
      padding: 1.2rem 1rem;
      min-height: 92px;
      font-size: 1.04rem;
      font-weight: 800;
      box-shadow: none;
    }

    .restaurant-btn.active {
      background: #0d6efd;
      color: #fff;
      border-color: #0d6efd;
      transform: translateY(-1px);
    }

    .summary {
      margin-top: 0;
      color: #6e769a;
    }

    .catalog-sections {
      display: grid;
      gap: 1rem;
    }

    .catalog-sections--products {
      gap: 0.7rem;
      margin-top: 0.2rem;
    }

    .product-search-field {
      display: grid;
      gap: 0.3rem;
      color: #5f6990;
      font-weight: 700;
    }

    .product-search-field--wizard {
      max-width: 460px;
      color: #53638f;
      font-size: 0.95rem;
    }

    .product-search-field input {
      min-height: 46px;
      border-radius: 0.8rem;
      border: 1px solid #d8e4ff;
      background: #ffffff;
      padding: 0.62rem 0.74rem;
      font-size: 0.92rem;
    }

    .product-search-field--wizard input {
      min-height: 36px;
      border-radius: 0.85rem;
      border-color: #d4def7;
      padding: 0.55rem 0.8rem;
      font-size: 0.9rem;
    }

    .catalog-section {
      display: grid;
      gap: 0.6rem;
    }

    .catalog-section h4 {
      margin: 0;
      color: #31406d;
      font-size: 1.1rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .category-card {
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      text-align: left;
      padding: 0.8rem 0.85rem;
      border-radius: 0.95rem;
      border: 1px solid #dbe3fb;
      background: #ffffff;
      box-shadow: none;
      transition: border-color 0.15s ease, background-color 0.15s ease;
    }

    .category-card:hover {
      border-color: #c6d4f4;
      background: #fcfdff;
      box-shadow: none;
    }

    .category-card--selected {
      border-color: #8b6d12;
      background: #9a7810;
      color: #f7fbff;
    }

    .category-card--selected h4,
    .category-card--selected small,
    .category-card--selected span {
      color: #dbe6ff;
    }

    .category-card small {
      display: block;
      margin-top: 0.25rem;
      color: #6a7499;
      font-weight: 600;
    }

    .category-card-meta {
      display: grid;
      gap: 0.35rem;
      text-align: right;
    }

    .category-card-meta span {
      color: #5e6992;
      font-size: 0.82rem;
      font-weight: 700;
    }

    .category-card-meta strong {
      color: #149f99;
      font-size: 1rem;
    }

    .category-card--selected .category-card-meta strong {
      color: #2ef0de;
    }

    .product-picker-modal {
      width: min(1120px, 100%);
      gap: 1rem;
      padding: 1.55rem 1.5rem 1.2rem;
      max-height: 92vh;
      overflow: hidden;
      grid-template-rows: auto 1fr auto;
      min-height: 0;
      border-radius: 1.35rem;
      border: 1px solid #e3e3e3;
      box-shadow: 0 18px 42px rgba(44, 44, 44, 0.16);
    }

    .product-picker-modal--inline {
      width: 100%;
      gap: 0.9rem;
      padding: 0;
      max-height: none;
      overflow: visible;
      border: none;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
      min-width: 0;
    }

    .product-picker-header {
      display: grid;
      gap: 0.85rem;
      background: #ffffff;
      border-bottom: none;
      padding-bottom: 0.2rem;
    }

    .product-picker-topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }

    .product-picker-topbar h2 {
      margin: 0;
      color: #090909;
      font-size: clamp(2rem, 3vw, 2.8rem);
      line-height: 0.95;
      letter-spacing: -0.05em;
      font-weight: 900;
    }

    .picker-nav-btn {
      width: 44px;
      min-width: 44px;
      min-height: 44px;
      padding: 0;
      border-radius: 999px;
      border: 1px solid #8d6b09;
      background: #9c7608;
      color: #fffdf6;
      display: grid;
      place-items: center;
      box-shadow: none;
    }

    .product-picker-toolbar {
      display: grid;
      gap: 0.95rem;
      padding-bottom: 0.1rem;
    }

    .product-picker-toolbar--menu {
      grid-template-columns: 1fr;
      align-items: start;
    }

    .product-picker-toolbar-actions {
      display: flex;
      gap: 0.65rem;
      justify-content: flex-end;
      flex-wrap: wrap;
    }

    .picker-btn {
      min-height: 46px;
      padding: 0.58rem 1.05rem;
      border-radius: 0.5rem;
      font-size: 0.95rem;
      font-weight: 700;
      border: 1px solid transparent;
      box-shadow: none;
    }

    .picker-btn-primary {
      background: #0d6efd;
      border-color: #0d6efd;
      color: #ffffff;
    }

    .picker-btn-primary:hover {
      background: #0b5ed7;
      border-color: #0a58ca;
      color: #ffffff;
    }

    .picker-btn-secondary {
      background: #ffffff;
      border-color: #6c757d;
      color: #495057;
    }

    .picker-btn-secondary:hover {
      background: #f8f9fa;
      border-color: #5c636a;
      color: #495057;
    }

    .product-picker-search input {
      min-height: 46px;
    }

    .product-picker-search--menu {
      max-width: 620px;
      display: flex;
      align-items: center;
      gap: 0.55rem;
      padding: 0 0.7rem;
      border-radius: 0.55rem;
      background: #dddddd;
    }

    .product-picker-search--menu input {
      min-height: 32px;
      border: none;
      background: transparent;
      color: #444444;
      padding: 0.45rem 0;
      font-size: 0.8rem;
      font-weight: 600;
    }

    .product-picker-search--menu i {
      color: #8d8d8d;
      font-size: 0.85rem;
      flex: 0 0 auto;
    }

    .product-category-rail {
      display: flex;
      gap: 0.9rem;
      overflow-x: auto;
      padding-bottom: 0.15rem;
    }

    .menu-category-chip {
      min-height: 44px;
      min-width: max-content;
      padding: 0.6rem 1rem;
      border-radius: 0.65rem;
      border: 2px solid #d7d7d7;
      background: #ffffff;
      color: #191919;
      display: inline-flex;
      align-items: center;
      gap: 0.55rem;
      font-size: 0.92rem;
      font-weight: 800;
      box-shadow: none;
      white-space: nowrap;
    }

    .menu-category-chip i {
      font-size: 1.15rem;
    }

    .menu-category-chip.active {
      background: #d9a912;
      border-color: #d9a912;
      color: #fffef7;
    }

    .category-products-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(205px, 1fr));
      gap: 1.1rem 0.9rem;
      overflow: visible;
      min-height: 0;
      padding-right: 0;
      padding-top: 0.5rem;
      padding-bottom: 0.35rem;
      align-content: start;
    }

    /* -- Papa y Son: Grid de tarjetas de categoría -- */
    .papa-categories-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 1rem;
      padding: 0.5rem 0;
      align-content: start;
    }

    .papa-category-card {
      display: grid;
      gap: 0.35rem;
      padding: 1.2rem 1rem;
      border-radius: 1.1rem;
      border: 2px solid #e2e2e2;
      background: #ffffff;
      text-align: center;
      cursor: pointer;
      transition: border-color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease;
      position: relative;
    }

    .papa-category-card:hover {
      border-color: #c9a81a;
      transform: translateY(-2px);
      box-shadow: 0 6px 18px rgba(201, 168, 26, 0.12);
    }

    .papa-category-card:active {
      transform: translateY(0);
    }

    .papa-category-card-icon {
      display: grid;
      place-items: center;
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: linear-gradient(135deg, #f7efc0 0%, #e8d880 100%);
      margin: 0 auto 0.3rem;
    }

    .papa-category-card-icon i {
      font-size: 1.45rem;
      color: #7a6310;
    }

    .papa-category-card h4 {
      margin: 0;
      font-size: 1rem;
      font-weight: 800;
      color: #1e1e1e;
      line-height: 1.2;
    }

    .papa-category-card small {
      display: block;
      color: #777777;
      font-size: 0.82rem;
      font-weight: 600;
    }

    .papa-category-badge {
      display: inline-block;
      margin-top: 0.3rem;
      padding: 0.2rem 0.6rem;
      border-radius: 2rem;
      background: #9a7810;
      color: #fffef7;
      font-size: 0.75rem;
      font-weight: 800;
      letter-spacing: 0.02em;
    }

    /* -- Papa y Son: Encabezado de productos con flecha de regreso -- */
    .papa-products-header {
      display: flex;
      align-items: center;
      gap: 0.8rem;
      margin-bottom: 0.5rem;
    }

    .papa-back-btn {
      min-height: 38px;
      padding: 0.35rem 0.8rem !important;
      border-radius: 0.6rem !important;
      font-size: 0.88rem !important;
      font-weight: 700 !important;
      background: #f3f3f3 !important;
      color: #333333 !important;
      border: 1px solid #d5d5d5 !important;
      transition: background 0.15s ease, border-color 0.15s ease;
    }

    .papa-back-btn:hover {
      background: #e7e7e7 !important;
      border-color: #bbb !important;
    }

    .papa-products-header .menu-products-title {
      margin: 0;
      font-size: 1.15rem;
      color: #1e1e1e;
    }

    .papa-product-search {
      margin-bottom: 0.5rem;
    }

    .menu-layout--papa {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 280px;
      gap: 1.2rem;
      min-height: 460px;
    }

    .product-picker-card {
      display: grid;
      gap: 0.6rem;
      padding: 0.8rem 0.7rem 0.9rem;
      border-radius: 1rem;
      border: 4px solid #dfdfdf;
      background: #ffffff;
      box-shadow: none;
    }

    .product-picker-image {
      width: 100%;
      height: 122px;
      object-fit: cover;
      border-radius: 0.95rem;
      border: none;
      background: #f6f6f6;
    }

    .product-picker-image-fallback {
      width: 100%;
      height: 122px;
      border-radius: 0.95rem;
      border: none;
      background: #f0f0f0;
      color: #999999;
      display: grid;
      place-items: center;
      font-size: 1.6rem;
    }

    .product-picker-copy {
      display: grid;
      gap: 0.12rem;
    }

    .product-picker-head {
      display: flex;
      justify-content: space-between;
      gap: 0.8rem;
      align-items: flex-start;
    }

    .product-picker-head--menu {
      align-items: baseline;
      gap: 0.5rem;
    }

    .product-picker-head--menu strong {
      color: #171717;
      font-size: 0.96rem;
      font-weight: 900;
      line-height: 1.1;
    }

    .product-picker-head--menu span {
      color: #1a1a1a;
      font-size: 0.95rem;
      font-weight: 500;
      white-space: nowrap;
    }

    .product-picker-copy small {
      color: #2f2f2f;
      font-size: 0.78rem;
      font-weight: 500;
      line-height: 1.2;
    }

    .product-picker-head small {
      display: block;
      margin-top: 0.22rem;
      color: #6a7499;
      font-weight: 600;
    }

    .product-picker-head span {
      color: #34406c;
      font-weight: 800;
    }

    .quantity-row {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 0.9rem;
      min-height: 24px;
      padding: 0;
      margin-top: 0.15rem;
      border-radius: 0.55rem;
      background: #d9a10b;
      color: #ffffff;
    }

    .quantity-row strong {
      min-width: 1.5rem;
      text-align: center;
      color: #fffef7;
      font-size: 0.9rem;
      font-weight: 800;
    }

    .quantity-btn {
      width: 34px;
      height: 24px;
      min-height: 24px;
      border: none;
      border-radius: 0.55rem;
      background: transparent;
      color: #fffef7;
      font-size: 1.15rem;
      font-weight: 800;
      display: grid;
      place-items: center;
      box-shadow: none;
      padding: 0;
    }

    .product-note-toggle {
      min-height: 24px;
      padding: 0.2rem 0.9rem;
      justify-self: center;
      border: none;
      border-radius: 0.5rem;
      background: #e7e7e7;
      color: #d59d07;
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.04em;
    }

    .picker-note-input {
      gap: 0.35rem;
      font-size: 0.85rem;
      margin-top: 0;
      color: #7c7c7c;
    }

    .picker-note-input input {
      min-height: 34px;
      border-radius: 0.55rem;
      border: 1px solid #dddddd;
      padding: 0.45rem 0.6rem;
      font-size: 0.8rem;
    }

    .product-picker-actions {
      justify-content: flex-end;
      gap: 0.8rem;
    }

    .product-picker-footer {
      display: flex;
      justify-content: flex-end;
      gap: 0.7rem;
      padding-top: 0.4rem;
      border-top: 1px solid #ededed;
    }

    /* ══════════════════════════════════════════
       Layout de 3 columnas del menú (paso 4)
       ══════════════════════════════════════════ */

    .menu-layout {
      display: grid;
      grid-template-columns: 190px minmax(0, 1fr) 280px;
      gap: 0.85rem;
      min-height: 460px;
    }

    /* -- Sidebar de categorías (izquierda) -- */
    .menu-category-sidebar {
      display: grid;
      align-content: start;
      gap: 0.65rem;
      position: sticky;
      top: 0;
      max-height: calc(100vh - 200px);
      overflow-y: auto;
      padding-right: 0.25rem;
    }

    .menu-search-sidebar {
      border-radius: 0.65rem;
      max-width: 100%;
    }

    .menu-search-sidebar input {
      min-height: 28px;
      font-size: 0.78rem;
    }

    .menu-category-nav {
      display: grid;
      gap: 0.3rem;
    }

    .menu-category-item {
      display: flex;
      align-items: center;
      gap: 0.55rem;
      width: 100%;
      min-height: 42px;
      padding: 0.5rem 0.7rem;
      border-radius: 0.65rem;
      border: 2px solid transparent;
      background: transparent;
      color: #4a4a4a;
      font-size: 0.82rem;
      font-weight: 700;
      text-align: left;
      box-shadow: none;
      transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
      cursor: pointer;
    }

    .menu-category-item:hover {
      background: #f5f0e0;
      border-color: #efe6c8;
    }

    .menu-category-item.active {
      background: #d9a912;
      border-color: #d9a912;
      color: #fffef7;
    }

    .menu-category-item i {
      font-size: 1.05rem;
      flex: 0 0 auto;
    }

    .menu-category-item-label {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .menu-category-item-count {
      min-width: 22px;
      height: 22px;
      display: grid;
      place-items: center;
      border-radius: 999px;
      background: rgba(0, 0, 0, 0.06);
      font-size: 0.72rem;
      font-weight: 800;
      flex: 0 0 auto;
    }

    .menu-category-item.active .menu-category-item-count {
      background: rgba(255, 255, 255, 0.22);
      color: #fffef7;
    }

    /* -- Grid de productos (centro) -- */
    .menu-products-main {
      display: grid;
      align-content: start;
      gap: 0.7rem;
      min-width: 0;
    }

    .menu-products-topbar {
      display: flex;
      align-items: baseline;
      gap: 0.65rem;
    }

    .menu-products-title {
      margin: 0;
      color: #090909;
      font-size: clamp(1.5rem, 2.5vw, 2rem);
      font-weight: 900;
      letter-spacing: -0.03em;
      line-height: 1;
    }

    .menu-products-subtitle {
      color: #8b8b8b;
      font-size: 0.88rem;
      font-weight: 600;
    }

    /* Chips de categoría para móvil (ocultos en desktop) */
    .menu-category-rail-mobile {
      display: none;
      gap: 0.55rem;
      overflow-x: auto;
      padding-bottom: 0.1rem;
    }

    /* -- Sidebar de resumen de orden (derecha) -- */
    .menu-order-sidebar {
      display: grid;
      grid-template-rows: auto 1fr auto;
      gap: 0.5rem;
      position: sticky;
      top: 0;
      max-height: calc(100vh - 200px);
      padding: 0.85rem 0.8rem;
      border-radius: 1rem;
      border: 1px solid #dce4fb;
      background: #ffffff;
      overflow: hidden;
    }

    .menu-order-sidebar-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 0.45rem;
      border-bottom: 1px solid #e8edf8;
    }

    .menu-order-sidebar-head h3 {
      margin: 0;
      color: #4f5782;
      font-size: 0.92rem;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    .menu-order-sidebar-head h3 i {
      font-size: 1rem;
      color: #d9a912;
    }

    .menu-order-sidebar-badge {
      min-width: 24px;
      height: 24px;
      display: grid;
      place-items: center;
      border-radius: 999px;
      background: #d9a912;
      color: #fffef7;
      font-size: 0.72rem;
      font-weight: 800;
    }

    .menu-order-list {
      display: grid;
      gap: 0.3rem;
      align-content: start;
      overflow-y: auto;
      max-height: 100%;
      padding-right: 0.15rem;
    }

    .menu-order-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.4rem;
      padding: 0.45rem 0.35rem;
      border-radius: 0.55rem;
      border: none;
      background: transparent;
      transition: background 0.12s ease;
    }

    .menu-order-item:hover {
      background: #f8f9ff;
    }

    .menu-order-item-info {
      display: grid;
      gap: 0.05rem;
      min-width: 0;
    }

    .menu-order-item-info strong {
      font-size: 0.8rem;
      font-weight: 800;
      color: #2c2c2c;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .menu-order-item-info small {
      font-size: 0.72rem;
      font-weight: 600;
      color: #8a8a8a;
    }

    .menu-order-item-actions {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      flex: 0 0 auto;
    }

    .menu-order-item-actions span {
      font-size: 0.82rem;
      font-weight: 800;
      color: #303030;
      white-space: nowrap;
    }

    .menu-order-remove-btn {
      width: 26px;
      height: 26px;
      min-height: 26px;
      padding: 0;
      border: none;
      border-radius: 0.4rem;
      background: #f0f0f0;
      color: #c94b4b;
      font-size: 0.68rem;
      display: grid;
      place-items: center;
      box-shadow: none;
      cursor: pointer;
      transition: background 0.12s ease;
    }

    .menu-order-remove-btn:hover {
      background: #fde8e8;
    }

    .menu-order-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.45rem;
      padding: 1.8rem 0.5rem;
      color: #b0b0b0;
      border: none;
      background: transparent;
    }

    .menu-order-empty i {
      font-size: 1.8rem;
    }

    .menu-order-empty span {
      font-size: 0.82rem;
      font-weight: 600;
    }

    .menu-order-sidebar-footer {
      border-top: 1px solid #e8edf8;
      padding-top: 0.5rem;
    }

    .menu-order-total {
      margin: 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .menu-order-total span {
      color: #6e769a;
      font-size: 0.85rem;
      font-weight: 700;
    }

    .menu-order-total strong {
      color: #1a1a1a;
      font-size: 1.05rem;
    }

    /* -- Barra flotante con total -- */
    .floating-bar-total {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0;
      padding: 0 1rem;
    }

    .floating-bar-total small {
      color: #6e769a;
      font-size: 0.68rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .floating-bar-total strong {
      color: #1a1a1a;
      font-size: 1rem;
      font-weight: 900;
    }

    .modal-body {
      display: grid;
      gap: 1.1rem;
      grid-template-columns: 1.2fr 1fr;
      align-items: start;
    }

    .modal-body.with-floating-bar {
      grid-template-columns: 1fr;
      column-gap: 0.9rem;
      padding-bottom: 6rem;
    }

    .modal-body.table-selection-mode {
      grid-template-columns: 1fr;
    }

    .modal-body.table-selection-mode .form-grid,
    .modal-body.table-selection-mode .wizard-step {
      min-width: 0;
    }

    .floating-submit-bar {
      position: fixed;
      left: 50%;
      bottom: max(0.8rem, env(safe-area-inset-bottom));
      transform: translateX(-50%);
      width: min(1020px, calc(100vw - 1.5rem));
      z-index: 230;
      margin-top: 0;
      padding: 0.65rem;
      border: 1px solid #dfe6ff;
      background: rgba(255, 255, 255, 0.99);
      backdrop-filter: blur(6px);
      border-radius: 0.95rem;
      box-shadow: 0 14px 28px rgba(68, 82, 132, 0.2);
      display: flex;
      justify-content: flex-end;
      gap: 0.6rem;
    }

    .floating-submit-bar--products {
      width: min(820px, calc(100vw - 2rem));
      padding: 0.45rem 0.6rem;
      border-radius: 1rem;
      border-color: #dce4f7;
      box-shadow: 0 10px 24px rgba(42, 57, 106, 0.12);
    }

    .next-qr-box {
      margin-top: 0.4rem;
      border: 1px solid #dfe6ff;
      border-radius: 0.8rem;
      padding: 0.65rem;
      background: #f8faff;
      display: grid;
      gap: 0.45rem;
      justify-items: center;
    }

    .next-qr-box h4 {
      margin: 0;
      color: #4a5687;
      font-size: 0.9rem;
      justify-self: start;
    }

    .next-qr-box img {
      width: min(100%, 220px);
      border-radius: 0.7rem;
      border: 1px solid #d5deff;
      background: #ffffff;
    }

    .next-qr-box small {
      color: #67739f;
      text-align: center;
    }

    .resume-panel {
      border: 1px solid #e5eaff;
      border-radius: 1rem;
      padding: 1rem;
      background: #fbfcff;
    }

    .resume-panel--products {
      min-height: 100px;
      max-width: 350px;
      align-content: start;
      margin-left: auto;
      border-color: #dce4fb;
      border-radius: 1rem;
      background: #ffffff;
      position: sticky;
      top: 0.25rem;
      box-shadow: none;
      padding: 0.95rem 1rem;
    }

    .resume-panel h3 {
      margin: 0 0 0.6rem;
      color: #4f5782;
      font-size: 1rem;
    }

    .resume-list {
      display: grid;
      gap: 0.55rem;
      align-content: start;
    }

    .resume-list li {
      border: none;
      border-radius: 0;
      background: transparent;
      padding: 0;
      color: #4f5567;
    }

    .resume-total {
      margin: 0;
      padding-top: 0.5rem;
      color: #303030;
      font-size: 0.98rem;
      border-top: 1px solid #e3e8f4;
    }

    .next-layout-picker {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 190px;
      gap: 1rem;
      margin-top: 0.8rem;
      padding: 1rem;
      border-radius: 1.4rem;
      border: 1px solid #ddd2ab;
      background: linear-gradient(180deg, #d1c193 0%, #c9ba8d 100%);
    }

    .next-layout-picker--step1 {
      grid-template-columns: minmax(0, 1.4fr) 220px;
      min-height: 620px;
      padding: 1.2rem;
    }

    .next-layout-board {
      min-width: 0;
      padding: 0.25rem;
      border-radius: 1.2rem;
      border: 1px solid rgba(126, 102, 37, 0.18);
      background: rgba(193, 175, 125, 0.18);
    }

    .next-layout-grid {
      --table-columns: 6;
      display: grid;
      grid-template-columns: repeat(var(--table-columns), minmax(76px, 1fr));
      grid-auto-rows: 96px;
      gap: 0.8rem;
      align-items: stretch;
    }

    .next-layout-picker--step1 .next-layout-grid {
      grid-template-columns: repeat(var(--table-columns), minmax(94px, 1fr));
      grid-auto-rows: 112px;
      gap: 0.95rem;
    }

    .next-table-btn {
      min-height: 96px;
      border-radius: 2rem;
      border: 2px solid #f0ede7;
      background: #ffffff;
      color: #161616;
      font-size: 1rem;
      font-weight: 800;
      box-shadow: 0 8px 16px rgba(88, 68, 19, 0.08);
    }

    .next-layout-picker--step1 .next-table-btn {
      min-height: 112px;
      font-size: 1.12rem;
      border-radius: 2.1rem;
    }

    .next-table-btn:hover {
      background: #fffdf8;
      border-color: #ead8a4;
      box-shadow: 0 10px 18px rgba(88, 68, 19, 0.12);
    }

    .next-table-btn.active {
      background: #d9a912;
      border-color: #d9a912;
      color: #fffdf3;
      box-shadow: none;
    }

    .next-table-btn.occupied {
      background: #6e550b;
      border-color: #ca9f1f;
      color: #ffffff;
      box-shadow: inset 0 0 0 1px rgba(142, 38, 52, 0.08);
    }

    .next-table-btn.occupied.active {
      background: #d9a912;
      border-color: #d9a912;
      color: #fffdf3;
    }

    .next-table-btn.occupied-others {
      background: #c94b4b;
      border-color: #a73939;
      color: #ffffff;
      cursor: not-allowed;
      box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.2);
    }

    .next-layout-sidebar {
      display: grid;
      grid-template-rows: auto 1fr;
      gap: 1rem;
    }

    .next-layout-picker--step1 .next-layout-sidebar {
      gap: 1.2rem;
    }

    .next-area-switch {
      display: grid;
      gap: 0.6rem;
    }

    .next-area-btn {
      min-height: 48px;
      border-radius: 999px;
      border: 2px solid #f7f3ea;
      background: #ffffff;
      color: #1f1f1f;
      font-size: 0.95rem;
      font-weight: 800;
      box-shadow: none;
    }

    .next-area-btn:hover {
      background: #fffdf7;
      color: #1f1f1f;
      border-color: #ebd798;
      box-shadow: none;
      transform: none;
    }

    .next-area-btn.active {
      background: #d9a912;
      border-color: #d9a912;
      color: #fffef8;
    }

    .next-layout-actions {
      display: grid;
      align-content: end;
      gap: 0.9rem;
    }

    .next-layout-hint {
      margin: 0;
      color: #5b4d21;
      font-weight: 800;
    }

    .next-layout-footer {
      justify-content: stretch;
    }

    .next-layout-footer > * {
      flex: 1;
    }

    /* ── Tablet vertical: categorías pasan a chips horizontales, sidebar orden se oculta (usa barra flotante) ── */
    @media (max-width: 1024px) {
      .menu-layout {
        grid-template-columns: 1fr;
        min-height: auto;
      }

      .menu-category-sidebar {
        display: none;
      }

      .menu-category-rail-mobile {
        display: flex;
      }

      .menu-order-sidebar {
        display: none;
      }

      .menu-layout--papa {
        grid-template-columns: 1fr;
        min-height: auto;
      }

      .menu-layout--papa .menu-order-sidebar {
        display: grid;
        max-height: none;
        position: static;
      }
    }

    @media (max-width: 760px) {
      .page {
        padding-top: 4.6rem;
      }

      .orders-page-header {
        grid-template-columns: 1fr;
      }

      .orders-search-field {
        grid-column: auto;
      }

      .page-header h1,
      .head-row h2 {
        font-size: clamp(1.85rem, 7vw, 2.4rem);
      }

      .orders-topbar {
        grid-template-columns: 1fr 1fr;
        align-items: start;
        gap: 0.8rem;
      }

      .orders-segmented-control {
        width: 100%;
      }

      .stepper {
        grid-template-columns: 1fr 1fr;
      }

      .restaurant-switch {
        grid-template-columns: 1fr;
      }

      .modal-body {
        grid-template-columns: 1fr;
      }

      .create-order-modal {
        padding-bottom: 6.75rem;
      }

      .product-picker-toolbar {
        grid-template-columns: 1fr;
      }

      .product-category-rail {
        gap: 0.55rem;
      }

      .product-picker-toolbar-actions {
        width: 100%;
      }

      .product-picker-toolbar-actions button {
        flex: 1;
      }

      .floating-submit-bar {
        left: 50%;
        bottom: max(0.75rem, env(safe-area-inset-bottom));
        width: calc(100vw - 1rem);
        transform: translateX(-50%);
        display: grid;
      }

      .product-picker-modal {
        padding: 1rem 0.9rem;
      }

      .category-products-grid {
        grid-template-columns: 1fr 1fr;
      }

      .comanda-cta,
      .account-inline-box--top {
        width: 100%;
      }

      .comanda-cta {
        min-height: 64px;
        font-size: 0.96rem;
        min-width: 0;
      }

      .orders-toolbar {
        justify-content: flex-start;
      }

      .next-layout-picker {
        grid-template-columns: 1fr;
      }

      .next-layout-picker--step1 {
        min-height: 0;
      }

      .next-layout-grid {
        grid-template-columns: repeat(var(--table-columns), minmax(58px, 1fr));
        grid-auto-rows: 76px;
        gap: 0.55rem;
      }

      .next-layout-picker--step1 .next-layout-grid {
        grid-template-columns: repeat(var(--table-columns), minmax(58px, 1fr));
        grid-auto-rows: 76px;
        gap: 0.55rem;
      }

      .next-table-btn {
        min-height: 76px;
        border-radius: 1.4rem;
      }

      .next-layout-picker--step1 .next-table-btn {
        min-height: 76px;
        font-size: 0.98rem;
        border-radius: 1.4rem;
      }

    @media (max-width: 640px) {
      .category-products-grid {
        grid-template-columns: 1fr;
      }
    }

      .next-layout-sidebar {
        grid-template-rows: auto;
      }

      .next-area-switch {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .comanda-cta .btn-content {
        justify-content: center;
      }

      .account-inline-box--top {
        padding: 0.7rem 0.8rem 0.8rem;
      }

      .account-inline-box h3 {
        font-size: 0.82rem;
      }

      .account-inline-box input {
        max-width: 100%;
        min-height: 32px;
      }

      .order-card {
        padding: 0.95rem 1rem 1.2rem;
        border-radius: 1.35rem;
        min-height: 240px;
      }

      .order-avatar {
        width: 72px;
        height: 72px;
        font-size: 2.2rem;
      }

      .order-avatar--board {
        width: 50px;
        height: 50px;
        font-size: 1.4rem;
      }

      .card-client,
      .order-client-name {
        font-size: 0.98rem;
      }

      .card-document {
        min-height: 30px;
        font-size: 0.8rem;
      }

      .order-client-meta {
        padding-right: 0;
      }

      .wizard-step button,
      .detail-actions button,
      .product-picker-actions button {
        min-height: 56px;
        font-size: 1rem;
      }

      .account-search-grid {
        grid-template-columns: 1fr;
      }
    }
  `
})
export class OrdersPageComponent {
  private readonly state = inject(AppStateService);
  private readonly destroyRef = inject(DestroyRef);
  private readyOrderIds = new Set<string>();
  private readyTrackerPrimed = false;
  private readonly pollIntervalMs = 3000;
  private pendingReadySound = false;
  private readonly unlockSoundHandler = () => {
    if (!this.pendingReadySound) {
      return;
    }

    this.pendingReadySound = false;
    void this.playReadySound();
  };

  tableNumber = 1;
  clientDocumentId = '';
  clientName = '';
  source: OrderSource = 'MESONERO';

  readonly isCreateModalOpen = signal(false);
  readonly isSubmittingOrder = signal(false);
  readonly isDetailModalOpen = signal(false);
  readonly isConfirmModalOpen = signal(false);
  readonly isClientNameModalOpen = signal(false);
  readonly isEditClientModalOpen = signal(false);
  editClientDocumentId = '';
  editClientName = '';
  readonly isCategoryModalOpen = signal(false);
  readonly isReceivePaymentModalOpen = signal(false);
  readonly editingOrderId = signal<string | null>(null);
  readonly showBillSummary = signal(false);
  readonly selectedOrderId = signal<string | null>(null);
  readonly paymentReference = signal('');
  readonly paymentMethod = signal<PaymentMethod>('EFECTIVO_BS');
  readonly modalPaymentMethods: Array<{ value: PaymentMethod; label: string }> = [
    { value: 'EFECTIVO_BS', label: 'Efectivo Bs' },
    { value: 'EFECTIVO_USD', label: 'Dólares' },
    { value: 'PAGO_MOVIL', label: 'Pago móvil' },
    { value: 'PUNTO', label: 'Punto' },
    { value: 'CASHEA', label: 'Cashea' }
  ];
  readonly billTipEnabled = signal(false);
  readonly billTipPercent = signal(0);

  readonly currentStep = signal(1);
  readonly ordersViewMode = signal<'ACTIVAS' | 'ENTREGADAS'>('ACTIVAS');
  readonly selectedRestaurant = signal<RestaurantId | null>(null);
  readonly selectedNextArea = signal<NextRestobarAreaId>('SALON');
  readonly selectedPapaAndSonArea = signal<PapaAndSonAreaId>('SALON');
  readonly productSearchQuery = signal('');
  readonly categoryProductSearchQuery = signal('');
  readonly lines = signal<Array<{ id: number; productId: string; quantity: number; note: string }>>([]);
  readonly visibleCategoryNoteIds = signal<string[]>([]);
  readonly lastCreatedId = signal('');
  readonly knownClientName = signal('');
  readonly selectedCategory = signal<Product['category'] | null>(null);
  readonly selectedPapaCategory = signal<Product['category'] | null>(null);
  readonly categoryDraftLines = signal<Record<string, { quantity: number; note: string }>>({});
  draftClientName = '';
  accountLookupDocumentId = '';

  readonly canAccessComandas = computed(() => this.state.canAccessModule('comandas'));
  readonly isAdmin = computed(() => this.state.isAdmin());
  readonly isDataLoading = computed(() => this.state.runtimeDataLoading());
  readonly dataError = computed(() => this.state.runtimeDataError());
  readonly defaultBillTipPercent = computed(() => this.state.appSettings().defaultTipPercent);
  readonly bcvRate = computed(() => this.state.appSettings().bcvRate);
  readonly restaurantOptions = computed(() =>
    this.state.allowedRestaurantIds().map((restaurantId) => ({
      value: restaurantId,
      label: this.restaurantLabel(restaurantId),
      iconClass: restaurantId === 'LAGOS' ? 'bi bi-shop-window' : 'bi bi-shop'
    }))
  );

  readonly nextRestobarAreaLayouts = NEXT_RESTOBAR_AREA_LAYOUTS;
  readonly papaAndSonAreaLayouts = PAPA_AND_SON_AREA_LAYOUTS;
  readonly selectedNextAreaLayout = computed(
    () =>
      this.nextRestobarAreaLayouts.find((area) => area.id === this.selectedNextArea()) ??
      this.nextRestobarAreaLayouts[0]
  );
  readonly selectedPapaAndSonAreaLayout = computed(
    () =>
      this.papaAndSonAreaLayouts.find((area) => area.id === this.selectedPapaAndSonArea()) ??
      this.papaAndSonAreaLayouts[0]
  );

  readonly availableProducts = computed(() =>
    this.state.getVisibleProductsForComandas().filter((product) => product.available)
  );
  readonly filteredProducts = computed(() => {
    const selected = this.selectedRestaurant();
    if (!selected) {
      return [];
    }

    const query = this.productSearchQuery().trim().toLowerCase();
    return this.availableProducts()
      .filter((product) => product.restaurantId === selected)
      .filter((product) => {
        if (!query) {
          return true;
        }

        return [product.name, product.category, product.description ?? '', product.area]
          .join(' ')
          .toLowerCase()
          .includes(query);
      });
  });

  readonly groupedProducts = computed(() => {
    const products = this.filteredProducts();
    const selectedRest = this.selectedRestaurant();
    const categories = this.state.productCategories()
      .filter((c) => c.restaurantId === selectedRest)
      .map((c) => ({
        category: c.id,
        label: c.name
      }));

    return categories.map((entry) => ({
      category: entry.category,
      label: entry.label,
      products: products.filter((product) => product.category === entry.category)
    }));
  });

  readonly papaCategoryGroups = computed(() =>
    this.groupedProducts().filter((group) => group.products.length > 0)
  );

  readonly userActiveOrders = computed(() => {
    return this.state
      .getVisibleOrdersForModule('comandas')
      .filter((order) => order.status !== 'ANULADO');
  });

  readonly occupiedTablesByRestaurant = computed(() => {
    const occupied = new Map<RestaurantId, Set<number>>();

    this.userActiveOrders().forEach((order) => {
      const restaurantIds = new Set(order.items.map((item) => item.restaurantId));
      restaurantIds.forEach((restaurantId) => {
        const tables = occupied.get(restaurantId) ?? new Set<number>();
        tables.add(order.tableNumber);
        occupied.set(restaurantId, tables);
      });
    });

    return occupied;
  });

  readonly allActiveOrdersForOccupancy = computed(() => {
    return this.state.orders().filter((order) => {
      if (order.status === 'ANULADO') return false;
      return order.items.some((i) => i.status !== 'ENTREGADO' && i.status !== 'ANULADO');
    }).filter((order) => this.state.orderMatchesCurrentRestaurants(order));
  });

  readonly tableOccupancyStatus = computed(() => {
    const statusMap = new Map<RestaurantId, Map<number, 'MINE' | 'OTHERS'>>();
    const currentUserId = this.state.currentUserId();

    this.allActiveOrdersForOccupancy().forEach((order) => {
      const isMine = order.createdByUserId === currentUserId;
      const restaurantIds = new Set(order.items.map((item) => item.restaurantId));
      
      restaurantIds.forEach((restaurantId) => {
        if (!statusMap.has(restaurantId)) {
          statusMap.set(restaurantId, new Map());
        }
        const tables = statusMap.get(restaurantId)!;
        
        if (tables.get(order.tableNumber) !== 'MINE') {
          tables.set(order.tableNumber, isMine ? 'MINE' : 'OTHERS');
        }
      });
    });

    return statusMap;
  });

  readonly visibleOrders = computed(() => {
    if (this.ordersViewMode() === 'ENTREGADAS') {
      return this.userActiveOrders().filter((order) => {
        const hasActiveItems = order.items.some((i) => i.status === 'PENDIENTE' || i.status === 'EN_PROCESO' || i.status === 'LISTO');
        if (hasActiveItems) return false;
        return order.status === 'ENTREGADO' || order.status === 'COBRADO';
      });
    }

    return this.userActiveOrders().filter((order) => {
      const hasActiveItems = order.items.some((i) => i.status === 'PENDIENTE' || i.status === 'EN_PROCESO' || i.status === 'LISTO');
      if (hasActiveItems) return true;
      return order.status !== 'ENTREGADO' && order.status !== 'COBRADO';
    });
  });

  readonly selectedOrder = computed(() => {
    const id = this.selectedOrderId();
    if (!id) {
      return null;
    }

    return this.state.orders().find((order) => order.id === id) ?? null;
  });

  readonly selectedCategoryGroup = computed(() => {
    const category = this.selectedCategory();
    if (!category) {
      return null;
    }

    return this.groupedProducts().find((group) => group.category === category) ?? null;
  });

  readonly filteredCategoryProducts = computed(() => {
    const group = this.selectedCategoryGroup();
    if (!group) {
      return [];
    }

    const query = this.categoryProductSearchQuery().trim().toLowerCase();
    if (!query) {
      return group.products;
    }

    return group.products.filter((product) =>
      [product.name, product.category, product.description ?? '', product.area]
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  });

  readonly filteredPapaCategoryProducts = computed(() => {
    const category = this.selectedPapaCategory();
    if (!category) {
      return [];
    }

    const group = this.groupedProducts().find((g) => g.category === category);
    if (!group) {
      return [];
    }

    const query = this.productSearchQuery().trim().toLowerCase();
    if (!query) {
      return group.products;
    }

    return group.products.filter((product) =>
      [product.name, product.category, product.description ?? '', product.area]
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  });

  readonly selectedPapaCategoryLabel = computed(() => {
    const category = this.selectedPapaCategory();
    if (!category) {
      return '';
    }

    return this.groupedProducts().find((g) => g.category === category)?.label ?? '';
  });

  readonly groupedAccountOrders = computed(() => {
    const normalizedDocumentId = this.accountLookupDocumentId.trim();
    if (!normalizedDocumentId) {
      return [];
    }

    return this.visibleOrders()
      .filter((order) => order.clientDocumentId === normalizedDocumentId)
      .sort(
        (left, right) =>
          new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      );
  });

  readonly groupedAccountClientName = computed(() => this.groupedAccountOrders()[0]?.clientName ?? 'Cliente');

  readonly groupedAccountTotal = computed(() =>
    this.groupedAccountOrders().reduce((sum, order) => sum + this.orderTotalFromOrder(order), 0)
  );

  constructor() {
    this.billTipPercent.set(this.defaultBillTipPercent());

    window.addEventListener('pointerdown', this.unlockSoundHandler);

    void this.refreshAndCheckReady(true);

    const timerId = setInterval(() => {
      void this.refreshAndCheckReady(true);
    }, this.pollIntervalMs);

    this.destroyRef.onDestroy(() => {
      clearInterval(timerId);
      window.removeEventListener('pointerdown', this.unlockSoundHandler);
    });
  }

  canContinueFromStep1(): boolean {
    const selectedRestaurant = this.selectedRestaurant();
    if (!selectedRestaurant) {
      return false;
    }

    if (this.isNextRestobarSelected()) {
      return isNextRestobarTableNumber(this.tableNumber);
    }

    if (this.isPapaAndSonSelected()) {
      if (!isPapaAndSonTableNumber(this.tableNumber)) {
        return false;
      }
      if (this.getTableOccupancyStatus(this.tableNumber, 'PAPA_Y_SON') === 'OTHERS') {
        return false;
      }
      return true;
    }

    return this.tableNumber > 0;
  }

  retryLoad(): void {
    void this.state.retryRuntimeDataLoad();
  }

  cancelLoad(): void {
    this.state.clearRuntimeDataError();
  }

  canContinueFromStep2(): boolean {
    return this.clientDocumentId.trim().length > 0;
  }

  canContinueFromRestaurantStep(): boolean {
    const selectedRestaurant = this.selectedRestaurant();
    if (!selectedRestaurant) {
      return false;
    }

    if (selectedRestaurant !== 'NEXT_RESTOBAR') {
      if (selectedRestaurant === 'PAPA_Y_SON') {
        return isPapaAndSonTableNumber(this.tableNumber);
      }

      return true;
    }

    return isNextRestobarTableNumber(this.tableNumber);
  }

  updateAccountLookupDocumentId(value: string): void {
    this.accountLookupDocumentId = value.replace(/[^0-9]/g, '');
  }

  handleClientDocumentChange(value: string): void {
    const previousKnownName = this.knownClientName();
    this.clientDocumentId = value.replace(/[^0-9]/g, '');
    const knownName = this.state.getCustomerNameByDocumentId(this.clientDocumentId) ?? '';

    if (knownName) {
      this.clientName = knownName;
    } else if (previousKnownName && this.clientName === previousKnownName) {
      this.clientName = '';
    }

    this.knownClientName.set(knownName);
  }

  continueFromClientStep(): void {
    if (!this.canContinueFromStep2()) {
      return;
    }

    if (this.knownClientName()) {
      this.clientName = this.knownClientName();
      if (this.selectedRestaurant()) {
        this.continueFromRestaurantStep();
      } else {
        this.goToStep(3);
      }
      return;
    }

    this.draftClientName = this.clientName.trim();
    this.isClientNameModalOpen.set(true);
  }

  closeClientNameModal(): void {
    this.isClientNameModalOpen.set(false);
    this.draftClientName = this.clientName.trim();
  }

  confirmClientName(): void {
    const normalizedName = this.draftClientName.trim();
    if (normalizedName.length < 2) {
      return;
    }

    this.clientName = normalizedName;
    this.isClientNameModalOpen.set(false);
    if (this.selectedRestaurant()) {
      this.continueFromRestaurantStep();
      return;
    }

    this.goToStep(3);
  }

  openCreateModal(): void {
    this.editingOrderId.set(null);
    const allowedRestaurants = this.state.allowedRestaurantIds();
    this.selectedRestaurant.set(allowedRestaurants.length === 1 ? allowedRestaurants[0] : null);
    if (allowedRestaurants.length === 1 && allowedRestaurants[0] === 'NEXT_RESTOBAR') {
      this.tableNumber = 0;
      this.selectedNextArea.set('SALON');
    }
    if (allowedRestaurants.length === 1 && allowedRestaurants[0] === 'PAPA_Y_SON') {
      this.tableNumber = 0;
      this.selectedPapaAndSonArea.set('SALON');
    }
    this.isCreateModalOpen.set(true);
    this.lastCreatedId.set('');
  }

  openAddItemsToOrder(orderId: string): void {
    const order = this.state.orders().find((item) => item.id === orderId);
    if (!order) {
      return;
    }

    const restaurants = [...new Set(order.items.map((item) => item.restaurantId))];
    this.tableNumber = order.tableNumber;
    this.clientDocumentId = (order.clientDocumentId ?? '').trim();
    this.clientName = order.clientName;
    this.draftClientName = order.clientName;
    this.knownClientName.set(order.clientName);
    this.lines.set([]);
    this.selectedRestaurant.set(restaurants.length === 1 ? restaurants[0] : null);
    this.currentStep.set(restaurants.length === 1 ? 4 : 3);
    this.editingOrderId.set(order.id);
    this.lastCreatedId.set('');
    this.isDetailModalOpen.set(false);
    this.isCreateModalOpen.set(true);
    this.isConfirmModalOpen.set(false);
    this.isClientNameModalOpen.set(false);
    this.closeCategoryModal();
  }

  closeCreateModal(): void {
    this.isCreateModalOpen.set(false);
    this.isConfirmModalOpen.set(false);
    this.isClientNameModalOpen.set(false);
    this.isReceivePaymentModalOpen.set(false);
    this.paymentReference.set('');
    this.closeCategoryModal();
    this.resetDraft();
  }

  openConfirmModal(): void {
    if (!this.lines().length) {
      return;
    }

    this.isConfirmModalOpen.set(true);
  }

  closeConfirmModal(): void {
    this.isConfirmModalOpen.set(false);
  }

  openDetail(orderId: string): void {
    this.selectedOrderId.set(orderId);
    this.isDetailModalOpen.set(true);
    this.showBillSummary.set(false);
    this.resetBillDraft();
  }

  closeDetailModal(): void {
    this.isDetailModalOpen.set(false);
    this.selectedOrderId.set(null);
    this.showBillSummary.set(false);
    this.resetBillDraft();
    this.closeReceivePaymentModal();
    this.isEditClientModalOpen.set(false);
  }

  openEditClientModal(): void {
    const order = this.selectedOrder();
    if (!order) return;
    this.editClientDocumentId = order.clientDocumentId || '';
    this.editClientName = order.clientName;
    this.isEditClientModalOpen.set(true);
  }

  closeEditClientModal(): void {
    this.isEditClientModalOpen.set(false);
  }

  saveEditClient(): void {
    const order = this.selectedOrder();
    if (!order) return;
    const docId = this.editClientDocumentId.trim();
    const name = this.editClientName.trim() || ('Mesa ' + order.tableNumber);
    this.state.updateOrderClient(order.id, name, docId);
    this.closeEditClientModal();
  }

  markDelivered(orderId: string): void {
    this.state.markDelivered(orderId);
  }

  canDeleteSelectedOrder(): boolean {
    const order = this.selectedOrder();
    if (!order || !this.isAdmin()) {
      return false;
    }

    return order.status === 'PENDIENTE' || order.status === 'EN_PROCESO';
  }

  deleteSelectedOrder(): void {
    const order = this.selectedOrder();
    if (!order || !this.canDeleteSelectedOrder()) {
      return;
    }

    const pin = window.prompt('Para anular la comanda ' + order.id + ', ingrese la clave de autorización de Administrador:');
    if (pin === null) {
      return;
    }

    if (!this.state.validateAdminSecurityPin(pin)) {
      window.alert('Clave de autorización incorrecta. Operación cancelada.');
      return;
    }

    const confirmed = window.confirm(
      'Se anulará la comanda ' + order.id + '. Permanecerá registrada en el historial. ¿Confirmar anulación?'
    );
    if (!confirmed) {
      return;
    }

    const deleted = this.state.deleteOrderInKitchen(order.id);
    if (deleted) {
      this.closeDetailModal();
    }
  }

  canDeleteSelectedOrderItem(item: OrderItem): boolean {
    const order = this.selectedOrder();
    if (!order || !this.isAdmin()) {
      return false;
    }
    if (order.status !== 'PENDIENTE' && order.status !== 'EN_PROCESO') {
      return false;
    }
    return item.status !== 'ENTREGADO' && item.status !== 'COBRADO';
  }

  deleteSelectedOrderItem(item: OrderItem): void {
    const order = this.selectedOrder();
    if (!order || !this.canDeleteSelectedOrderItem(item)) {
      return;
    }

    const pin = window.prompt('Para eliminar el ítem "' + item.productName + '", ingrese la clave de autorización de Administrador:');
    if (pin === null) {
      return;
    }

    if (!this.state.validateAdminSecurityPin(pin)) {
      window.alert('Clave de autorización incorrecta. Operación cancelada.');
      return;
    }

    const isOnlyItem = order.items.length <= 1;
    const message = isOnlyItem
      ? '"' + item.productName + '" es el único producto de la comanda ' + order.id + '. Al eliminarlo se anulará la comanda completa. ¿Deseas continuar?'
      : '¿Eliminar "' + item.productName + '" de la comanda ' + order.id + '? Se devolverá el stock al inventario.';

    const confirmed = window.confirm(message);
    if (!confirmed) {
      return;
    }

    const deleted = this.state.deleteOrderItemInKitchen(order.id, item.id);
    if (deleted && isOnlyItem) {
      this.closeDetailModal();
    }
  }

  toggleBillSummary(): void {
    this.showBillSummary.update((value) => !value);
  }

  updateBillTipPercent(value: string | number): void {
    const parsed = Number(value);
    this.billTipPercent.set(Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 100) : 0);
  }

  openReceivePaymentModal(orderId: string): void {
    const order = this.state.orders().find((item) => item.id === orderId);
    if (!order || order.status !== 'ENTREGADO' || this.isPendingPaymentVerification(order)) {
      return;
    }

    this.selectedOrderId.set(orderId);
    this.paymentMethod.set('EFECTIVO_BS');
    this.paymentReference.set('');
    this.isReceivePaymentModalOpen.set(true);
  }

  closeReceivePaymentModal(): void {
    this.isReceivePaymentModalOpen.set(false);
    this.paymentReference.set('');
  }

  confirmReceivePayment(): void {
    const order = this.selectedOrder();
    const method = this.paymentMethod();
    const reference = method === 'PAGO_MOVIL' ? this.paymentReference().trim() : '';
    if (!order || order.status !== 'ENTREGADO') {
      return;
    }
    if (method === 'PAGO_MOVIL' && reference.length < 3) {
      return;
    }

    if (this.requiresPapaAndSonPaymentVerification(order)) {
      this.state.requestPaymentVerification(order.id, {
        paymentMethod: method,
        paymentReference: reference,
        paymentAmountUsd: this.selectedOrderPayableTotal(),
        paymentAmountBs: this.selectedOrderPayableTotalBs()
      });
    } else {
      this.state.completeOrder(order.id, {
        paymentMethod: method,
        paymentReference: reference,
        paymentAmountUsd: this.selectedOrderPayableTotal(),
        paymentAmountBs: this.selectedOrderPayableTotalBs()
      });
    }

    this.closeReceivePaymentModal();
    this.closeDetailModal();
  }

  requiresPapaAndSonPaymentVerification(order: Order): boolean {
    return order.items.some((item) => item.restaurantId === 'PAPA_Y_SON');
  }

  isPendingPaymentVerification(order: Order): boolean {
    return order.paymentVerificationStatus === 'PENDIENTE';
  }

  shouldShowNextQr(order: Order): boolean {
    return order.items.some((item) => item.restaurantId === 'NEXT_RESTOBAR');
  }

  shouldShowPapaAndSonQr(order: Order): boolean {
    return order.items.some((item) => item.restaurantId === 'PAPA_Y_SON');
  }

  goToStep(step: number): void {
    if (step >= 2 && this.isPapaAndSonSelected()) {
      this.clientDocumentId = this.tableNumber.toString().padStart(8, '0');
      this.clientName = 'Mesa ' + this.tableNumber;
      this.draftClientName = this.clientName;
      this.knownClientName.set('');
      if (step === 2) {
        step = 3;
      }
    }

    if (step === 3 && this.selectedRestaurant() === 'NEXT_RESTOBAR') {
      this.selectedNextArea.set(getNextRestobarAreaForTableNumber(this.tableNumber) ?? 'SALON');
    }

    if (step === 3 && this.selectedRestaurant() === 'PAPA_Y_SON') {
      this.selectedPapaAndSonArea.set(getPapaAndSonAreaForTableNumber(this.tableNumber) ?? 'SALON');
    }

    this.currentStep.set(step);
  }

  selectRestaurant(restaurant: RestaurantId): void {
    if (!this.canUseRestaurant(restaurant)) {
      return;
    }

    this.selectedRestaurant.set(restaurant);

    if (restaurant === 'NEXT_RESTOBAR') {
      if (!isNextRestobarTableNumber(this.tableNumber)) {
        this.tableNumber = 0;
      }

      this.selectedNextArea.set(getNextRestobarAreaForTableNumber(this.tableNumber) ?? 'SALON');
      return;
    }

    if (restaurant === 'PAPA_Y_SON') {
      if (!isPapaAndSonTableNumber(this.tableNumber)) {
        this.tableNumber = 0;
      }

      this.selectedPapaAndSonArea.set(getPapaAndSonAreaForTableNumber(this.tableNumber) ?? 'SALON');
      return;
    }

    if ((this.tableNumber >= 100 && isNextRestobarTableNumber(this.tableNumber)) || isPapaAndSonTableNumber(this.tableNumber)) {
      this.tableNumber = 1;
    }
  }

  continueFromRestaurantStep(): void {
    if (!this.canContinueFromRestaurantStep()) {
      return;
    }

    this.ensureSelectedCategoryIsValid();
    this.currentStep.set(4);
  }

  isNextRestobarSelected(): boolean {
    return this.selectedRestaurant() === 'NEXT_RESTOBAR';
  }

  isPapaAndSonSelected(): boolean {
    return this.selectedRestaurant() === 'PAPA_Y_SON';
  }

  selectNextArea(area: NextRestobarAreaId): void {
    this.selectedNextArea.set(area);
  }

  selectNextTable(tableNumber: number): void {
    this.tableNumber = tableNumber;
    this.selectedNextArea.set(getNextRestobarAreaForTableNumber(tableNumber) ?? this.selectedNextArea());
  }

  selectPapaAndSonArea(area: PapaAndSonAreaId): void {
    this.selectedPapaAndSonArea.set(area);
  }

  selectPapaAndSonTable(tableNumber: number): void {
    if (this.getTableOccupancyStatus(tableNumber, 'PAPA_Y_SON') === 'OTHERS') {
      return;
    }
    this.tableNumber = tableNumber;
    this.selectedPapaAndSonArea.set(getPapaAndSonAreaForTableNumber(tableNumber) ?? this.selectedPapaAndSonArea());
  }

  canUseRestaurant(restaurant: RestaurantId): boolean {
    return this.state.allowedRestaurantIds().includes(restaurant);
  }

  removeLine(id: number): void {
    this.lines.update((lines) => lines.filter((line) => line.id !== id));
  }

  addProductQuick(productId: string): void {
    this.lines.update((lines) => {
      const found = lines.find((line) => line.productId === productId);
      if (found) {
        return lines.map((line) =>
          line.productId === productId ? { ...line, quantity: line.quantity + 1 } : line
        );
      }

      return [...lines, { id: Date.now(), productId, quantity: 1, note: '' }];
    });
  }

  isTableOccupied(tableNumber: number, restaurantId: RestaurantId): boolean {
    return this.occupiedTablesByRestaurant().get(restaurantId)?.has(tableNumber) ?? false;
  }

  getTableOccupancyStatus(tableNumber: number, restaurantId: RestaurantId): 'NONE' | 'MINE' | 'OTHERS' {
    return this.tableOccupancyStatus().get(restaurantId)?.get(tableNumber) ?? 'NONE';
  }

  selectProductCategory(category: Product['category']): void {
    this.selectedCategory.set(category);
  }

  selectPapaCategory(category: Product['category']): void {
    this.selectedPapaCategory.set(category);
    this.productSearchQuery.set('');
  }

  goBackToCategories(): void {
    this.selectedPapaCategory.set(null);
    this.productSearchQuery.set('');
  }

  closeCategoryModal(): void {
    this.isCategoryModalOpen.set(false);
    this.categoryDraftLines.set({});
    this.categoryProductSearchQuery.set('');
    this.visibleCategoryNoteIds.set([]);
  }

  categoryIconClass(category: Product['category']): string {
    if (category === 'PIZZA') {
      return 'bi bi-pie-chart';
    }

    if (category === 'COMIDA') {
      return 'bi bi-egg-fried';
    }

    if (category === 'BEBIDA') {
      return 'bi bi-cup-straw';
    }

    if (category === 'MOSTRADOR') {
      return 'bi bi-bag';
    }

    return 'bi bi-stars';
  }

  toggleCategoryNoteVisibility(productId: string): void {
    this.visibleCategoryNoteIds.update((ids) =>
      ids.includes(productId) ? ids.filter((id) => id !== productId) : [...ids, productId]
    );
  }

  isCategoryNoteVisible(productId: string): boolean {
    return this.visibleCategoryNoteIds().includes(productId);
  }

  incrementProductQuantity(productId: string): void {
    const product = this.availableProducts().find((item) => item.id === productId);
    if (!product) {
      return;
    }

    this.lines.update((lines) => {
      const current = lines.find((line) => line.productId === productId);
      if (current) {
        return lines.map((line) =>
          line.productId === productId
            ? {
                ...line,
                quantity:
                  product.restaurantId === 'PAPA_Y_SON'
                    ? line.quantity + 1
                    : Math.min(line.quantity + 1, product.stock)
              }
            : line
        );
      }

      return [...lines, { id: Date.now() + Math.floor(Math.random() * 10000), productId, quantity: 1, note: '' }];
    });
  }

  decrementProductQuantity(productId: string): void {
    const current = this.lines().find((line) => line.productId === productId);
    if (!current) {
      return;
    }

    if (current.quantity <= 1) {
      this.lines.update((lines) => lines.filter((line) => line.productId !== productId));
      this.visibleCategoryNoteIds.update((ids) => ids.filter((id) => id !== productId));
      return;
    }

    this.lines.update((lines) =>
      lines.map((line) =>
        line.productId === productId ? { ...line, quantity: line.quantity - 1 } : line
      )
    );
  }

  updateProductNote(productId: string, note: string): void {
    const existing = this.lines().find((line) => line.productId === productId);
    if (existing) {
      this.lines.update((lines) =>
        lines.map((line) => (line.productId === productId ? { ...line, note } : line))
      );
      return;
    }

    this.lines.update((lines) => [...lines, { id: Date.now() + Math.floor(Math.random() * 10000), productId, quantity: 1, note }]);
  }

  productLineQuantity(productId: string): number {
    return this.lines().find((line) => line.productId === productId)?.quantity ?? 0;
  }

  productLineNote(productId: string): string {
    return this.lines().find((line) => line.productId === productId)?.note ?? '';
  }

  categorySelectedItems(category: Product['category']): number {
    const productIds = new Set(
      this.groupedProducts()
        .find((group) => group.category === category)
        ?.products.map((product) => product.id) ?? []
    );

    return this.lines()
      .filter((line) => productIds.has(line.productId))
      .reduce((sum, line) => sum + line.quantity, 0);
  }

  updateLineNote(id: number, note: string): void {
    this.lines.update((lines) =>
      lines.map((line) => (line.id === id ? { ...line, note } : line))
    );
  }

  selectedRestaurantLabel(): string {
    const selected = this.selectedRestaurant();
    return selected ? this.restaurantLabel(selected) : 'Sin seleccionar';
  }

  private ensureSelectedCategoryIsValid(): void {
    const availableCategories = this.groupedProducts().filter((group) => group.products.length > 0);
    const selectedCategory = this.selectedCategory();

    if (selectedCategory && availableCategories.some((group) => group.category === selectedCategory)) {
      return;
    }

    this.selectedCategory.set(availableCategories[0]?.category ?? null);
  }

  private restaurantLabel(restaurantId: RestaurantId): string {
    return this.state.restaurants().find((restaurant) => restaurant.id === restaurantId)?.name ?? restaurantId;
  }

  lineUnitPrice(productId: string): number {
    const product = this.availableProducts().find((item) => item.id === productId);
    return product?.price ?? 0;
  }

  productName(productId: string): string {
    const product = this.availableProducts().find((item) => item.id === productId);
    return product?.name ?? 'Producto no disponible';
  }

  lineTotal(productId: string, quantity: number): number {
    return this.lineUnitPrice(productId) * quantity;
  }

  orderTotal(): number {
    return this.lines().reduce((sum, line) => sum + this.lineTotal(line.productId, line.quantity), 0);
  }

  selectedOrderTotal(): number {
    const order = this.selectedOrder();
    if (!order) {
      return 0;
    }

    return order.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  }

  getReadyItemsCount(order: Order): number {
    if (!order || !order.items) return 0;
    return order.items.filter((item) => item.status === 'LISTO').length;
  }

  hasReadyItems(order: Order): boolean {
    if (!order || !order.items) return false;
    return order.items.some((item) => item.status === 'LISTO');
  }

  deliverItem(event: Event, orderId: string, itemId: string): void {
    event.stopPropagation();
    this.state.markItemDelivered(orderId, itemId);
  }

  selectedOrderTotalFor(order: Order): number {
    if (!order || !order.items) return 0;
    return order.items
      .filter((item) => item.status !== 'ANULADO')
      .reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  }

  printInvoiceTicket(order: Order): void {
    const bcv = this.bcvRate();
    const subtotal = this.selectedOrderTotalFor(order);
    const totalUsd = order.paymentAmountUsd ?? subtotal;
    const totalBs = order.paymentAmountBs ?? (totalUsd * bcv);

    this.state.queueConsumptionPrintJob({
      restaurantIds: [...new Set(order.items.map((i) => i.restaurantId))],
      localLabels: [...new Set(order.items.map((i) => this.restaurantLabel(i.restaurantId)))],
      tableLabels: [this.tableLabel(order).toString()],
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

  selectedOrderTipAmount(): number {
    if (!this.billTipEnabled()) {
      return 0;
    }

    return this.selectedOrderTotal() * (this.billTipPercent() / 100);
  }

  selectedOrderHasPapaAndSonIva(): boolean {
    const order = this.selectedOrder();
    return !!order && this.orderHasPapaAndSonIva(order);
  }

  selectedOrderTaxAmount(): number {
    if (!this.selectedOrderHasPapaAndSonIva()) {
      return 0;
    }

    return this.selectedOrderTotal() * PAPA_AND_SON_IVA_RATE;
  }

  selectedOrderTaxBs(): number {
    return this.selectedOrderTaxAmount() * this.bcvRate();
  }

  selectedOrderTotalBs(): number {
    return this.selectedOrderTotal() * this.bcvRate();
  }

  selectedOrderPayableTotal(): number {
    return this.selectedOrderTotal() + this.selectedOrderTipAmount() + this.selectedOrderTaxAmount();
  }

  selectedOrderPayableTotalBs(): number {
    return this.selectedOrderPayableTotal() * this.bcvRate();
  }

  orderTotalFromOrder(order: Order): number {
    return order.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  }

  private orderHasPapaAndSonIva(order: Order): boolean {
    return order.items.some((item) => item.restaurantId === 'PAPA_Y_SON');
  }

  private resetBillDraft(): void {
    this.billTipEnabled.set(false);
    this.billTipPercent.set(this.defaultBillTipPercent());
  }

  statusClass(status: Order['status']): string {
    return status;
  }

  currentTableLabel(): string {
    const selectedRestaurant = this.selectedRestaurant();
    return formatTableNumberLabel(this.tableNumber, selectedRestaurant ? [selectedRestaurant] : []);
  }

  tableLabel(order: Order): string {
    return formatTableNumberLabel(order.tableNumber, order.items.map((item) => item.restaurantId));
  }

  getCreatorLabel(order: Order): string {
    const userId = order.createdByUserId;
    if (userId === 'QR') return 'QR';
    
    const user = this.state.users().find(u => u.id === userId);
    if (!user) return 'Desconocido';

    if (user.role === 'ADMIN') return 'ADMIN';
    if (user.role === 'MESONERO') {
      const match = user.displayName.match(/Mesonero \d+/i);
      return match ? match[0] : user.displayName;
    }
    if (user.role === 'RUNNER') {
      const match = user.displayName.match(/Runner \d+/i);
      return match ? match[0] : user.displayName;
    }
    return user.displayName;
  }

  statusLabel(status: Order['status'], order?: Order): string {
    if (order?.paymentVerificationStatus === 'PENDIENTE') {
      return 'POR VERIFICAR';
    }

    if (status === 'LISTO') {
      return 'LISTO, RETIRAR';
    }

    if (status === 'ENTREGADO') {
      return 'ENTREGADO';
    }

    return 'Pedido en cocina';
  }

  async submitOrder(): Promise<void> {
    if (this.isSubmittingOrder()) {
      return;
    }
    this.isSubmittingOrder.set(true);
    try {
      const orderId = this.editingOrderId();
      const result = orderId
        ? this.state.appendItemsToOrder(orderId, this.lines())
        : await this.state.createOrder(
            this.tableNumber,
            this.clientDocumentId,
            this.clientName.trim(),
            this.source,
            this.lines()
          );

      this.lastCreatedId.set(
        result ? (orderId ? 'Comanda actualizada: ' : 'Comanda creada: ') + result.id : 'No fue posible guardar la comanda.'
      );

      if (result) {
        this.isConfirmModalOpen.set(false);
        this.isCreateModalOpen.set(false);
        this.resetDraft();
      }
    } finally {
      this.isSubmittingOrder.set(false);
    }
  }

  confirmSubmitOrder(): void {
    if (this.isSubmittingOrder()) {
      return;
    }
    void this.submitOrder();
  }

  private async refreshAndCheckReady(shouldNotify: boolean): Promise<void> {
    await this.state.refreshOrdersFromFirebase();
    this.checkReadyOrders(shouldNotify);
  }

  private checkReadyOrders(shouldNotify: boolean): void {
    const readyNow = new Set(
      this.state
        .getVisibleOrdersForModule('comandas')
        .filter(
          (order) =>
            order.status === 'LISTO'
        )
        .map((order) => order.id)
    );

    if (!this.readyTrackerPrimed) {
      this.readyOrderIds = readyNow;
      this.readyTrackerPrimed = true;

      if (shouldNotify && readyNow.size > 0) {
        void this.notifyReadySound();
      }

      return;
    }

    if (shouldNotify && readyNow.size > 0) {
      void this.notifyReadySound();
    }

    this.readyOrderIds = readyNow;
  }

  private async notifyReadySound(): Promise<void> {
    const played = await this.playReadySound();
    if (!played) {
      this.pendingReadySound = true;
    }
  }

  private async playReadySound(): Promise<boolean> {
    try {
      const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) {
        return false;
      }

      const audioContext = new AudioCtor();
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      if (audioContext.state === 'suspended') {
        return false;
      }

      const gainNode = audioContext.createGain();
      gainNode.connect(audioContext.destination);

      const start = audioContext.currentTime;
      const notes = [1046, 1318, 1568];

      notes.forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        oscillator.type = 'square';
        oscillator.frequency.value = frequency;
        oscillator.connect(gainNode);

        const toneStart = start + index * 0.15;
        const toneEnd = toneStart + 0.13;
        gainNode.gain.setValueAtTime(0.0001, toneStart);
        gainNode.gain.exponentialRampToValueAtTime(0.95, toneStart + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, toneEnd);

        oscillator.start(toneStart);
        oscillator.stop(toneEnd);
      });

      setTimeout(() => {
        void audioContext.close();
      }, 800);

      return true;
    } catch {
      // No-op when browser blocks audio playback.
      return false;
    }
  }

  private resetDraft(): void {
    this.tableNumber = 1;
    this.clientDocumentId = '';
    this.clientName = '';
    this.productSearchQuery.set('');
    this.selectedPapaCategory.set(null);
    this.paymentReference.set('');
    this.draftClientName = '';
    this.knownClientName.set('');
    this.editingOrderId.set(null);
    this.isClientNameModalOpen.set(false);
    this.closeCategoryModal();
    this.lines.set([]);
    this.currentStep.set(1);
    this.selectedRestaurant.set(null);
    this.selectedNextArea.set('SALON');
    this.selectedPapaAndSonArea.set('SALON');
  }
}
