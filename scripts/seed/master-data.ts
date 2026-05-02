// マスターシードのハードコード値。担当者ヒアリング相当のサンプル値。
// 本番運用前に実値へ差し替える前提。code を変えると Reservation 取込時の正規化に影響する。

export interface RoomTypeSeed {
  code: string;
  name: string;
  capacity: number | null;
  inventoryCount: number;
}

export interface PlanSeed {
  code: string;
  name: string;
  mealType: string | null;
}

export interface BasePriceSeed {
  roomTypeCode: string;
  planCode: string;
  amount: number;
  priceMin: number;
  priceMax: number;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo: string | null;
}

export const ROOM_TYPES: readonly RoomTypeSeed[] = [
  { code: 'Gratte-ciel', name: 'Gratte-ciel', capacity: null, inventoryCount: 1 },
  { code: 'Den', name: 'Den', capacity: null, inventoryCount: 1 },
  { code: 'Asakusa', name: 'Asakusa', capacity: null, inventoryCount: 1 },
  { code: 'Fusuma(DInner)', name: 'Fusuma(DInner)', capacity: null, inventoryCount: 1 },
  { code: 'Sugi', name: 'Sugi', capacity: null, inventoryCount: 1 },
  { code: 'Fusuma', name: 'Fusuma', capacity: null, inventoryCount: 1 },
];

export const PLANS: readonly PlanSeed[] = [];

// 上限・下限は基準価格 ±30%(02-pricing-model.md レイヤー1 の安全弁)
export const BASE_PRICES: readonly BasePriceSeed[] = [];
