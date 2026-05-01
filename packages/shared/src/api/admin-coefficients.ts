// POST /admin/coefficients/recompute — 係数再推定 (04-api-contract.md / ADR-0007)
// PUT  /admin/coefficients         — 係数手動保存

import type { CoefficientType } from './common.js';
import type { IsoDateTime } from './common.js';

export interface AdminCoefficientsRecomputeResponse {
  computedAt: IsoDateTime;
  source: string;
  rowsCreated: number;
}

export interface AdminCoefficientsSaveItem {
  type: CoefficientType;
  key: string;
  value: string;
}

export interface AdminCoefficientsSaveRequest {
  items: AdminCoefficientsSaveItem[];
}

export interface AdminCoefficientsSaveResponse {
  computedAt: IsoDateTime;
  source: string;
  rowsCreated: number;
}
