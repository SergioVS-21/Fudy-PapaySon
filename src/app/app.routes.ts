import { Routes } from '@angular/router';
import { loginGuard, moduleGuard } from './auth.guard';

export const routes: Routes = [
	{ path: '', pathMatch: 'full', redirectTo: 'dashboard' },
	{ 
		path: 'login', 
		loadComponent: () => import('./pages/login.page').then(m => m.LoginPageComponent), 
		canActivate: [loginGuard] 
	},
	{ 
		path: 'dashboard', 
		loadComponent: () => import('./pages/dashboard.page').then(m => m.DashboardPageComponent), 
		canActivate: [moduleGuard], 
		data: { module: 'dashboard' } 
	},
	{ 
		path: 'comandas', 
		loadComponent: () => import('./pages/orders.page').then(m => m.OrdersPageComponent), 
		canActivate: [moduleGuard], 
		data: { module: 'comandas' } 
	},
	{ 
		path: 'operacion', 
		loadComponent: () => import('./pages/ops-screen.page').then(m => m.OpsScreenPageComponent), 
		canActivate: [moduleGuard], 
		data: { module: 'operacion' } 
	},
	{ 
		path: 'inventario', 
		loadComponent: () => import('./pages/inventory.page').then(m => m.InventoryPageComponent), 
		canActivate: [moduleGuard], 
		data: { module: 'inventario' } 
	},
	{ 
		path: 'reportes', 
		loadComponent: () => import('./pages/reports.page').then(m => m.ReportsPageComponent), 
		canActivate: [moduleGuard], 
		data: { module: 'reportes' } 
	},
	{ 
		path: 'qr', 
		loadComponent: () => import('./pages/qr.page').then(m => m.QrPageComponent), 
		canActivate: [moduleGuard], 
		data: { module: 'qr' } 
	},
	{ path: '**', redirectTo: 'dashboard' }
];
