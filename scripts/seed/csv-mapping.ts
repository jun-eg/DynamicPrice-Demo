// 元CSV(ReservationTotalList.CSV)のヘッダー名 → DB フィールドのマッピング。
// 列ホワイトリスト方式: ここに無い列は完全に捨てる(PII を取り込まない安全弁)。
// 根拠: docs/architecture/03-data-model.md / ADR-0004 §3 / docs/runbooks/local-development.md §5-2

import { Prisma } from '@app/db';

// CSV の列名(Shift-JIS → UTF-8 変換後)。
// 実 CSV と差異があればここだけ書き換える。
export const CSV_COLUMN = {
  reservationCode: '予約番号',
  bookedDate: '申込日',
  checkInDate: '宿泊日',
  checkOutDate: 'チェックアウト日',
  nights: '泊数',
  bookingChannel: '予約サイト名称',
  roomTypeCode: '部屋タイプコード',
  roomTypeName: '部屋タイプ名称',
  planCode: '商品プランコード',
  planName: '商品プラン名称',
  mealType: '食事区分',
  adults: '大人人数',
  children: '子供人数',
  infants: '幼児人数',
  totalAmount: '料金合計',
  adultUnitPrice: '大人単価',
  childUnitPrice: '子供単価',
  infantUnitPrice: '幼児単価',
  cancelDate: '予約キャンセル日',
} as const;

export interface MappedRow {
  reservationCode: string;
  bookedDate: Date;
  checkInDate: Date;
  checkOutDate: Date;
  nights: number;
  bookingChannel: string | null;
  roomTypeCode: string;
  roomTypeName: string;
  planCode: string;
  planName: string;
  mealType: string | null;
  adults: number;
  children: number;
  infants: number;
  totalAmount: Prisma.Decimal;
  adultUnitPrice: Prisma.Decimal | null;
  childUnitPrice: Prisma.Decimal | null;
  infantUnitPrice: Prisma.Decimal | null;
  cancelDate: Date | null;
}

function pickRequired(row: Record<string, string>, header: string): string {
  const v = row[header];
  if (v === undefined || v === null || v.trim() === '') {
    throw new Error(`必須列 "${header}" が空または欠落しています`);
  }
  return v.trim();
}

function pickOptional(row: Record<string, string>, header: string): string | null {
  const v = row[header];
  if (v === undefined || v === null || v.trim() === '') return null;
  return v.trim();
}

function parseDateRequired(s: string, header: string): Date {
  const d = parseDate(s);
  if (d === null) throw new Error(`列 "${header}" の日付パースに失敗: "${s}"`);
  return d;
}

function parseDate(s: string | null): Date | null {
  if (s === null) return null;
  // YYYY/MM/DD / YYYY-MM-DD を許容。時刻が付いていても無視する。
  const m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const iso = `${y}-${mo!.padStart(2, '0')}-${d!.padStart(2, '0')}T00:00:00Z`;
  const date = new Date(iso);
  return isNaN(date.getTime()) ? null : date;
}

function parseIntRequired(s: string, header: string): number {
  const n = Number.parseInt(s.replace(/,/g, ''), 10);
  if (!Number.isFinite(n)) throw new Error(`列 "${header}" の整数パースに失敗: "${s}"`);
  return n;
}

function parseIntOptional(s: string | null, fallback: number): number {
  if (s === null) return fallback;
  const n = Number.parseInt(s.replace(/,/g, ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseDecimalRequired(s: string, header: string): Prisma.Decimal {
  const cleaned = s.replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    throw new Error(`列 "${header}" の数値パースに失敗: "${s}"`);
  }
  return new Prisma.Decimal(cleaned);
}

function parseDecimalOptional(s: string | null): Prisma.Decimal | null {
  if (s === null) return null;
  const cleaned = s.replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return new Prisma.Decimal(cleaned);
}

export function mapRow(row: Record<string, string>): MappedRow {
  const reservationCode = pickRequired(row, CSV_COLUMN.reservationCode);
  const bookedDate = parseDateRequired(
    pickRequired(row, CSV_COLUMN.bookedDate),
    CSV_COLUMN.bookedDate,
  );
  const checkInDate = parseDateRequired(
    pickRequired(row, CSV_COLUMN.checkInDate),
    CSV_COLUMN.checkInDate,
  );
  const checkOutDate = parseDateRequired(
    pickRequired(row, CSV_COLUMN.checkOutDate),
    CSV_COLUMN.checkOutDate,
  );
  const nights = parseIntRequired(pickRequired(row, CSV_COLUMN.nights), CSV_COLUMN.nights);
  const bookingChannel = pickOptional(row, CSV_COLUMN.bookingChannel);
  const roomTypeCode = pickRequired(row, CSV_COLUMN.roomTypeCode);
  const roomTypeName = pickRequired(row, CSV_COLUMN.roomTypeName);
  const planCode = pickRequired(row, CSV_COLUMN.planCode);
  const planName = pickRequired(row, CSV_COLUMN.planName);
  const mealType = pickOptional(row, CSV_COLUMN.mealType);
  const adults = parseIntRequired(pickRequired(row, CSV_COLUMN.adults), CSV_COLUMN.adults);
  const children = parseIntOptional(pickOptional(row, CSV_COLUMN.children), 0);
  const infants = parseIntOptional(pickOptional(row, CSV_COLUMN.infants), 0);
  const totalAmount = parseDecimalRequired(
    pickRequired(row, CSV_COLUMN.totalAmount),
    CSV_COLUMN.totalAmount,
  );
  const adultUnitPrice = parseDecimalOptional(pickOptional(row, CSV_COLUMN.adultUnitPrice));
  const childUnitPrice = parseDecimalOptional(pickOptional(row, CSV_COLUMN.childUnitPrice));
  const infantUnitPrice = parseDecimalOptional(pickOptional(row, CSV_COLUMN.infantUnitPrice));
  const cancelDate = parseDate(pickOptional(row, CSV_COLUMN.cancelDate));

  return {
    reservationCode,
    bookedDate,
    checkInDate,
    checkOutDate,
    nights,
    bookingChannel,
    roomTypeCode,
    roomTypeName,
    planCode,
    planName,
    mealType,
    adults,
    children,
    infants,
    totalAmount,
    adultUnitPrice,
    childUnitPrice,
    infantUnitPrice,
    cancelDate,
  };
}
