// 04-api-contract.md / ADR-0006 の共通定義。
// 金額・係数は Decimal 精度を保つため JSON 文字列で送る (ADR-0006)。

export type DecimalString = string;

export type IsoDate = string;

export type IsoDateTime = string;

export type Role = 'ADMIN' | 'MEMBER';

export type UserStatus = 'ACTIVE' | 'DISABLED';

export type CoefficientType = 'SEASON' | 'DAY_OF_WEEK' | 'LEAD_TIME';

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL_ERROR'
  | 'DB_UNAVAILABLE';

export interface ApiError {
  error: {
    code: ApiErrorCode;
    message: string;
  };
}
