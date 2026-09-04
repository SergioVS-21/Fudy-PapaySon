import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AppStateService } from './core/app-state.service';

type AppModuleRoute = 'dashboard' | 'comandas' | 'operacion' | 'inventario' | 'reportes' | 'auditoria' | 'qr';

function firstAllowedRoute(state: AppStateService): string {
  if (state.canAccessModule('dashboard')) {
    return '/dashboard';
  }

  if (state.canAccessModule('operacion')) {
    return '/operacion';
  }

  if (state.canAccessModule('comandas')) {
    return '/comandas';
  }

  return '/login';
}

export const authGuard: CanActivateFn = () => {
  const state = inject(AppStateService);
  const router = inject(Router);

  if (state.currentUser()) {
    return true;
  }

  return router.createUrlTree(['/login']);
};

export const moduleGuard: CanActivateFn = (route) => {
  const state = inject(AppStateService);
  const router = inject(Router);

  if (!state.currentUser()) {
    return router.createUrlTree(['/login']);
  }

  const module = route.data?.['module'];
  if (typeof module === 'string' && state.canAccessModule(module as AppModuleRoute)) {
    return true;
  }

  return router.createUrlTree([firstAllowedRoute(state)]);
};

export const loginGuard: CanActivateFn = () => {
  const state = inject(AppStateService);
  const router = inject(Router);

  if (!state.currentUser()) {
    return true;
  }

  return router.createUrlTree([firstAllowedRoute(state)]);
};
