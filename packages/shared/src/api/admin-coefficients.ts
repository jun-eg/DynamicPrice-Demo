// POST /admin/coefficients/recompute — 係数再推定 (04-api-contract.md / ADR-0007)

import type { IsoDateTime } from './common.js';

export interface AdminCoefficientsRecomputeResponse {
  computedAt: IsoDateTime;
  source: string;
  rowsCreated: number;
}
