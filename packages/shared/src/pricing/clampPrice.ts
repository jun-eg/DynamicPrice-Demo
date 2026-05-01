// 02-pricing-model.md レイヤー1 / ADR-0008: 価格上下限による安全弁。
// 呼び出し側で min <= max を保証する前提（DB CHECK 制約 priceMin <= priceMax）。

import { Decimal } from 'decimal.js';

export type ClampReason = 'MIN' | 'MAX' | null;

export interface ClampResult {
  value: Decimal;
  reason: ClampReason;
}

export function clampPrice(raw: Decimal, min: Decimal, max: Decimal): ClampResult {
  if (raw.lt(min)) {
    return { value: min, reason: 'MIN' };
  }
  if (raw.gt(max)) {
    return { value: max, reason: 'MAX' };
  }
  return { value: raw, reason: null };
}
