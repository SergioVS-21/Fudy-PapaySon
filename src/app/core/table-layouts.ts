import { RestaurantId } from './models';

export type NextRestobarAreaId = 'SALON' | 'TERRAZA' | 'VIP' | 'BARRA';
export type PapaAndSonAreaId = 'SALON' | 'VIP';

export interface NextRestobarTableOption {
  tableNumber: number;
  label: string;
  row: number;
  col: number;
}

export interface NextRestobarAreaLayout {
  id: NextRestobarAreaId;
  label: string;
  columns: number;
  tables: NextRestobarTableOption[];
}

export interface PapaAndSonAreaLayout {
  id: PapaAndSonAreaId;
  label: string;
  columns: number;
  tables: NextRestobarTableOption[];
}

const salonTables = Array.from({ length: 30 }, (_, index) => {
  const number = index + 1;
  return {
    tableNumber: number,
    label: `S${number}`,
    row: Math.floor(index / 6) + 1,
    col: (index % 6) + 1
  };
});

const terrazaTables: NextRestobarTableOption[] = [
  { tableNumber: 102, label: 'T2', row: 1, col: 1 },
  { tableNumber: 103, label: 'T3', row: 2, col: 1 },
  { tableNumber: 104, label: 'T4', row: 3, col: 1 },
  { tableNumber: 105, label: 'T5', row: 4, col: 1 },
  { tableNumber: 106, label: 'T6', row: 5, col: 1 },
  { tableNumber: 107, label: 'T7', row: 2, col: 2 },
  { tableNumber: 108, label: 'T8', row: 3, col: 2 },
  { tableNumber: 109, label: 'T9', row: 1, col: 4 },
  { tableNumber: 110, label: 'T10', row: 2, col: 4 },
  { tableNumber: 111, label: 'T11', row: 3, col: 4 },
  { tableNumber: 112, label: 'T12', row: 4, col: 4 },
  { tableNumber: 113, label: 'T13', row: 5, col: 4 },
  { tableNumber: 114, label: 'T14', row: 1, col: 5 },
  { tableNumber: 115, label: 'T15', row: 2, col: 5 },
  { tableNumber: 116, label: 'T16', row: 3, col: 5 }
];

const vipTables: NextRestobarTableOption[] = [
  { tableNumber: 201, label: 'V1', row: 1, col: 1 },
  { tableNumber: 208, label: 'V8', row: 1, col: 2 },
  { tableNumber: 214, label: 'V14', row: 1, col: 3 },
  { tableNumber: 202, label: 'V2', row: 2, col: 1 },
  { tableNumber: 209, label: 'V9', row: 2, col: 2 },
  { tableNumber: 215, label: 'V15', row: 2, col: 3 },
  { tableNumber: 203, label: 'V3', row: 3, col: 1 },
  { tableNumber: 210, label: 'V10', row: 3, col: 2 },
  { tableNumber: 204, label: 'V4', row: 4, col: 1 },
  { tableNumber: 211, label: 'V11', row: 4, col: 2 },
  { tableNumber: 206, label: 'V6', row: 5, col: 1 },
  { tableNumber: 212, label: 'V12', row: 5, col: 2 },
  { tableNumber: 207, label: 'V7', row: 6, col: 1 },
  { tableNumber: 213, label: 'V13', row: 6, col: 2 }
];

const barraTables: NextRestobarTableOption[] = [
  { tableNumber: 301, label: 'B1', row: 1, col: 1 },
  { tableNumber: 310, label: 'B10', row: 1, col: 6 },
  { tableNumber: 302, label: 'B2', row: 2, col: 1 },
  { tableNumber: 309, label: 'B9', row: 2, col: 6 },
  { tableNumber: 303, label: 'B3', row: 3, col: 1 },
  { tableNumber: 304, label: 'B4', row: 3, col: 2 },
  { tableNumber: 305, label: 'B5', row: 3, col: 3 },
  { tableNumber: 306, label: 'B6', row: 3, col: 4 },
  { tableNumber: 307, label: 'B7', row: 3, col: 5 },
  { tableNumber: 308, label: 'B8', row: 3, col: 6 }
];

const papaAndSonSalonTables = Array.from({ length: 50 }, (_, index) => {
  const number = index + 1;
  return {
    tableNumber: 400 + number,
    label: `S${number}`,
    row: Math.floor(index / 6) + 1,
    col: (index % 6) + 1
  };
});

const papaAndSonVipTables: NextRestobarTableOption[] = Array.from({ length: 20 }, (_, index) => ({
  tableNumber: 500 + index + 1,
  label: `V${index + 1}`,
  row: Math.floor(index / 6) + 1,
  col: (index % 6) + 1
}));

export const NEXT_RESTOBAR_AREA_LAYOUTS: NextRestobarAreaLayout[] = [
  { id: 'SALON', label: 'Salon', columns: 6, tables: salonTables },
  { id: 'TERRAZA', label: 'Terraza', columns: 5, tables: terrazaTables },
  { id: 'VIP', label: 'VIP', columns: 3, tables: vipTables },
  { id: 'BARRA', label: 'Barra', columns: 6, tables: barraTables }
];

export const PAPA_AND_SON_AREA_LAYOUTS: PapaAndSonAreaLayout[] = [
  { id: 'SALON', label: 'Salon', columns: 6, tables: papaAndSonSalonTables },
  { id: 'VIP', label: 'VIP', columns: 6, tables: papaAndSonVipTables }
];

const NEXT_RESTOBAR_TABLE_LOOKUP = new Map(
  NEXT_RESTOBAR_AREA_LAYOUTS.flatMap((area) => area.tables.map((table) => [table.tableNumber, { ...table, areaId: area.id }] as const))
);

const PAPA_AND_SON_TABLE_LOOKUP = new Map(
  PAPA_AND_SON_AREA_LAYOUTS.flatMap((area) => area.tables.map((table) => [table.tableNumber, { ...table, areaId: area.id }] as const))
);

function normalizePapaAndSonTableNumber(tableNumber: number): number {
  if (tableNumber >= 1 && tableNumber <= 50) {
    return 400 + tableNumber;
  }

  return tableNumber;
}

export function isNextRestobarTableNumber(tableNumber: number): boolean {
  return NEXT_RESTOBAR_TABLE_LOOKUP.has(tableNumber);
}

export function getNextRestobarAreaForTableNumber(tableNumber: number): NextRestobarAreaId | null {
  return NEXT_RESTOBAR_TABLE_LOOKUP.get(tableNumber)?.areaId ?? null;
}

export function getNextRestobarTableLabel(tableNumber: number): string | null {
  return NEXT_RESTOBAR_TABLE_LOOKUP.get(tableNumber)?.label ?? null;
}

export function isPapaAndSonTableNumber(tableNumber: number): boolean {
  return PAPA_AND_SON_TABLE_LOOKUP.has(normalizePapaAndSonTableNumber(tableNumber));
}

export function getPapaAndSonAreaForTableNumber(tableNumber: number): PapaAndSonAreaId | null {
  return PAPA_AND_SON_TABLE_LOOKUP.get(normalizePapaAndSonTableNumber(tableNumber))?.areaId ?? null;
}

export function getPapaAndSonTableLabel(tableNumber: number): string | null {
  return PAPA_AND_SON_TABLE_LOOKUP.get(normalizePapaAndSonTableNumber(tableNumber))?.label ?? null;
}

export function formatTableNumberLabel(
  tableNumber: number,
  restaurantIds: readonly RestaurantId[] = []
): string {
  const nextLabel = getNextRestobarTableLabel(tableNumber);
  if (nextLabel) {
    if (restaurantIds.includes('NEXT_RESTOBAR') || tableNumber >= 100) {
      return nextLabel;
    }

    return String(tableNumber);
  }

  const papaAndSonLabel = getPapaAndSonTableLabel(tableNumber);
  if (papaAndSonLabel) {
    if (restaurantIds.includes('PAPA_Y_SON') || tableNumber >= 400) {
      return papaAndSonLabel;
    }

    return String(tableNumber);
  }

  return String(tableNumber);
}