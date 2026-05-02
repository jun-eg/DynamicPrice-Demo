// マスターシードのハードコード値。担当者ヒアリング相当のサンプル値。
// 本番運用前に実値へ差し替える前提。code を変えると Reservation 取込時の正規化に影響する。
//
// inventoryCount の暫定値根拠 (issue #59 §C, §D):
//   CSV (8 ファイル / 6,853 行) の同日有料予約数から実部屋数を推定し、
//   担当者ヒアリングが終わるまでの暫定値として置く。確定値は Web 管理画面
//   (/admin/room-types) から編集する。CSV 名と完全一致しない場合は
//   reservations.ts の ensureRoomType が inventoryCount=0 で別レコードを作るため、
//   実 CSV の名称に合わせて随時修正する必要がある。
//
// PLANS / BASE_PRICES が空の理由 (PR #53 / chore: 架空マスタ撤去):
//   実 CSV に無い架空のプラン・基準価格を seed しない方針。実 Plan は CSV 取込時に
//   ensurePlan で仮投入される。BasePrice は実 RoomType × 実 Plan の組合せで別途整備する。

export interface RoomTypeSeed {
  code: string;
  name: string;
  capacity: number | null;
  inventoryCount: number;
}

export interface PlanSeed {
  // Plan の自然キーは name (issue #55, #56 / ADR-0010)。
  name: string;
  mealType: string | null;
}

export interface BasePriceSeed {
  roomTypeCode: string;
  // BasePrice → Plan は name で同定する (Plan の自然キーが name のため)。
  planName: string;
  amount: number;
  priceMin: number;
  priceMax: number;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo: string | null;
}

export const ROOM_TYPES: readonly RoomTypeSeed[] = [
  // CSV 由来の実 RoomType。issue #59 の CSV 同日有料予約数の推定値で暫定 inventoryCount を設定。
  // Web 管理画面 (/admin/room-types) から編集可。ここは初回 seed 用のブートストラップ値で、
  // master.ts は既存レコードを update={} で保護する (Web 編集を尊重)。
  { code: 'Gratte-ciel', name: 'Gratte-ciel', capacity: null, inventoryCount: 2 },
  { code: 'Den', name: 'Den', capacity: null, inventoryCount: 2 },
  { code: 'Asakusa', name: 'Asakusa', capacity: null, inventoryCount: 1 },
  { code: 'Fusuma(DInner)', name: 'Fusuma(DInner)', capacity: null, inventoryCount: 2 },
  { code: 'Sugi', name: 'Sugi', capacity: null, inventoryCount: 1 },
  { code: 'Fusuma', name: 'Fusuma', capacity: null, inventoryCount: 2 },
];

export const PLANS: readonly PlanSeed[] = [];

// 上限・下限は基準価格 ±30%(02-pricing-model.md レイヤー1 の安全弁)
export const BASE_PRICES: readonly BasePriceSeed[] = [];
