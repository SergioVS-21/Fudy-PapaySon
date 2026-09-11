import { CommonModule, CurrencyPipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppStateService } from '../core/app-state.service';
import { AreaId, Order, OrderItem, RestaurantId } from '../core/models';
import { formatTableNumberLabel } from '../core/table-layouts';

interface OrderRestaurantGroup {
  restaurantId: RestaurantId;
  restaurantName: string;
  itemsByArea: Array<{ area: AreaId; items: OrderItem[] }>;
}

interface AreaSection {
  restaurantId: RestaurantId;
  restaurantName: string;
  orders: Order[];
}

@Component({
  selector: 'app-ops-screen-page',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, FormsModule],
  template: `
    <section class="page">
      @if (!canAccessOperations()) {
        <article class="panel">
          <h2>Acceso restringido</h2>
          <p>Tu perfil no tiene permisos para ver Operacion.</p>
        </article>
      } @else {
      <header class="page-header">
        <h1>Pantallas Operativas</h1>
      </header>

      <article class="panel control-panel">
        <div class="chip-group">
          <small>Area</small>
          <div class="chips">
            @for (area of areas(); track area.value) {
              <button
                type="button"
                class="chip"
                [class.active]="selectedArea() === area.value"
                (click)="selectedArea.set(area.value)"
              >
                {{ area.label }}
              </button>
            }
          </div>
        </div>

        <div class="chip-group">
          <small>Restaurante</small>
          <div class="chips">
            @for (restaurant of restaurantFilters(); track restaurant.value) {
              <button
                type="button"
                class="chip"
                [class.active]="selectedRestaurant() === restaurant.value"
                (click)="setSelectedRestaurant(restaurant.value)"
              >
                {{ restaurant.label }}
              </button>
            }
          </div>
        </div>
      </article>

      <section class="ops-workspace" [class.detail-open]="!!selectedOrder()">
        <div class="ops-board">
          @if (selectedArea() === 'ALL') {
            <div class="chip-group" style="margin-bottom: 0.85rem;">
              <small>Modo de visualización</small>
              <div class="chips">
                <button
                  type="button"
                  class="chip"
                  [class.active]="allAreaViewMode() === 'POR_AREA'"
                  (click)="allAreaViewMode.set('POR_AREA')"
                >
                  <i class="bi bi-columns-gap" aria-hidden="true"></i> Divididas por Pantallas (Áreas)
                </button>
                <button
                  type="button"
                  class="chip"
                  [class.active]="allAreaViewMode() === 'COMPLETA'"
                  (click)="allAreaViewMode.set('COMPLETA')"
                >
                  <i class="bi bi-card-checklist" aria-hidden="true"></i> Comanda Completa
                </button>
              </div>
            </div>

            @if (allAreaViewMode() === 'POR_AREA') {
              <section class="restaurant-sections">
                @for (section of allAreaDivisionSections(); track section.area) {
                  <article class="panel section-panel section-panel--board">
                    <div class="section-head">
                      <h2>{{ section.areaName }}</h2>
                      <span class="count-pill">{{ section.orders.length }} comandas</span>
                    </div>

                    <label class="ops-search-box">
                      <i class="bi bi-search" aria-hidden="true"></i>
                      <input
                        type="text"
                        [ngModel]="orderSearchQuery()"
                        (ngModelChange)="orderSearchQuery.set($event || '')"
                        placeholder="Busqueda"
                      />
                    </label>

                    <div class="orders-cards orders-cards--board">
                      @if (isDataLoading() && !section.orders.length) {
                        <article class="state-card">
                          <span class="state-spinner" aria-hidden="true"></span>
                          <strong>Cargando comandas...</strong>
                        </article>
                      } @else if (dataError() && !section.orders.length) {
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
                      @for (order of section.orders; track order.id) {
                        <article
                          class="ops-order-card clickable-card"
                          [class]="'ops-order-card clickable-card ' + (isOrderAllDelivered(order, section.area) ? 'all-delivered ' : '') + statusClass(order.status) + (selectedOrder()?.id === order.id ? ' selected' : '')"
                          (click)="openDetail(order.id)"
                        >
                          <div class="ops-order-head">
                            <div>
                              @if (order.id.startsWith('PPS')) {
                                <strong>Mesa {{ tableLabel(order) }}</strong>
                                <small>
                                  {{ order.items.length }} items
                                  @if (!order.clientName.startsWith('Mesa ')) {
                                    | {{ order.clientName }}
                                  }
                                </small>
                                <small class="ops-order-creator" style="color: #a4b4cb;">{{ getCreatorLabel(order) }}</small>
                              } @else {
                                <strong>{{ order.items.length }} items | Mesa {{ tableLabel(order) }}</strong>
                                <small>{{ order.clientName }}</small>
                              }
                              @if (isOrderAllDelivered(order, section.area)) {
                                <span style="font-size: 0.68rem; font-weight: 800; background: #dcfce7; color: #15803d; border: 1px solid #86efac; padding: 0.12rem 0.45rem; border-radius: 0.4rem; display: inline-flex; align-items: center; gap: 0.25rem; margin-top: 0.2rem;">
                                  <i class="bi bi-check-circle-fill" aria-hidden="true"></i> RETIRADA
                                </span>
                              } @else if (order.status === 'COBRADO') {
                                <span style="font-size: 0.68rem; font-weight: 800; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; padding: 0.1rem 0.4rem; border-radius: 0.4rem; display: inline-flex; align-items: center; gap: 0.2rem; margin-top: 0.2rem;">
                                  <i class="bi bi-cash-coin" aria-hidden="true"></i> COBRADO
                                </span>
                              }
                            </div>
                            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.25rem;">
                              <span class="ops-order-ref">#{{ order.id }}</span>
                              <span class="ops-order-time-badge" [class]="'ops-order-time-badge ' + getElapsedTimeClass(order.createdAt)" [title]="'Creada a las ' + (order.createdAt | date:'hh:mm:ss a')">
                                <i class="bi bi-clock-history" aria-hidden="true"></i> {{ getElapsedTime(order.createdAt) }}
                              </span>
                            </div>
                          </div>

                          <div class="ops-order-body">
                            <span class="ops-order-label">{{ section.areaName }}</span>
                            <ul class="ops-preview-list">
                              @for (item of previewItems(order); track item.id) {
                                <li style="display: flex; align-items: center; justify-content: space-between; gap: 0.4rem; padding: 0.2rem 0; border-bottom: 1px dashed #f1f5f9;">
                                  <span [style.text-decoration]="item.status === 'ENTREGADO' || isItemReadyForArea(item, section.area) ? 'line-through' : 'none'" [style.opacity]="item.status === 'ENTREGADO' ? '0.6' : (isItemReadyForArea(item, section.area) ? '0.75' : '1')" style="display: flex; align-items: center; gap: 0.35rem; font-size: 0.82rem; font-weight: 700; color: #1e293b;">
                                    <span style="font-weight: 800; color: #0284c7;">{{ item.quantity }}x</span>
                                    <span>{{ item.productName }}</span>
                                    @if (item.note) {
                                      <small style="color: #ea580c; font-size: 0.72rem; font-weight: 600;">({{ item.note }})</small>
                                    }
                                  </span>
                                  @if (item.status === 'ENTREGADO') {
                                    <span class="ops-item-delivered-badge" style="font-size: 0.72rem; font-weight: 800; color: #15803d; background: #dcfce7; border: 1px solid #86efac; padding: 0.15rem 0.45rem; border-radius: 0.4rem; display: inline-flex; align-items: center; gap: 0.25rem;">
                                      <i class="bi bi-check2-all" aria-hidden="true"></i> Ya retirado
                                    </span>
                                  } @else if (isItemReadyForArea(item, section.area)) {
                                    <span class="ops-item-ready-badge">
                                      <i class="bi bi-check-lg" aria-hidden="true"></i> LISTO
                                    </span>
                                  } @else {
                                    <button
                                      type="button"
                                      class="ops-item-ready-btn"
                                      title="Marcar este artículo como listo"
                                      (click)="$event.stopPropagation(); markReady(order.id, item.id, section.area)"
                                    >
                                      <i class="bi bi-check2" aria-hidden="true"></i> Listo
                                    </button>
                                  }
                                </li>
                              }
                            </ul>
                          </div>

                          <div class="ops-order-foot" style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap;">
                            @if (hasPendingItems(order, section.area)) {
                              <button
                                type="button"
                                class="btn-ghost ops-ready-btn"
                                (click)="$event.stopPropagation(); markNextPendingItemReady(order, section.area)"
                              >
                                Marcar siguiente
                              </button>
                            } @else {
                              <span style="font-size: 0.76rem; font-weight: 800; color: #065f46; background: #d1fae5; border: 1px solid #6ee7b7; padding: 0.25rem 0.5rem; border-radius: 0.5rem; display: inline-flex; align-items: center; gap: 0.25rem;">
                                <i class="bi bi-check-circle-fill" aria-hidden="true"></i> {{ isOrderAllDelivered(order, section.area) ? 'RETIRADA' : 'LISTO' }}
                              </span>
                              <button
                                type="button"
                                class="btn-dismiss-order-btn"
                                style="font-size: 0.72rem; font-weight: 800; color: #dc2626; background: #fef2f2; border: 1px solid #fca5a5; padding: 0.3rem 0.55rem; border-radius: 0.5rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.25rem;"
                                title="Dejar de mostrar esta comanda en la pantalla"
                                (click)="$event.stopPropagation(); dismissOrder(order.id, section.area)"
                              >
                                <i class="bi bi-eye-slash" aria-hidden="true"></i> Dejar de mostrar
                              </button>
                            }
                          </div>
                        </article>
                      } @empty {
                        <p class="empty-state">Sin comandas para esta estación.</p>
                      }
                      }
                    </div>
                  </article>
                }
              </section>
            } @else {
              <section class="restaurant-sections">
                <article class="panel section-panel section-panel--board">
                  <div class="section-head">
                    <h2>Comanda completa</h2>
                    <span class="count-pill">{{ allAreaOrders().length }} comandas</span>
                  </div>

                  <label class="ops-search-box">
                    <i class="bi bi-search" aria-hidden="true"></i>
                    <input
                      type="text"
                      [ngModel]="orderSearchQuery()"
                      (ngModelChange)="orderSearchQuery.set($event || '')"
                      placeholder="Busqueda"
                    />
                  </label>

                  <div class="orders-cards orders-cards--board">
                    @if (isDataLoading() && !allAreaOrders().length) {
                      <article class="state-card">
                        <span class="state-spinner" aria-hidden="true"></span>
                        <strong>Cargando comandas...</strong>
                      </article>
                    } @else if (dataError() && !allAreaOrders().length) {
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
                    @for (order of allAreaOrders(); track order.id) {
                      <article
                        class="ops-order-card clickable-card"
                        [class]="'ops-order-card clickable-card ' + (isOrderAllDelivered(order, 'ALL') ? 'all-delivered ' : '') + statusClass(order.status) + (selectedOrder()?.id === order.id ? ' selected' : '')"
                        (click)="openDetail(order.id)"
                      >
                        <div class="ops-order-head">
                          <div>
                            @if (order.id.startsWith('PPS')) {
                              <strong>Mesa {{ tableLabel(order) }}</strong>
                              <small>
                                {{ order.items.length }} items
                                @if (!order.clientName.startsWith('Mesa ')) {
                                  | {{ order.clientName }}
                                }
                              </small>
                              <small class="ops-order-creator" style="color: #a4b4cb;">{{ getCreatorLabel(order) }}</small>
                            } @else {
                              <strong>{{ order.items.length }} items | Mesa {{ tableLabel(order) }}</strong>
                              <small>{{ order.clientName }}</small>
                            }
                            @if (isOrderAllDelivered(order, 'ALL')) {
                              <span style="font-size: 0.68rem; font-weight: 800; background: #dcfce7; color: #15803d; border: 1px solid #86efac; padding: 0.12rem 0.45rem; border-radius: 0.4rem; display: inline-flex; align-items: center; gap: 0.25rem; margin-top: 0.2rem;">
                                <i class="bi bi-check-circle-fill" aria-hidden="true"></i> RETIRADA
                              </span>
                            } @else if (order.status === 'COBRADO') {
                              <span style="font-size: 0.68rem; font-weight: 800; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; padding: 0.1rem 0.4rem; border-radius: 0.4rem; display: inline-flex; align-items: center; gap: 0.2rem; margin-top: 0.2rem;">
                                <i class="bi bi-cash-coin" aria-hidden="true"></i> COBRADO
                              </span>
                            }
                          </div>
                          <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.25rem;">
                            <span class="ops-order-ref">#{{ order.id }}</span>
                            <span class="ops-order-time-badge" [class]="'ops-order-time-badge ' + getElapsedTimeClass(order.createdAt)" [title]="'Creada a las ' + (order.createdAt | date:'hh:mm:ss a')">
                              <i class="bi bi-clock-history" aria-hidden="true"></i> {{ getElapsedTime(order.createdAt) }}
                            </span>
                          </div>
                        </div>

                        <div class="ops-order-body">
                          <span class="ops-order-label">Comanda</span>
                          <ul class="ops-preview-list">
                            @for (item of previewItems(order); track item.id) {
                              <li style="display: flex; align-items: center; justify-content: space-between; gap: 0.4rem; padding: 0.2rem 0; border-bottom: 1px dashed #f1f5f9;">
                                <span [style.text-decoration]="item.status === 'ENTREGADO' || isItemReadyForArea(item, item.area) ? 'line-through' : 'none'" [style.opacity]="item.status === 'ENTREGADO' ? '0.6' : (isItemReadyForArea(item, item.area) ? '0.75' : '1')" style="display: flex; align-items: center; gap: 0.35rem; font-size: 0.82rem; font-weight: 700; color: #1e293b; flex-wrap: wrap;">
                                  <span style="font-weight: 800; color: #0284c7;">{{ item.quantity }}x</span>
                                  <span>{{ item.productName }}</span>
                                  <span style="font-size: 0.65rem; font-weight: 800; background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; padding: 0.1rem 0.35rem; border-radius: 0.35rem;">
                                    {{ areaLabel(item.area) }}
                                  </span>
                                  @if (item.note) {
                                    <small style="color: #ea580c; font-size: 0.72rem; font-weight: 600;">({{ item.note }})</small>
                                  }
                                </span>
                                @if (item.status === 'ENTREGADO') {
                                  <span class="ops-item-delivered-badge" style="font-size: 0.72rem; font-weight: 800; color: #15803d; background: #dcfce7; border: 1px solid #86efac; padding: 0.15rem 0.45rem; border-radius: 0.4rem; display: inline-flex; align-items: center; gap: 0.25rem;">
                                    <i class="bi bi-check2-all" aria-hidden="true"></i> Ya retirado
                                  </span>
                                } @else if (isItemReadyForArea(item, item.area)) {
                                  <span class="ops-item-ready-badge">
                                    <i class="bi bi-check-lg" aria-hidden="true"></i> LISTO
                                  </span>
                                } @else {
                                  <button
                                    type="button"
                                    class="ops-item-ready-btn"
                                    title="Marcar este artículo como listo"
                                    (click)="$event.stopPropagation(); markReady(order.id, item.id, item.area)"
                                  >
                                    <i class="bi bi-check2" aria-hidden="true"></i> Listo
                                  </button>
                                }
                              </li>
                            }
                          </ul>
                        </div>

                        <div class="ops-order-foot" style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap;">
                          @if (hasPendingItems(order, 'ALL')) {
                            <button
                              type="button"
                              class="btn-ghost ops-ready-btn"
                              (click)="$event.stopPropagation(); markNextPendingItemReady(order)"
                            >
                              Marcar siguiente
                            </button>
                          } @else {
                            <span style="font-size: 0.76rem; font-weight: 800; color: #065f46; background: #d1fae5; border: 1px solid #6ee7b7; padding: 0.25rem 0.5rem; border-radius: 0.5rem; display: inline-flex; align-items: center; gap: 0.25rem;">
                              <i class="bi bi-check-circle-fill" aria-hidden="true"></i> {{ isOrderAllDelivered(order, 'ALL') ? 'RETIRADA' : 'LISTO' }}
                            </span>
                            <button
                              type="button"
                              class="btn-dismiss-order-btn"
                              style="font-size: 0.72rem; font-weight: 800; color: #dc2626; background: #fef2f2; border: 1px solid #fca5a5; padding: 0.3rem 0.55rem; border-radius: 0.5rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.25rem;"
                              title="Dejar de mostrar esta comanda en la pantalla"
                              (click)="$event.stopPropagation(); dismissOrder(order.id)"
                            >
                              <i class="bi bi-eye-slash" aria-hidden="true"></i> Dejar de mostrar
                            </button>
                          }
                        </div>
                      </article>
                    } @empty {
                      <p class="empty-state">Sin comandas para esta vista.</p>
                    }
                    }
                  </div>
                </article>
              </section>
            }
          } @else {
            <section class="restaurant-sections">
              @for (section of areaSections(); track section.restaurantId) {
                <article class="panel section-panel section-panel--board">
                  <div class="section-head">
                    <h2>{{ section.restaurantName }}</h2>
                    <span class="count-pill">{{ section.orders.length }} comandas</span>
                  </div>

                  <label class="ops-search-box">
                    <i class="bi bi-search" aria-hidden="true"></i>
                    <input
                      type="text"
                      [ngModel]="orderSearchQuery()"
                      (ngModelChange)="orderSearchQuery.set($event || '')"
                      placeholder="Busqueda"
                    />
                  </label>

                  <div class="orders-cards orders-cards--board">
                    @if (isDataLoading() && !section.orders.length) {
                      <article class="state-card">
                        <span class="state-spinner" aria-hidden="true"></span>
                        <strong>Cargando comandas...</strong>
                      </article>
                    } @else if (dataError() && !section.orders.length) {
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
                    @for (order of section.orders; track order.id) {
                      <article
                        class="ops-order-card clickable-card"
                        [class]="'ops-order-card clickable-card ' + (isOrderAllDelivered(order, selectedArea()) ? 'all-delivered ' : '') + statusClass(order.status) + (selectedOrder()?.id === order.id ? ' selected' : '')"
                        (click)="openDetail(order.id)"
                      >
                        <div class="ops-order-head">
                          <div>
                            @if (order.id.startsWith('PPS')) {
                              <strong>Mesa {{ tableLabel(order) }}</strong>
                              <small>
                                {{ order.items.length }} items
                                @if (!order.clientName.startsWith('Mesa ')) {
                                  | {{ order.clientName }}
                                }
                              </small>
                              <small class="ops-order-creator" style="color: #a4b4cb;">{{ getCreatorLabel(order) }}</small>
                            } @else {
                              <strong>{{ order.items.length }} items | Mesa {{ tableLabel(order) }}</strong>
                              <small>{{ order.clientName }}</small>
                            }
                            @if (isOrderAllDelivered(order, selectedArea())) {
                              <span style="font-size: 0.68rem; font-weight: 800; background: #dcfce7; color: #15803d; border: 1px solid #86efac; padding: 0.12rem 0.45rem; border-radius: 0.4rem; display: inline-flex; align-items: center; gap: 0.25rem; margin-top: 0.2rem;">
                                <i class="bi bi-check-circle-fill" aria-hidden="true"></i> RETIRADA
                              </span>
                            } @else if (order.status === 'COBRADO') {
                              <span style="font-size: 0.68rem; font-weight: 800; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; padding: 0.1rem 0.4rem; border-radius: 0.4rem; display: inline-flex; align-items: center; gap: 0.2rem; margin-top: 0.2rem;">
                                <i class="bi bi-cash-coin" aria-hidden="true"></i> COBRADO
                              </span>
                            }
                          </div>
                          <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.25rem;">
                            <span class="ops-order-ref">#{{ order.id }}</span>
                            <span class="ops-order-time-badge" [class]="'ops-order-time-badge ' + getElapsedTimeClass(order.createdAt)" [title]="'Creada a las ' + (order.createdAt | date:'hh:mm:ss a')">
                              <i class="bi bi-clock-history" aria-hidden="true"></i> {{ getElapsedTime(order.createdAt) }}
                            </span>
                          </div>
                        </div>

                        <div class="ops-order-body">
                          <span class="ops-order-label">Comanda</span>
                          <ul class="ops-preview-list">
                            @for (item of previewItems(order); track item.id) {
                              <li style="display: flex; align-items: center; justify-content: space-between; gap: 0.4rem; padding: 0.2rem 0; border-bottom: 1px dashed #f1f5f9;">
                                <span [style.text-decoration]="item.status === 'ENTREGADO' || isItemReadyForArea(item, selectedArea()) ? 'line-through' : 'none'" [style.opacity]="item.status === 'ENTREGADO' ? '0.6' : (isItemReadyForArea(item, selectedArea()) ? '0.75' : '1')" style="display: flex; align-items: center; gap: 0.35rem; font-size: 0.82rem; font-weight: 700; color: #1e293b;">
                                  <span style="font-weight: 800; color: #0284c7;">{{ item.quantity }}x</span>
                                  <span>{{ item.productName }}</span>
                                  @if (item.note) {
                                    <small style="color: #ea580c; font-size: 0.72rem; font-weight: 600;">({{ item.note }})</small>
                                  }
                                </span>
                                @if (item.status === 'ENTREGADO') {
                                  <span class="ops-item-delivered-badge" style="font-size: 0.72rem; font-weight: 800; color: #15803d; background: #dcfce7; border: 1px solid #86efac; padding: 0.15rem 0.45rem; border-radius: 0.4rem; display: inline-flex; align-items: center; gap: 0.25rem;">
                                    <i class="bi bi-check2-all" aria-hidden="true"></i> Ya retirado
                                  </span>
                                } @else if (isItemReadyForArea(item, selectedArea())) {
                                  <span class="ops-item-ready-badge">
                                    <i class="bi bi-check-lg" aria-hidden="true"></i> LISTO
                                  </span>
                                } @else {
                                  <button
                                    type="button"
                                    class="ops-item-ready-btn"
                                    title="Marcar este artículo como listo"
                                    (click)="$event.stopPropagation(); markReady(order.id, item.id, selectedArea())"
                                  >
                                    <i class="bi bi-check2" aria-hidden="true"></i> Listo
                                  </button>
                                }
                              </li>
                            }
                          </ul>
                        </div>

                        <div class="ops-order-foot" style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap;">
                          @if (hasPendingItems(order, selectedArea())) {
                            <button
                              type="button"
                              class="btn-ghost ops-ready-btn"
                              (click)="$event.stopPropagation(); markNextPendingItemReady(order, selectedArea())"
                            >
                              Marcar siguiente
                            </button>
                          } @else {
                            <span style="font-size: 0.76rem; font-weight: 800; color: #065f46; background: #d1fae5; border: 1px solid #6ee7b7; padding: 0.25rem 0.5rem; border-radius: 0.5rem; display: inline-flex; align-items: center; gap: 0.25rem;">
                              <i class="bi bi-check-circle-fill" aria-hidden="true"></i> {{ isOrderAllDelivered(order, selectedArea()) ? 'RETIRADA' : 'LISTO' }}
                            </span>
                            <button
                              type="button"
                              class="btn-dismiss-order-btn"
                              style="font-size: 0.72rem; font-weight: 800; color: #dc2626; background: #fef2f2; border: 1px solid #fca5a5; padding: 0.3rem 0.55rem; border-radius: 0.5rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.25rem;"
                              title="Dejar de mostrar esta comanda en la pantalla"
                              (click)="$event.stopPropagation(); dismissOrder(order.id, selectedArea())"
                            >
                              <i class="bi bi-eye-slash" aria-hidden="true"></i> Dejar de mostrar
                            </button>
                          }
                        </div>
                      </article>
                    } @empty {
                      <p class="empty-state">Sin comandas para esta seccion.</p>
                    }
                    }
                  </div>
                </article>
              }
            </section>
          }

          <!-- Historial de Artículos Comandados por Estación (Últimos 5) -->
          <section class="panel history-section" style="margin-top: 1.5rem; background: #ffffff; border-radius: 1rem; padding: 1.25rem; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
            <div class="section-head" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; border-bottom: 2px solid #f1f5f9; padding-bottom: 0.75rem;">
              <h2 style="font-size: 1.15rem; font-weight: 900; color: #1e293b; margin: 0; display: flex; align-items: center; gap: 0.5rem;">
                <i class="bi bi-clock-history" style="color: #2563eb;" aria-hidden="true"></i>
                Historial de Artículos Comandados (Últimos 5 {{ selectedArea() !== 'ALL' ? '- Estación ' + selectedAreaLabel() : '' }})
              </h2>
              <span class="count-pill" style="font-weight: 800; background: #eff6ff; color: #1d4ed8; padding: 0.25rem 0.65rem; border-radius: 0.75rem; font-size: 0.8rem;">
                Últimos 5 ítems de esta pantalla
              </span>
            </div>

            <div style="overflow-x: auto;">
              <table class="history-table" style="width: 100%; border-collapse: collapse; font-size: 0.88rem; text-align: left;">
                <thead>
                  <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0; color: #475569; font-weight: 800;">
                    <th style="padding: 0.65rem 0.85rem;"># Comanda</th>
                    <th style="padding: 0.65rem 0.85rem;">Hora</th>
                    <th style="padding: 0.65rem 0.85rem;">Mesa / Cliente</th>
                    <th style="padding: 0.65rem 0.85rem;">Artículo / Producto</th>
                    <th style="padding: 0.65rem 0.85rem; text-align: center;">Cant.</th>
                    <th style="padding: 0.65rem 0.85rem;">Estación</th>
                    <th style="padding: 0.65rem 0.85rem; text-align: right;">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  @for (itemHistory of recentItemsHistory(); track $index) {
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                      <td style="padding: 0.65rem 0.85rem; font-weight: 800; color: #1e293b;">#{{ itemHistory.orderId }}</td>
                      <td style="padding: 0.65rem 0.85rem; color: #64748b;">{{ itemHistory.createdAt | date:'shortTime' }}</td>
                      <td style="padding: 0.65rem 0.85rem; font-weight: 700; color: #334155;">
                        Mesa {{ itemHistory.tableNumber }} <small style="color: #94a3b8; font-weight: normal;">({{ itemHistory.clientName }})</small>
                      </td>
                      <td style="padding: 0.65rem 0.85rem; font-weight: 800; color: #0f172a;">{{ itemHistory.productName }}</td>
                      <td style="padding: 0.65rem 0.85rem; text-align: center; font-weight: 900; color: #2563eb;">{{ itemHistory.quantity }}x</td>
                      <td style="padding: 0.65rem 0.85rem;">
                        <span style="font-size: 0.72rem; font-weight: 800; background: #f1f5f9; color: #475569; padding: 0.15rem 0.45rem; border-radius: 0.4rem;">
                          {{ areaLabel(itemHistory.area) }}
                        </span>
                      </td>
                      <td style="padding: 0.65rem 0.85rem; text-align: right;">
                        @if (itemHistory.status === 'LISTO') {
                          <span style="font-size: 0.72rem; font-weight: 800; background: #d1fae5; color: #065f46; border: 1px solid #a7f3d0; padding: 0.15rem 0.5rem; border-radius: 0.5rem;">
                            ✓ Listo
                          </span>
                        } @else if (itemHistory.status === 'ENTREGADO') {
                          <span style="font-size: 0.72rem; font-weight: 700; background: #e0e7ff; color: #3730a3; border: 1px solid #c7d2fe; padding: 0.15rem 0.45rem; border-radius: 0.5rem;">
                            ✓ Entregado
                          </span>
                        } @else {
                          <span style="font-size: 0.72rem; font-weight: 700; background: #fef3c7; color: #92400e; border: 1px solid #fde68a; padding: 0.15rem 0.45rem; border-radius: 0.5rem;">
                            En prep.
                          </span>
                        }
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="7" style="padding: 1rem; text-align: center; color: #64748b; font-style: italic;">
                        No hay artículos en el historial reciente para esta pantalla.
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        </div>

        @if (selectedOrder()) {
          <aside class="ops-side-panel">
            <div class="section-head">
              <h2>Detalles de Comanda</h2>
              <button type="button" class="btn-ghost ops-side-close" (click)="closeDetail()">
                <i class="bi bi-x-lg" aria-hidden="true"></i>
              </button>
            </div>

            <div class="ops-side-summary">
              <div>
                <strong>{{ selectedOrder()!.clientName }}</strong>
                <small>{{ selectedOrder()!.items.length }} items | Mesa {{ tableLabel(selectedOrder()!) }}</small>
                <!-- Membrete con fecha, hora y mesonero debajo de la identificación de la mesa -->
                <div class="order-detail-meta" style="margin-top: 0.35rem; display: flex; flex-wrap: wrap; gap: 0.65rem; align-items: center; font-size: 0.78rem; color: #cbd5e1;">
                  <span style="display: inline-flex; align-items: center; gap: 0.25rem;">
                    <i class="bi bi-calendar3" style="color: #38bdf8;"></i>
                    <strong>Fecha:</strong> {{ selectedOrder()!.createdAt | date:'dd/MM/yyyy' }}
                  </span>
                  <span style="display: inline-flex; align-items: center; gap: 0.25rem;">
                    <i class="bi bi-clock-history" style="color: #38bdf8;"></i>
                    <strong>Hora:</strong> {{ selectedOrder()!.createdAt | date:'hh:mm a' }}
                  </span>
                  <span style="display: inline-flex; align-items: center; gap: 0.25rem;">
                    <i class="bi bi-stopwatch" style="color: #f59e0b;"></i>
                    <strong>Tiempo:</strong> {{ getElapsedTime(selectedOrder()!.createdAt) }}
                  </span>
                  <span style="display: inline-flex; align-items: center; gap: 0.25rem;">
                    <i class="bi bi-person-badge-fill" style="color: #38bdf8;"></i>
                    <strong>Mesonero:</strong> {{ getCreatorLabel(selectedOrder()!) }}
                  </span>
                </div>
              </div>
              <span class="ops-order-ref">#{{ selectedOrder()!.id }}</span>
            </div>

            <div class="ops-side-items">
              @for (item of selectedOrder()!.items; track item.id) {
                <article class="ops-side-item" style="display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; padding: 0.5rem 0; border-bottom: 1px solid #f1f5f9;">
                  <div class="ops-side-item-copy">
                    <strong [style.text-decoration]="item.status === 'LISTO' ? 'line-through' : 'none'" [style.opacity]="item.status === 'LISTO' ? '0.7' : '1'">
                      {{ item.productName }}
                    </strong>
                    <small>{{ restaurantLabel(item.restaurantId) }} / {{ areaLabel(item.area) }}</small>
                    @if (item.note) {
                      <small class="item-note">Nota: {{ item.note }}</small>
                    }
                  </div>
                  <div class="align-end" style="display: flex; align-items: center; gap: 0.6rem;">
                    <div style="text-align: right; line-height: 1.2;">
                      <small>x{{ item.quantity }}</small>
                      <div style="font-size: 0.75rem; color: #64748b;">Subt: {{ item.quantity * item.unitPrice | currency:'USD' }}</div>
                      <div><strong style="color: #059669; font-size: 0.85rem;">Total: {{ (item.quantity * item.unitPrice * 1.16) | currency:'USD' }}</strong></div>
                    </div>
                    @if (item.status === 'ENTREGADO') {
                      <span class="ops-item-delivered-badge" style="font-size: 0.72rem; font-weight: 800; color: #15803d; background: #dcfce7; border: 1px solid #86efac; padding: 0.15rem 0.45rem; border-radius: 0.4rem; display: inline-flex; align-items: center; gap: 0.25rem;">
                        <i class="bi bi-check2-all" aria-hidden="true"></i> Ya retirado
                      </span>
                    } @else if (isItemReadyForArea(item, selectedArea())) {
                      <span class="ops-item-ready-badge">
                        <i class="bi bi-check-lg" aria-hidden="true"></i> Listo
                      </span>
                    } @else {
                      <button
                        type="button"
                        class="ops-item-ready-btn"
                        title="Marcar este producto como Listo"
                        (click)="markReady(selectedOrder()!.id, item.id, selectedArea() === 'ALL' ? item.area : selectedArea())"
                      >
                        <i class="bi bi-check2" aria-hidden="true"></i> Listo
                      </button>
                    }
                  </div>
                </article>
              }
            </div>

            <div class="ops-side-total-row" style="display: flex; flex-direction: column; gap: 4px; padding: 0.65rem 0; border-top: 1px dashed #e2e8f0; margin-top: 0.5rem;">
              <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: #64748b;">
                <span>Subtotal (sin IVA):</span>
                <span>{{ orderTotal(selectedOrder()!) | currency:'USD' }}</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: #64748b;">
                <span>+IVA (16%):</span>
                <span>{{ (orderTotal(selectedOrder()!) * 0.16) | currency:'USD' }}</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 1.05rem; font-weight: 800; color: #059669;">
                <span>Total:</span>
                <span>{{ (orderTotal(selectedOrder()!) * 1.16) | currency:'USD' }}</span>
              </div>
              <div style="text-align: right; font-size: 0.8rem; color: #6b7280;">
                <span>Total Bs: {{ (orderTotal(selectedOrder()!) * 1.16 * bcvRate()) | number:'1.2-2' }} Bs</span>
              </div>
            </div>

            @if (hasPendingItems(selectedOrder()!, selectedArea())) {
              <button
                type="button"
                style="width: 100%; margin-top: 0.75rem; background: #059669; border-color: #047857; color: #ffffff; font-weight: 800; display: flex; align-items: center; justify-content: center; gap: 0.5rem; border-radius: 0.5rem; padding: 0.6rem 1rem; cursor: pointer;"
                (click)="markAllReadyInSidePanel(selectedOrder()!.id)"
              >
                <i class="bi bi-check-circle-fill" aria-hidden="true"></i> Marcar estación lista
              </button>
            } @else {
              <button
                type="button"
                class="btn-dismiss-order-btn"
                style="width: 100%; margin-top: 0.75rem; font-size: 0.85rem; font-weight: 800; color: #dc2626; background: #fef2f2; border: 1px solid #fca5a5; padding: 0.6rem 1rem; border-radius: 0.5rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.4rem;"
                title="Dejar de mostrar esta comanda en la pantalla"
                (click)="dismissOrder(selectedOrder()!.id, selectedArea() === 'ALL' ? undefined : selectedArea())"
              >
                <i class="bi bi-eye-slash" aria-hidden="true"></i> Dejar de mostrar comanda
              </button>
            }

            <span class="status-pill ops-side-status" [class]="'status-pill ops-side-status ' + statusClass(selectedOrder()!.status)">
              {{ orderStatusLabel(selectedOrder()!.status) }}
            </span>
          </aside>
        }
      </section>
      }
    </section>
  `,
  styles: `
    button {
      min-height: 42px;
      padding: 0.48rem 0.92rem;
      border-radius: 0.5rem;
      border: 1px solid #0d6efd;
      background: #0d6efd;
      color: #ffffff;
      font-weight: 700;
      font-size: 0.9rem;
      box-shadow: none;
      transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
    }

    button:hover {
      background: #ebc356;
      border-color: #574d33;
      color: #ffffff;
    }

    button:disabled {
      background: #9ec5fe;
      border-color: #9ec5fe;
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

    .control-panel {
      display: grid;
      gap: 0.8rem;
    }

    .chip-group {
      display: grid;
      gap: 0.4rem;
    }

    .chip-group small {
      color: #6b7396;
      font-weight: 600;
    }

    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
    }

    .chip {
      border: 1px solid #6c757d;
      background: #ffffff;
      color: #495057;
      border-radius: 999px;
      padding: 0.35rem 0.75rem;
      font-size: 0.83rem;
      font-weight: 700;
    }

    .chip.active {
      background: #0d6efd;
      color: #fff;
      border-color: #0d6efd;
    }

    .ops-columns {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 0.85rem;
    }

    .restaurant-sections {
      display: grid;
      gap: 0.85rem;
    }

    .column-panel,
    .section-panel {
      display: grid;
      gap: 0.7rem;
    }

    .column-head,
    .section-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.7rem;
    }

    .column-head h2,
    .section-head h2 {
      margin: 0;
      font-size: 1.05rem;
      color: #40486d;
    }

    .count-pill {
      background: #edf1ff;
      color: #525a88;
      border: 1px solid #dbe2ff;
      border-radius: 999px;
      padding: 0.18rem 0.55rem;
      font-size: 0.76rem;
      font-weight: 700;
    }

    .orders-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
      gap: 0.7rem;
    }

    .orders-cards--wide {
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    }

    .order-card {
      border-radius: 0.95rem;
      border: 1px solid #e6ebff;
      background: linear-gradient(140deg, #ffffff 0%, #f8faff 100%);
      padding: 0.75rem;
      display: grid;
      gap: 0.6rem;
    }

    .clickable-card {
      cursor: pointer;
      transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
    }

    .clickable-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 14px 28px rgba(80, 92, 145, 0.12);
      border-color: #cfd8ff;
    }

    .order-card.PENDIENTE {
      border-color: #ffd9be;
      background: linear-gradient(140deg, #fff8f2 0%, #fff1e6 100%);
    }

    .order-card.EN_PROCESO {
      border-color: #ffe8a8;
      background: linear-gradient(140deg, #fffdf3 0%, #fff8df 100%);
    }

    .order-card.LISTO {
      border-color: #bceacb;
      background: linear-gradient(140deg, #f3fff7 0%, #e8ffef 100%);
    }

    .card-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.6rem;
    }

    .card-body {
      display: grid;
      gap: 0.2rem;
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
      background: #fff2c9;
      color: #8d6a00;
      border-color: #ffe196;
    }

    .status-pill.LISTO {
      background: #daf9e4;
      color: #2f7a48;
      border-color: #bceacb;
    }

    .item-list {
      display: grid;
      gap: 0.45rem;
    }

    .group-list {
      display: grid;
      gap: 0.6rem;
    }

    .group-block {
      display: grid;
      gap: 0.55rem;
      padding: 0.55rem;
      border-radius: 0.8rem;
      background: rgba(255, 255, 255, 0.5);
      border: 1px solid rgba(223, 228, 255, 0.8);
    }

    .group-head {
      color: #414a71;
    }

    .area-block {
      display: grid;
      gap: 0.35rem;
    }

    .area-title {
      color: #6a7399;
      font-weight: 700;
    }

    .item-row {
      display: flex;
      justify-content: space-between;
      gap: 0.65rem;
      align-items: center;
      padding: 0.45rem;
      border-radius: 0.7rem;
      background: rgba(255, 255, 255, 0.65);
      border: 1px solid rgba(223, 228, 255, 0.8);
    }

    .item-row--compact {
      padding: 0.4rem 0.45rem;
    }

    .item-row strong {
      display: block;
      color: #3f476c;
      font-size: 0.88rem;
    }

    .item-row small,
    .card-body small {
      color: #70789a;
    }

    .item-note {
      display: block;
      margin-top: 0.18rem;
      color: #536087;
      font-weight: 600;
      font-style: italic;
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

    .modal-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.7rem;
    }

    .detail-summary {
      margin: 0;
      color: #6e769a;
    }

    .detail-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 0.55rem;
    }

    .detail-list li {
      display: flex;
      justify-content: space-between;
      gap: 0.8rem;
      align-items: center;
      padding: 0.6rem 0.7rem;
      border-radius: 0.75rem;
      background: #f8faff;
      border: 1px solid #e3e8ff;
    }

    .align-end {
      text-align: right;
    }

    .detail-total {
      margin: 0;
      color: #424b72;
    }

    .page {
      display: grid;
      gap: 1.2rem;
      background: #ffffff;
      font-family: 'Montserrat', 'Sora', sans-serif;
    }

    .page-header h1 {
      margin: 0;
      color: #111111;
      font-size: clamp(2.2rem, 4vw, 3.4rem);
      line-height: 0.96;
      font-weight: 900;
      letter-spacing: -0.05em;
    }

    .control-panel {
      display: grid;
      gap: 1rem;
      background: transparent;
      border: none;
      box-shadow: none;
      padding: 0;
    }

    .chip-group {
      display: grid;
      gap: 0.55rem;
    }

    .chip-group small {
      color: #282828;
      font-size: 0.9rem;
      font-weight: 900;
    }

    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.8rem;
    }

    .chip {
      min-width: 180px;
      min-height: 50px;
      border: 2px solid #d8d8d8;
      background: #ffffff;
      color: #191919;
      border-radius: 999px;
      padding: 0.55rem 1.3rem;
      font-size: 0.92rem;
      font-weight: 800;
      box-shadow: inset 0 0 0 1px rgba(29, 29, 29, 0.06);
    }

    .chip.active {
      background: #9b7712;
      border-color: #5a4b21;
      color: #fff9ea;
      box-shadow: inset 0 0 0 3px rgba(70, 58, 26, 0.35);
    }

    .ops-workspace {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 1.2rem;
      align-items: start;
      overflow-x: auto;
    }

    .ops-workspace.detail-open {
      grid-template-columns: minmax(0, 1fr) minmax(300px, 360px);
    }

    .ops-board {
      min-width: 0;
    }

    .restaurant-sections {
      display: grid;
      gap: 1rem;
    }

    .section-panel--board {
      display: grid;
      gap: 0.95rem;
      border-radius: 1.9rem;
      border: 1px solid #dedede;
      padding: 1rem 1.05rem 1.1rem;
      box-shadow: none;
      background: #ffffff;
    }

    .section-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.9rem;
    }

    .section-head h2 {
      margin: 0;
      color: #101010;
      font-size: clamp(1.6rem, 2.4vw, 2rem);
      font-weight: 900;
      line-height: 1;
      letter-spacing: -0.04em;
      background: transparent;
      padding: 0;
      min-width: 0;
      text-align: left;
    }

    .count-pill {
      min-width: 150px;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      border: 2px solid #dddddd;
      background: #ffffff;
      color: #1a1a1a;
      font-size: 0.9rem;
      font-weight: 800;
      padding: 0 1rem;
    }

    .ops-search-box {
      display: flex;
      align-items: center;
      gap: 0.7rem;
      max-width: 560px;
      min-height: 46px;
      padding: 0 0.9rem;
      border-radius: 0.65rem;
      background: #ececec;
      color: #88857f;
    }

    .ops-search-box i {
      font-size: 1.05rem;
      color: #87827b;
    }

    .ops-search-box input {
      min-height: 34px;
      width: 100%;
      border: none;
      background: transparent;
      color: #34302b;
      font-size: 0.92rem;
      font-weight: 600;
      outline: none;
    }

    .orders-cards--board {
      grid-template-columns: repeat(auto-fill, 220px);
      justify-content: start;
      gap: 0.9rem;
    }

    .ops-order-card {
      border-radius: 1.25rem;
      border: 1px solid #dddddd;
      background: #ffffff;
      padding: 0.9rem 1rem;
      display: grid;
      gap: 0.7rem;
      box-shadow: none;
      min-height: 70px;
      width: 100%;
    }

    .ops-order-card.selected {
      border-color: #9b7712;
      box-shadow: inset 0 0 0 2px rgba(155, 119, 18, 0.22);
    }

    .clickable-card {
      cursor: pointer;
      transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
    }

    .clickable-card:hover {
      transform: translateY(-2px);
      border-color: #c8b06f;
      box-shadow: 0 12px 24px rgba(92, 79, 35, 0.1);
    }

    .ops-order-card.PENDIENTE,
    .ops-order-card.EN_PROCESO {
      background: #ffffff;
    }

    .ops-order-card.all-delivered {
      background: #f0fdf4 !important;
      border: 2px solid #22c55e !important;
      box-shadow: 0 4px 14px rgba(34, 197, 94, 0.16) !important;
    }

    .ops-order-card.all-delivered .ops-order-head strong {
      color: #15803d !important;
    }

    .ops-order-card.all-delivered .ops-order-label {
      color: #166534 !important;
    }

    .ops-item-delivered-badge {
      font-size: 0.72rem;
      font-weight: 800;
      color: #15803d;
      background: #dcfce7;
      border: 1px solid #86efac;
      padding: 0.15rem 0.45rem;
      border-radius: 0.4rem;
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
    }

    .btn-dismiss-order-btn:hover {
      background: #fee2e2 !important;
      border-color: #f87171 !important;
      color: #b91c1c !important;
    }

    .ops-order-head {
      display: flex;
      justify-content: space-between;
      gap: 0.8rem;
      align-items: flex-start;
    }

    .ops-order-head strong {
      display: block;
      color: #111111;
      font-size: 1rem;
      font-weight: 900;
      line-height: 1.05;
    }

    .ops-order-head small {
      display: block;
      margin-top: 0.28rem;
      color: #ba9830;
      font-size: 0.78rem;
      font-weight: 800;
    }

    .ops-order-ref {
      color: #8d8a85;
      font-size: 0.78rem;
      font-weight: 800;
      white-space: nowrap;
    }

    .ops-order-time-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.72rem;
      font-weight: 800;
      padding: 0.15rem 0.45rem;
      border-radius: 0.45rem;
      white-space: nowrap;
      line-height: 1.2;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    }

    .ops-order-time-badge.time-normal {
      background: #f0fdf4;
      color: #166534;
      border: 1px solid #bbf7d0;
    }

    .ops-order-time-badge.time-warning {
      background: #fefce8;
      color: #854d0e;
      border: 1px solid #fde047;
    }

    .ops-order-time-badge.time-urgent {
      background: #fef2f2;
      color: #991b1b;
      border: 1px solid #fca5a5;
      animation: pulse-urgent 2s infinite;
    }

    @keyframes pulse-urgent {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.85; transform: scale(1.02); }
    }

    .ops-order-body {
      display: grid;
      gap: 0.35rem;
      align-content: start;
    }

    .ops-order-label {
      color: #171717;
      font-size: 0.82rem;
      font-weight: 900;
    }

    .ops-preview-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 0.2rem;
    }

    .ops-preview-list li {
      color: #272727;
      font-size: 0.82rem;
      font-weight: 700;
      line-height: 1.2;
    }

    .ops-order-foot {
      margin-top: auto;
      display: flex;
      justify-content: flex-start;
    }

    .ops-ready-btn {
      min-height: 40px;
      min-width: 145px;
      border-radius: 999px;
      border: 2px solid #dddddd;
      background: #ffffff;
      color: #161616;
      font-weight: 800;
    }

    .ops-ready-btn:hover {
      background: #faf6ea;
      border-color: #b99830;
      color: #7b6110;
    }

    .ops-ready-btn:disabled {
      background: #f3f4f6;
      border-color: #e0e0e0;
      color: #8d8d8d;
    }

    .ops-item-ready-btn {
      font-size: 0.72rem;
      font-weight: 800;
      color: #059669;
      background: #ecfdf5;
      border: 1px solid #6ee7b7;
      padding: 0.2rem 0.55rem;
      border-radius: 0.45rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      min-height: unset;
      flex-shrink: 0;
      transition: all 0.15s ease;
      white-space: nowrap;
    }

    .ops-item-ready-btn:hover {
      background: #d1fae5;
      border-color: #34d399;
      color: #047857;
      transform: scale(1.03);
    }

    .ops-item-ready-badge {
      font-size: 0.68rem;
      font-weight: 800;
      background: #d1fae5;
      color: #065f46;
      border: 1px solid #a7f3d0;
      padding: 0.15rem 0.45rem;
      border-radius: 0.4rem;
      display: inline-flex;
      align-items: center;
      gap: 0.2rem;
      flex-shrink: 0;
      white-space: nowrap;
    }

    .ops-side-panel {
      position: sticky;
      top: 1rem;
      display: grid;
      gap: 1rem;
      align-content: start;
      min-width: 300px;
      min-height: 640px;
      padding: 1rem 1rem 1.15rem;
      border-radius: 1.9rem;
      border: 1px solid #dedede;
      background: #ffffff;
      box-shadow: none;
    }

    .ops-side-close {
      min-width: 42px;
      padding: 0;
      display: grid;
      place-items: center;
      border-radius: 999px;
    }

    .ops-side-summary {
      display: flex;
      justify-content: space-between;
      gap: 0.8rem;
      align-items: flex-start;
      padding-top: 0.3rem;
      border-top: 1px solid #e2e2e2;
    }

    .ops-side-summary strong {
      display: block;
      color: #111111;
      font-size: 1rem;
      font-weight: 900;
    }

    .ops-side-summary small {
      display: block;
      margin-top: 0.3rem;
      color: #ba9830;
      font-size: 0.8rem;
      font-weight: 800;
    }

    .ops-side-items {
      display: grid;
      gap: 0.85rem;
      align-content: start;
    }

    .ops-side-item {
      display: flex;
      justify-content: space-between;
      gap: 0.8rem;
      align-items: flex-start;
    }

    .ops-side-item-copy {
      display: grid;
      gap: 0.15rem;
    }

    .ops-side-item-copy strong {
      color: #141414;
      font-size: 0.98rem;
      font-weight: 800;
    }

    .ops-side-item-copy small {
      color: #666666;
      font-size: 0.8rem;
      font-weight: 600;
    }

    .align-end {
      text-align: right;
      display: grid;
      gap: 0.2rem;
    }

    .ops-side-total-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.8rem;
      padding-top: 1rem;
      border-top: 2px solid #111111;
      color: #111111;
      font-size: 0.98rem;
      font-weight: 800;
    }

    .ops-side-status {
      justify-self: end;
      align-self: end;
      margin-top: auto;
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 34px;
      padding: 0.3rem 0.8rem;
      border-radius: 0.75rem;
      font-size: 0.82rem;
      font-weight: 800;
      border: 1px solid transparent;
      background: #ecefff;
      color: #545cb0;
    }

    .status-pill.PENDIENTE {
      background: #ddebff;
      color: #2f69b3;
      border-color: #c0d7ff;
    }

    .status-pill.EN_PROCESO {
      background: #fff0c9;
      color: #8d6a00;
      border-color: #f1dfad;
    }

    .status-pill.LISTO {
      background: #daf9e4;
      color: #2f7a48;
      border-color: #bceacb;
    }

    .empty-state {
      margin: 0;
      padding: 1rem;
      border-radius: 1rem;
      background: #fafafa;
      color: #6e6e6e;
    }

    @media (max-width: 1100px) {
      .ops-side-panel {
        min-height: 0;
      }
    }

    @media (max-width: 720px) {
      .chips {
        gap: 0.55rem;
      }

      .chip {
        min-width: 138px;
        min-height: 46px;
        padding-inline: 1rem;
      }

      .section-panel--board {
        padding: 0.9rem;
      }

      .orders-cards--board {
        grid-template-columns: repeat(auto-fill, 220px);
      }

      .ops-order-card {
        min-height: 220px;
      }

      .count-pill {
        min-width: 124px;
      }
    }
  `
})
export class OpsScreenPageComponent {
  private readonly state = inject(AppStateService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly refreshIntervalMs = 15000;

  readonly selectedArea = signal<AreaId | 'ALL'>('ALL');
  readonly selectedRestaurant = signal<RestaurantId | 'ALL'>('ALL');
  readonly selectedOrderId = signal<string | null>(null);
  readonly orderSearchQuery = signal('');
  readonly canAccessOperations = computed(() => this.state.canAccessModule('operacion'));
  readonly isDataLoading = computed(() => this.state.runtimeDataLoading());
  readonly dataError = computed(() => this.state.runtimeDataError());
  readonly bcvRate = computed(() => this.state.appSettings().bcvRate);
  readonly currentTime = signal<number>(Date.now());
  private readonly allAreaOptions: Array<{ label: string; value: AreaId | 'ALL' }> = [
    { label: 'Todos', value: 'ALL' },
    { label: 'Cocina', value: 'COCINA' },
    { label: 'Grill', value: 'GRILL' },
    { label: 'Barra', value: 'BARRA' },
    { label: 'Pizzeria', value: 'PIZZERIA' },
    { label: 'Mostrador', value: 'CAJA' }
  ];

  readonly areas = computed<Array<{ label: string; value: AreaId | 'ALL' }>>(() => {
    const available = this.availableAreasForSelection();
    return this.allAreaOptions.filter((area) => area.value === 'ALL' || available.includes(area.value));
  });

  readonly restaurantFilters = computed<Array<{ label: string; value: RestaurantId | 'ALL' }>>(() => {
    const allowed = this.state.allowedRestaurantIds();
    if (allowed.length <= 1) {
      return allowed.map((restaurantId) => ({
        label: this.restaurantLabel(restaurantId),
        value: restaurantId
      }));
    }

    return [
      { label: 'Todos', value: 'ALL' },
      ...allowed.map((restaurantId) => ({
        label: this.restaurantLabel(restaurantId),
        value: restaurantId
      }))
    ];
  });

  constructor() {
    const allowed = this.state.allowedRestaurantIds();
    if (allowed.length === 1) {
      this.selectedRestaurant.set(allowed[0]);
    }
    this.ensureSelectedAreaIsValid();

    void this.refreshOrdersLive();

    const timerId = setInterval(() => {
      this.currentTime.set(Date.now());
      void this.refreshOrdersLive();
    }, this.refreshIntervalMs);

    this.destroyRef.onDestroy(() => {
      clearInterval(timerId);
    });
  }

  private loadDismissedOrderIds(): Set<string> {
    try {
      const saved = localStorage.getItem('ops_dismissed_orders');
      if (saved) {
        return new Set(JSON.parse(saved));
      }
    } catch {
      // ignore
    }
    return new Set();
  }

  private saveDismissedOrderIds(set: Set<string>): void {
    try {
      localStorage.setItem('ops_dismissed_orders', JSON.stringify([...set]));
    } catch {
      // ignore
    }
  }

  readonly dismissedItemIds = signal<Set<string>>(new Set());
  readonly dismissedOrderIds = signal<Set<string>>(this.loadDismissedOrderIds());

  dismissItem(itemId: string): void {
    this.dismissedItemIds.update((set) => {
      const next = new Set(set);
      next.add(itemId);
      return next;
    });
  }

  dismissOrder(orderId: string, area?: AreaId | 'ALL'): void {
    const targetArea = (area && area !== 'ALL') ? area : undefined;
    const key = targetArea ? `${orderId}::${targetArea}` : orderId;
    this.dismissedOrderIds.update((set) => {
      const next = new Set(set);
      next.add(key);
      this.saveDismissedOrderIds(next);
      return next;
    });
    this.state.dismissOrderInOps(orderId, targetArea);
    if (this.selectedOrderId() === orderId) {
      this.closeDetail();
    }
  }

  isItemDismissed(itemId: string): boolean {
    return this.dismissedItemIds().has(itemId);
  }

  isOrderDismissed(orderId: string, area?: AreaId | 'ALL'): boolean {
    const order = this.state.orders().find((o) => o.id === orderId);
    if (!order) {
      return false;
    }

    // Si la orden aún tiene artículos pendientes en esta área, NUNCA está descartada
    if (this.hasPendingItems(order, area)) {
      return false;
    }

    if (this.dismissedOrderIds().has(orderId)) {
      return true;
    }
    if (order.opsDismissedAt) {
      return true;
    }
    if (area && area !== 'ALL') {
      if (this.dismissedOrderIds().has(`${orderId}::${area}`)) {
        return true;
      }
      if (order.opsDismissedAreas?.includes(area)) {
        return true;
      }
    }
    return false;
  }

  readonly recentItemsHistory = computed(() => {
    const area = this.selectedArea();
    const selectedRestaurant = this.selectedRestaurant();
    const allOrders = this.state.getVisibleOrdersForModule('operacion');

    const itemsHistory: Array<{
      orderId: string;
      tableNumber: string;
      clientName: string;
      createdAt: string;
      productName: string;
      quantity: number;
      area: AreaId;
      restaurantId: RestaurantId;
      status: OrderItem['status'];
    }> = [];

    for (const order of allOrders) {
      if (this.isOrderDismissed(order.id) || order.opsDismissedAt) {
        continue;
      }
      for (const item of order.items) {
        if (selectedRestaurant !== 'ALL' && item.restaurantId !== selectedRestaurant) {
          continue;
        }

        const matchesArea =
          area === 'ALL' ||
          item.area === area ||
          (item.subItems && item.subItems.some((sub) => sub.area === area));

        if (matchesArea) {
          itemsHistory.push({
            orderId: order.id,
            tableNumber: this.tableLabel(order),
            clientName: order.clientName,
            createdAt: order.createdAt,
            productName: item.productName,
            quantity: item.quantity,
            area: item.area,
            restaurantId: item.restaurantId,
            status: item.status
          });
        }
      }
    }

    return itemsHistory
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  });

  readonly allAreaViewMode = signal<'POR_AREA' | 'COMPLETA'>('POR_AREA');

  readonly allAreaDivisionSections = computed(() => {
    const areas = this.availableAreasForSelection();
    const restaurantFilter = this.selectedRestaurant();
    return areas.map((area) => {
      const baseQueue = this.state.getAreaQueue(area, 'ALL');
      const orders = baseQueue
        .filter((order) => !this.isOrderDismissed(order.id, area))
        .map((order) => ({
          ...order,
          items: order.items.filter((item) => (restaurantFilter === 'ALL' || item.restaurantId === restaurantFilter) && !this.isItemDismissed(item.id))
        }))
        .filter((order) => order.items.length > 0)
        .filter((order) => this.matchesOrderSearch(order))
        .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());

      return {
        area,
        areaName: this.areaLabel(area),
        orders
      };
    }).filter((section) => section.orders.length > 0 || restaurantFilter !== 'ALL');
  });

  readonly areaSections = computed<AreaSection[]>(() => {
    const area = this.selectedArea();
    if (area === 'ALL') {
      return [];
    }

    const restaurantFilter = this.selectedRestaurant();
    const baseQueue = this.state.getAreaQueue(area, 'ALL');
    const restaurants: RestaurantId[] =
      restaurantFilter === 'ALL'
        ? this.restaurantFilters()
          .filter((entry) => entry.value !== 'ALL')
          .map((entry) => entry.value)
          .filter((value): value is RestaurantId => value !== 'ALL')
        : [restaurantFilter];

    return restaurants
      .map((restaurantId) => {
        const orders = baseQueue
          .filter((order) => !this.isOrderDismissed(order.id, area))
          .map((order) => ({
            ...order,
            items: order.items.filter((item) => item.restaurantId === restaurantId && !this.isItemDismissed(item.id))
          }))
          .filter((order) => order.items.length > 0)
          .filter((order) => this.matchesOrderSearch(order))
          .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());

        return {
          restaurantId,
          restaurantName: this.restaurantLabel(restaurantId),
          orders
        };
      })
      .filter((section) => section.orders.length > 0 || restaurantFilter !== 'ALL');
  });

  readonly allAreaOrders = computed(() => {
    const selectedRestaurant = this.selectedRestaurant();
    return this.state.getVisibleOrdersForModule('operacion')
      .filter((order) => !this.isOrderDismissed(order.id))
      .map((order) => ({
        ...order,
        items: order.items.filter((item) => {
          if (this.isItemDismissed(item.id) || item.status === 'ANULADO') {
            return false;
          }

          if (selectedRestaurant === 'ALL') {
            return true;
          }

          return item.restaurantId === selectedRestaurant;
        })
      }))
      .filter((order) => {
        if (order.status === 'ANULADO') {
          return false;
        }

        return order.items.length > 0;
      })
      .filter((order) => this.matchesOrderSearch(order))
      .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
  });

  readonly selectedOrder = computed(() => {
    const orderId = this.selectedOrderId();
    if (!orderId) {
      return null;
    }

    const selectedRestaurant = this.selectedRestaurant();
    const selectedArea = this.selectedArea();
    const order = this.state.orders().find((item) => item.id === orderId);
    if (!order) {
      return null;
    }

    const filteredOrder = {
      ...order,
      items: order.items.filter((item) => {
        if (item.status === 'ENTREGADO' || item.status === 'ANULADO') {
          return false;
        }

        if (selectedRestaurant !== 'ALL' && item.restaurantId !== selectedRestaurant) {
          return false;
        }

        if (selectedArea !== 'ALL') {
          const hasSubItems = !!(item.subItems && item.subItems.length > 0);
          const matchesMainArea = item.area === selectedArea;
          const matchesSubArea = hasSubItems && item.subItems!.some((sub) => sub.area === selectedArea && !sub.ready);
          if (!matchesMainArea && !matchesSubArea) {
            return false;
          }
        }

        return true;
      }).map((item) => {
        if (selectedArea !== 'ALL' && item.subItems && item.subItems.length > 0) {
          const subItemsForArea = item.subItems.filter((sub) => sub.area === selectedArea);
          if (subItemsForArea.length > 0) {
            const matchingSubItems = subItemsForArea
              .map((sub) => sub.ready ? `${sub.name} ✓` : sub.name)
              .join(' | ');
            return { ...item, productName: `${item.productName} (${matchingSubItems})` };
          }
          if (item.area === selectedArea) {
            const comboComponents = item.subItems
              .map((sub) => sub.ready ? `${sub.name} ✓` : sub.name)
              .join(' | ');
            return { ...item, productName: `${item.productName} [${comboComponents}]` };
          }
        }
        return item;
      })
    };

    return filteredOrder.items.length ? filteredOrder : null;
  });

  openDetail(orderId: string): void {
    this.selectedOrderId.set(orderId);
  }

  setSelectedRestaurant(restaurant: RestaurantId | 'ALL'): void {
    this.selectedRestaurant.set(restaurant);
    this.ensureSelectedAreaIsValid();
  }

  closeDetail(): void {
    this.selectedOrderId.set(null);
  }

  previewItems(order: Order): OrderItem[] {
    return order.items;
  }

  isItemReadyForArea(item: OrderItem, area?: AreaId | 'ALL'): boolean {
    if (item.status === 'LISTO' || item.status === 'ENTREGADO') {
      return true;
    }
    const targetArea = area ?? this.selectedArea();
    if (targetArea === 'ALL') {
      return false;
    }

    const hasSubs = !!(item.subItems && item.subItems.length > 0);
    if (hasSubs) {
      const subsInArea = item.subItems!.filter((sub) => sub.area === targetArea);
      if (subsInArea.length > 0) {
        return subsInArea.every((sub) => sub.ready);
      }
      return true;
    }

    return item.area === targetArea ? false : true;
  }

  isOrderAllDelivered(order: Order, area: AreaId | 'ALL' = 'ALL'): boolean {
    if (!order || !order.items || !order.items.length) {
      return false;
    }
    const targetArea = area ?? this.selectedArea();
    const relevantItems = order.items.filter((item) => {
      if (item.status === 'ANULADO') return false;
      if (targetArea === 'ALL') return true;
      if (item.subItems && item.subItems.length > 0) {
        return item.subItems.some((s) => s.area === targetArea);
      }
      return item.area === targetArea;
    });

    if (!relevantItems.length) {
      return false;
    }

    return relevantItems.every((item) => item.status === 'ENTREGADO');
  }

  hasPendingItems(order: Order, area?: AreaId | 'ALL'): boolean {
    const targetArea = area ?? this.selectedArea();
    if (targetArea !== 'ALL') {
      return order.items.some((item) => {
        if (item.status === 'ANULADO' || item.status === 'ENTREGADO') return false;
        const hasSubs = !!(item.subItems && item.subItems.length > 0);
        if (hasSubs) {
          const subsInArea = item.subItems!.filter((s) => s.area === targetArea);
          return subsInArea.some((s) => !s.ready);
        }
        return item.area === targetArea && item.status !== 'LISTO';
      });
    }
    return order.items.some((item) => {
      if (item.status === 'ANULADO' || item.status === 'ENTREGADO') return false;
      if (item.subItems && item.subItems.length > 0) {
        return item.subItems.some((s) => !s.ready);
      }
      return item.status !== 'LISTO';
    });
  }

  markNextPendingItemReady(order: Order, specificArea?: AreaId | 'ALL'): void {
    const targetArea = specificArea ?? (this.selectedArea() === 'ALL' ? undefined : this.selectedArea());
    const pendingItem = order.items.find((item) => {
      if (item.status === 'ANULADO' || item.status === 'ENTREGADO' || item.status === 'LISTO') return false;
      if (targetArea && targetArea !== 'ALL') {
        const hasSubs = !!(item.subItems && item.subItems.length > 0);
        if (hasSubs) {
          return item.subItems!.some((s) => s.area === targetArea && !s.ready);
        }
        return item.area === targetArea;
      }
      if (item.subItems && item.subItems.length > 0) {
        return item.subItems.some((s) => !s.ready);
      }
      return true;
    });
    if (!pendingItem) {
      return;
    }

    const itemTargetArea = targetArea ?? pendingItem.area;
    this.markReady(order.id, pendingItem.id, itemTargetArea);
  }

  markReady(orderId: string, itemId: string, areaOverride?: AreaId | 'ALL'): void {
    const targetArea = areaOverride ?? this.selectedArea();
    this.state.markItemReady(orderId, itemId, targetArea);
  }

  markAllReadyInSidePanel(orderId: string): void {
    this.state.markOrderReady(orderId, this.selectedArea());
  }

  retryLoad(): void {
    void this.state.retryRuntimeDataLoad();
  }

  cancelLoad(): void {
    this.state.clearRuntimeDataError();
  }

  complete(orderId: string): void {
    this.state.completeOrder(orderId);
  }

  orderTotal(order: Order): number {
    return order.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  }

  statusClass(status: Order['status']): string {
    return status;
  }

  orderStatusLabel(status: Order['status']): string {
    if (status === 'LISTO') {
      return 'Listo';
    }

    if (status === 'ENTREGADO') {
      return 'Entregado';
    }

    if (status === 'COBRADO') {
      return 'Cobrado';
    }

    if (status === 'EN_PROCESO') {
      return 'En proceso';
    }

    return 'Pendiente';
  }

  selectedAreaLabel(): string {
    const area = this.selectedArea();
    if (area === 'ALL') {
      return 'Todas';
    }
    return this.areaLabel(area);
  }

  areaLabel(area: AreaId): string {
    if (area === 'COCINA') {
      return 'Cocina';
    }

    if (area === 'GRILL') {
      return 'Grill';
    }

    if (area === 'BARRA') {
      return 'Barra';
    }

    if (area === 'PIZZERIA') {
      return 'Pizzeria';
    }

    return 'Mostrador';
  }

  restaurantLabel(restaurantId: RestaurantId): string {
    return this.state.restaurants().find((restaurant) => restaurant.id === restaurantId)?.name ?? restaurantId;
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

  tableLabel(order: Order): string {
    return formatTableNumberLabel(order.tableNumber, order.items.map((item) => item.restaurantId));
  }

  getElapsedTime(createdAt: string): string {
    if (!createdAt) return '';
    const created = new Date(createdAt).getTime();
    if (isNaN(created)) return '';
    const diffMs = Math.max(0, this.currentTime() - created);
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) {
      return '< 1 min';
    }
    if (diffMins < 60) {
      return `${diffMins} min`;
    }
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `${hours}h ${mins}m`;
  }

  getElapsedTimeClass(createdAt: string): string {
    if (!createdAt) return 'time-normal';
    const created = new Date(createdAt).getTime();
    if (isNaN(created)) return 'time-normal';
    const diffMs = Math.max(0, this.currentTime() - created);
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins >= 30) {
      return 'time-urgent';
    }
    if (diffMins >= 15) {
      return 'time-warning';
    }
    return 'time-normal';
  }

  buildOrderGroups(order: Order): OrderRestaurantGroup[] {
    const restaurantIds = [...new Set(order.items.map((item) => item.restaurantId))];
    return restaurantIds.map((restaurantId) => {
      const restaurantItems = order.items.filter(
        (item) => item.restaurantId === restaurantId && (item.status === 'PENDIENTE' || item.status === 'EN_PROCESO')
      );
      const areas = [...new Set(restaurantItems.flatMap((item) => {
        if (item.subItems && item.subItems.length > 0) {
          return item.subItems.map((sub) => sub.area);
        }
        return [item.area];
      }))];

      return {
        restaurantId,
        restaurantName: this.restaurantLabel(restaurantId),
        itemsByArea: areas.map((area) => ({
          area,
          items: restaurantItems.filter((item) => {
            if (item.subItems && item.subItems.length > 0) {
              return item.subItems.some((sub) => sub.area === area && !sub.ready);
            }
            return item.area === area;
          }).map((item) => {
            if (item.subItems && item.subItems.length > 0) {
              const subItemsForArea = item.subItems.filter((sub) => sub.area === area);
              if (subItemsForArea.length > 0) {
                const matchingSubItems = subItemsForArea
                  .map((sub) => sub.ready ? `${sub.name} ✓` : sub.name)
                  .join(' | ');
                return { ...item, productName: `${item.productName} (${matchingSubItems})` };
              }
            }
            return item;
          })
        }))
      };
    }).filter((group) => group.itemsByArea.some((area) => area.items.length > 0));
  }

  trackItem(index: number, item: OrderItem): string {
    return item.id;
  }

  private matchesOrderSearch(order: Order): boolean {
    const query = this.orderSearchQuery().trim().toLowerCase();
    if (!query) {
      return true;
    }

    return [
      order.id,
      order.clientName,
      order.clientDocumentId ?? '',
      this.tableLabel(order),
      ...order.items.map((item) => item.productName)
    ]
      .join(' ')
      .toLowerCase()
      .includes(query);
  }

  private async refreshOrdersLive(): Promise<void> {
    await this.state.refreshOrdersFromFirebase();
  }

  private ensureSelectedAreaIsValid(): void {
    const selectedArea = this.selectedArea();
    const isValidArea = this.areas().some((area) => area.value === selectedArea);
    if (!isValidArea) {
      this.selectedArea.set('ALL');
    }
  }

  private availableAreasForSelection(): AreaId[] {
    const selectedRestaurant = this.selectedRestaurant();
    if (selectedRestaurant === 'NEXT_RESTOBAR') {
      return ['COCINA', 'BARRA'];
    }

    if (selectedRestaurant !== 'ALL') {
      return this.state.restaurants().find((restaurant) => restaurant.id === selectedRestaurant)?.devices ?? [];
    }

    const allowedRestaurants = this.restaurantFilters()
      .map((entry) => entry.value)
      .filter((value): value is RestaurantId => value !== 'ALL');

    if (allowedRestaurants.length === 1 && allowedRestaurants[0] === 'NEXT_RESTOBAR') {
      return ['COCINA', 'BARRA'];
    }

    return [...new Set(
      allowedRestaurants.flatMap((restaurantId) =>
        this.state.restaurants().find((restaurant) => restaurant.id === restaurantId)?.devices ?? []
      )
    )];
  }

  private isNextOnlyAreaMode(): boolean {
    const selectedRestaurant = this.selectedRestaurant();
    if (selectedRestaurant === 'NEXT_RESTOBAR') {
      return true;
    }

    if (selectedRestaurant !== 'ALL') {
      return false;
    }

    const allowed = this.state.allowedRestaurantIds();
    return allowed.length > 0 && allowed.every((restaurantId) => restaurantId === 'NEXT_RESTOBAR');
  }
}
