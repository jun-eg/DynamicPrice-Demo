// GET /admin/base-prices, PUT /admin/base-prices (04-api-contract.md)
// RoomType × Plan の組合せに対する基準価格 (BasePrice) を編集する。
// 試作段階では (RoomType, Plan) ごとに「最新の有効な 1 行」だけを管理する
// (履歴管理は不採用: ADR-0011 / 03-data-model.md §BasePrice)。

import type { IsoDate } from './common.js';

export interface AdminBasePriceRoomType {
  id: number;
  code: string;
  name: string;
}

export interface AdminBasePricePlan {
  id: number;
  name: string;
  mealType: string | null;
}

export interface AdminBasePriceItem {
  id: number;
  roomTypeId: number;
  planId: number;
  amount: string;
  priceMin: string;
  priceMax: string;
  effectiveFrom: IsoDate;
  effectiveTo: IsoDate | null;
}

export interface AdminBasePricesListResponse {
  roomTypes: AdminBasePriceRoomType[];
  plans: AdminBasePricePlan[];
  items: AdminBasePriceItem[];
}

export interface AdminBasePriceUpsertRequest {
  roomTypeId: number;
  planId: number;
  amount: string;
  priceMin: string;
  priceMax: string;
}

export type AdminBasePriceUpsertResponse = AdminBasePriceItem;
