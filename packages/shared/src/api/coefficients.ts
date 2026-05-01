// GET /coefficients — 最新の係数一覧 (04-api-contract.md / ADR-0007)

import type { CoefficientType, DecimalString, IsoDateTime } from './common.js';

export interface CoefficientsRequest {
  type?: CoefficientType;
}

export interface CoefficientItem {
  type: CoefficientType;
  key: string;
  value: DecimalString;
  sampleSize: number;
  fallback: boolean;
}

export interface CoefficientsResponse {
  computedAt: IsoDateTime;
  source: string;
  items: CoefficientItem[];
}
