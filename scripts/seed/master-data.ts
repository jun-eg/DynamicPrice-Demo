// マスターシードのハードコード値。担当者ヒアリング相当のサンプル値。
// 本番運用前に実値へ差し替える前提。code を変えると Reservation 取込時の正規化に影響する。
//
// inventoryCount の暫定値根拠 (issue #59 §C, §D):
//   CSV (8 ファイル / 6,853 行) の同日有料予約数から実部屋数を推定し、
//   担当者ヒアリングが終わるまでの暫定値として置く。確定値は Web 管理画面
//   (/admin/room-types) から編集する。CSV 名と完全一致しない場合は
//   reservations.ts の ensureRoomType が code=0 で別レコードを作るため、
//   実 CSV の名称に合わせて随時修正する必要がある。

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
  // 旧サンプル (BasePrice の seed が紐付くため残置)。実 CSV ではこれらの code は出現しない。
  { code: 'STD', name: 'スタンダードツイン', capacity: 2, inventoryCount: 10 },
  { code: 'DLX', name: 'デラックスツイン', capacity: 2, inventoryCount: 5 },
  { code: 'SUI', name: 'スイート', capacity: 4, inventoryCount: 2 },
  // CSV 由来の部屋タイプ。実 CSV の「部屋タイプ名称」がそのまま code として使われる前提
  // (csv-mapping.ts の roomTypeCode は roomTypeName と同じ列を引いている)。
  { code: 'Asakusa', name: 'Asakusa', capacity: null, inventoryCount: 1 },
  { code: 'Den', name: 'Den', capacity: null, inventoryCount: 2 },
  { code: 'Fusuma', name: 'Fusuma', capacity: null, inventoryCount: 2 },
  { code: 'Fusuma(DInner)', name: 'Fusuma(DInner)', capacity: null, inventoryCount: 2 },
  { code: 'Gratte-ciel', name: 'Gratte-ciel', capacity: null, inventoryCount: 2 },
  { code: 'Sugi', name: 'Sugi', capacity: null, inventoryCount: 1 },
];

export const PLANS: readonly PlanSeed[] = [
  { code: 'STAY_RO', name: '素泊まりプラン', mealType: '素泊まり' },
  { code: 'STAY_BB', name: '朝食付きプラン', mealType: '朝食付き' },
  { code: 'STAY_HB', name: '1泊2食プラン', mealType: '一泊二食' },
];

// 上限・下限は基準価格 ±30%(02-pricing-model.md レイヤー1 の安全弁)
export const BASE_PRICES: readonly BasePriceSeed[] = [
  {
    roomTypeCode: 'STD',
    planCode: 'STAY_RO',
    amount: 12000,
    priceMin: 8400,
    priceMax: 15600,
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
  },
  {
    roomTypeCode: 'STD',
    planCode: 'STAY_BB',
    amount: 14000,
    priceMin: 9800,
    priceMax: 18200,
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
  },
  {
    roomTypeCode: 'STD',
    planCode: 'STAY_HB',
    amount: 18000,
    priceMin: 12600,
    priceMax: 23400,
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
  },
  {
    roomTypeCode: 'DLX',
    planCode: 'STAY_RO',
    amount: 18000,
    priceMin: 12600,
    priceMax: 23400,
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
  },
  {
    roomTypeCode: 'DLX',
    planCode: 'STAY_BB',
    amount: 20000,
    priceMin: 14000,
    priceMax: 26000,
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
  },
  {
    roomTypeCode: 'DLX',
    planCode: 'STAY_HB',
    amount: 25000,
    priceMin: 17500,
    priceMax: 32500,
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
  },
  {
    roomTypeCode: 'SUI',
    planCode: 'STAY_RO',
    amount: 30000,
    priceMin: 21000,
    priceMax: 39000,
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
  },
  {
    roomTypeCode: 'SUI',
    planCode: 'STAY_BB',
    amount: 33000,
    priceMin: 23100,
    priceMax: 42900,
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
  },
  {
    roomTypeCode: 'SUI',
    planCode: 'STAY_HB',
    amount: 40000,
    priceMin: 28000,
    priceMax: 52000,
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
  },
];
