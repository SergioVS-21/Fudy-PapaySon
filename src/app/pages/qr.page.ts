import { CommonModule, CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppStateService } from '../core/app-state.service';
import { RestaurantId } from '../core/models';

@Component({
  selector: 'app-qr-page',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyPipe],
  template: `
    <section class="page">
      <header class="page-header">
        <h1>Experiencia QR por Mesa</h1>
        <p>Simulacion de pedido de cliente integrado a comandas.</p>
      </header>

      <article class="panel filters">
        <label>
          Restaurante
          <select [(ngModel)]="selectedRestaurant">
            <option value="PAPA_Y_SON">Papa y Son</option>
          </select>
        </label>
        <label>
          Mesa
          <input type="number" min="1" [(ngModel)]="tableNumber" />
        </label>
      </article>

      <article class="panel">
        <h2>Menu disponible</h2>
        @if (isDataLoading() && !menuProducts().length) {
          <article class="state-card">
            <span class="state-spinner" aria-hidden="true"></span>
            <strong>Cargando menu...</strong>
          </article>
        } @else if (dataError() && !menuProducts().length) {
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
          <ul class="list">
            @for (product of menuProducts(); track product.id) {
              <li>
                <div>
                  <strong>{{ product.name }}</strong>
                  <div style="display: flex; flex-direction: column; gap: 1px; font-size: 0.82rem; margin-top: 2px;">
                    <span style="color: #64748b;">{{ product.area }} · Subt: {{ product.price | currency:'USD' }}</span>
                    <span style="color: #64748b;">+IVA (16%): {{ (product.price * 0.16) | currency:'USD' }}</span>
                    <strong style="color: #059669; font-size: 0.88rem;">Total: {{ (product.price * 1.16) | currency:'USD' }}</strong>
                  </div>
                </div>
                <button (click)="add(product.id)">Agregar</button>
              </li>
            } @empty {
              <li>Sin productos disponibles.</li>
            }
          </ul>
        }
      </article>

      <article class="panel">
        <h2>Carrito QR</h2>
        <ul class="list">
          @for (item of cart(); track item.productId) {
            <li style="display: flex; justify-content: space-between; align-items: center;">
              <span>{{ item.productName }} x{{ item.quantity }}</span>
              <div style="text-align: right; line-height: 1.2;">
                <span style="font-size: 0.75rem; color: #64748b;">Subt: {{ getCartItemSubtotal(item) | currency:'USD' }}</span>
                <div><strong style="color: #059669; font-size: 0.82rem;">Total: {{ getCartItemSubtotal(item) * 1.16 | currency:'USD' }}</strong></div>
              </div>
            </li>
          } @empty {
            <li>Sin items.</li>
          }
        </ul>

        @if (cart().length) {
          <div style="display: flex; flex-direction: column; gap: 4px; padding: 0.75rem; background: #f8fafc; border-radius: 0.5rem; margin: 0.75rem 0; border: 1px solid #e2e8f0;">
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: #64748b;">
              <span>Subtotal (sin IVA):</span>
              <span>{{ cartSubtotal() | currency:'USD' }}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: #64748b;">
              <span>+IVA (16%):</span>
              <span>{{ cartIva() | currency:'USD' }}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 1.05rem; font-weight: 800; color: #059669;">
              <span>Total:</span>
              <span>{{ cartTotal() | currency:'USD' }}</span>
            </div>
            <div style="text-align: right; font-size: 0.8rem; color: #6b7280;">
              <span>Total Bs: {{ cartTotal() * bcvRate() | number:'1.2-2' }} Bs</span>
            </div>
          </div>
        }

        <button [disabled]="isSubmitting() || !cart().length" (click)="checkout()">
          @if (isSubmitting()) {
            Enviando...
          } @else {
            Enviar pedido QR
          }
        </button>
        @if (lastOrderId()) {
          <p class="success">Pedido enviado: {{ lastOrderId() }}</p>
        }
      </article>
    </section>
  `
})
export class QrPageComponent {
  private readonly state = inject(AppStateService);

  selectedRestaurant: RestaurantId = 'PAPA_Y_SON';
  tableNumber = 1;

  readonly cart = signal<Array<{ productId: string; productName: string; quantity: number }>>([]);
  readonly isSubmitting = signal(false);
  readonly lastOrderId = signal('');
  readonly isDataLoading = computed(() => this.state.runtimeDataLoading());
  readonly dataError = computed(() => this.state.runtimeDataError());
  readonly bcvRate = computed(() => this.state.appSettings().bcvRate);

  readonly cartSubtotal = computed(() => {
    const products = this.state.products();
    return this.cart().reduce((acc, item) => {
      const p = products.find((x) => x.id === item.productId);
      return acc + (p?.price ?? 0) * item.quantity;
    }, 0);
  });
  readonly cartIva = computed(() => this.cartSubtotal() * 0.16);
  readonly cartTotal = computed(() => this.cartSubtotal() + this.cartIva());

  getCartItemSubtotal(item: { productId: string; quantity: number }): number {
    const p = this.state.products().find((x) => x.id === item.productId);
    return (p?.price ?? 0) * item.quantity;
  }

  readonly menuProducts = computed(() =>
    this.state
      .products()
      .filter((product) => product.restaurantId === this.selectedRestaurant && product.available)
  );

  add(productId: string): void {
    const product = this.state.products().find((p) => p.id === productId);
    if (!product) {
      return;
    }

    this.cart.update((cart) => {
      const found = cart.find((item) => item.productId === productId);
      if (found) {
        return cart.map((item) =>
          item.productId === productId ? { ...item, quantity: item.quantity + 1 } : item
        );
      }

      return [...cart, { productId, productName: product.name, quantity: 1 }];
    });
  }

  retryLoad(): void {
    void this.state.retryRuntimeDataLoad();
  }

  cancelLoad(): void {
    this.state.clearRuntimeDataError();
  }

  async checkout(): Promise<void> {
    if (this.isSubmitting()) {
      return;
    }
    this.isSubmitting.set(true);
    try {
      const order = await this.state.createOrder(
        this.tableNumber,
        `9900${String(this.tableNumber).padStart(4, '0')}`,
        'Cliente',
        'QR',
        this.cart().map((item) => ({ productId: item.productId, quantity: item.quantity }))
      );

      this.lastOrderId.set(order?.id ?? 'No fue posible procesar el pedido QR.');
      if (order) {
        this.cart.set([]);
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
