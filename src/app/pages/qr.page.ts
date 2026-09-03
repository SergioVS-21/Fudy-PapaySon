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
            <button type="button" class="btn-ghost state-retry-btn" (click)="retryLoad()">
              <i class="bi bi-arrow-clockwise" aria-hidden="true"></i>
              Recargar
            </button>
          </article>
        } @else {
          <ul class="list">
            @for (product of menuProducts(); track product.id) {
              <li>
                <div>
                  <strong>{{ product.name }}</strong>
                  <span>{{ product.area }} - {{ product.price | currency:'USD' }}</span>
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
            <li>{{ item.productName }} x{{ item.quantity }}</li>
          } @empty {
            <li>Sin items.</li>
          }
        </ul>
        <button [disabled]="isSubmitting()" (click)="checkout()">
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
