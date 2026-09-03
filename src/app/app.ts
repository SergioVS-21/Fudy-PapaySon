import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AppStateService } from './core/app-state.service';
import { AppUpdateService } from './core/app-update.service';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private readonly state = inject(AppStateService);
  private readonly router = inject(Router);
  private readonly appUpdate = inject(AppUpdateService);

  readonly user = computed(() => this.state.currentUser());
  readonly sessionRestaurantNames = computed(() => {
    const current = this.user();
    if (!current) {
      return '';
    }

    const names = current.restaurantIds
      .map((restaurantId) =>
        this.state.restaurants().find((restaurant) => restaurant.id === restaurantId)?.name ?? restaurantId
      )
      .filter((name, index, list) => list.indexOf(name) === index);

    return names.join(' · ');
  });

  readonly canAccessDashboard = computed(() => this.state.canAccessModule('dashboard'));
  readonly canAccessComandas = computed(() => this.state.canAccessModule('comandas'));
  readonly canAccessOperacion = computed(() => this.state.canAccessModule('operacion'));
  readonly canAccessInventario = computed(() => this.state.canAccessModule('inventario'));
  readonly canAccessReportes = computed(() => this.state.canAccessModule('reportes'));
  readonly syncOverlayVisible = computed(() => this.state.syncOverlayVisible());
  readonly syncOverlayStatus = computed(() => this.state.syncOverlayStatus());
  readonly syncOverlayMessage = computed(() => this.state.syncOverlayMessage());
  readonly syncOverlayCanRetry = computed(() => this.state.syncOverlayCanRetry());
  readonly activePaymentVerificationNotification = computed(
    () => this.state.activePaymentVerificationNotification()
  );
  readonly isSidebarOpen = signal(false);

  constructor() {
    this.appUpdate.start();
    this.state.startBackgroundRefresh();
  }

  signOut(): void {
    this.state.signOut();
    void this.router.navigate(['/login']);
  }

  dismissPaymentVerificationNotification(): void {
    this.state.dismissActivePaymentVerificationNotification();
  }

  retrySyncOperation(): void {
    this.state.retrySyncOperation();
  }

  toggleSidebar(): void {
    this.isSidebarOpen.update((value) => !value);
  }

  closeSidebar(): void {
    this.isSidebarOpen.set(false);
  }

  closeSidebarOnMobile(): void {
    if (typeof window !== 'undefined' && window.innerWidth <= 900) {
      this.closeSidebar();
    }
  }
}
