import { AppUser, Product, Restaurant } from './models';

const PAPA_Y_SON_MESONERO_NAMES = [
  'Yuraika',
  'Indira',
  'Leidy',
  'Richard',
  'Loamin',
  'Elias',
  'Edyemelis',
  'Mesonero 8',
  'Mesonero 9',
  'Mesonero 10',
  'Mesonero 11',
  'Mesonero 12'
];

export const RESTAURANTS: Restaurant[] = [
  {
    id: 'PAPA_Y_SON',
    name: 'Papa y Son',
    devices: ['COCINA', 'GRILL', 'BARRA']
  }
];

export const INITIAL_PRODUCTS: Product[] = [];

export const INITIAL_USERS: AppUser[] = [
  {
    id: 'USR-ADMIN-JOHNATAN',
    email: 'guevarajohnatan@gmail.com',
    displayName: 'Johnatan Guevara',
    role: 'ADMIN',
    restaurantIds: ['PAPA_Y_SON'],
    isActive: true
  },
  {
    id: 'USR-CAJA-PAPAYSON',
    email: 'cajapapayson@soulvenezuela.com',
    displayName: 'Caja Papa y Son',
    role: 'CAJA',
    restaurantIds: ['PAPA_Y_SON'],
    isActive: true
  },
  {
    id: 'USR-OPS-PAPAYSON',
    email: 'opspapayson@soulvenezuela.com',
    displayName: 'Operaciones Papa y Son',
    role: 'OPERACIONES',
    restaurantIds: ['PAPA_Y_SON'],
    isActive: true
  },
  {
    id: 'USR-ADMIN-PAPAYSON',
    email: 'adminpapayson@soulvenezuela.com',
    displayName: 'Admin Papa y Son',
    role: 'ADMIN',
    restaurantIds: ['PAPA_Y_SON'],
    isActive: true
  },
  {
    id: 'USR-RUNNER-PAPAYSON',
    email: 'runnerpapayson@soulvenezuela.com',
    displayName: 'Runner Papa y Son',
    role: 'RUNNER',
    restaurantIds: ['PAPA_Y_SON'],
    isActive: true
  },
  ...Array.from({ length: 12 }, (_, index): AppUser => ({
    id: `USR-MES-PAPAYSON-${index + 1}`,
    email: `mesonero${index + 1}papayson@soulvenezuela.com`,
    displayName: PAPA_Y_SON_MESONERO_NAMES[index] || `Mesonero ${index + 1} Papa y Son`,
    role: 'MESONERO' as const,
    restaurantIds: ['PAPA_Y_SON'],
    isActive: true
  }))
];
