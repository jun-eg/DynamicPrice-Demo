// 02-pricing-model.md MVP 式: 推奨価格(raw) = 基準価格 × 季節 × 曜日 × リードタイム
// クランプは clampPrice 側で行う。純関数。

import { Decimal } from 'decimal.js';

export function computeRawPrice(
  basePrice: Decimal,
  season: Decimal,
  dayOfWeek: Decimal,
  leadTime: Decimal,
): Decimal {
  return basePrice.mul(season).mul(dayOfWeek).mul(leadTime);
}
