// GET /recommendations — 推奨価格マトリックス (04-api-contract.md)

import type { DecimalString, IsoDate, IsoDateTime } from './common.js';
import type { ClampReason } from '../pricing/clampPrice.js';

export interface RecommendationsRequest {
  dateFrom: IsoDate;
  dateTo: IsoDate;
  roomTypeId?: number;
  planId?: number;
}

export interface RecommendationCoefficients {
  season: DecimalString;
  dayOfWeek: DecimalString;
  leadTime: DecimalString;
}

export interface RecommendationItem {
  date: IsoDate;
  roomTypeId: number;
  planId: number;
  basePrice: DecimalString;
  coefficients: RecommendationCoefficients;
  rawPrice: DecimalString;
  clampedPrice: DecimalString;
  clampReason: ClampReason;
}

export interface RecommendationsResponse {
  computedAt: IsoDateTime;
  items: RecommendationItem[];
}
