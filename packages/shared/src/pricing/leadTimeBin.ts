// 02-pricing-model.md / ADR-0007: リードタイム = checkInDate - bookedDate (日数)。
// ビン: 0-3 / 4-7 / 8-14 / 15-30 / 31+。
// 連泊は 1 レコード = 1 行で扱い、checkInDate に紐付ける（夜単位に展開しない）。

export type LeadTimeBin = '0-3' | '4-7' | '8-14' | '15-30' | '31+';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function leadTimeBin(checkInDate: Date, bookedDate: Date): LeadTimeBin {
  // 日付境界を跨ぐタイムゾーン揺れを避けるため UTC 日数差で比較する。
  const checkIn = Date.UTC(
    checkInDate.getUTCFullYear(),
    checkInDate.getUTCMonth(),
    checkInDate.getUTCDate(),
  );
  const booked = Date.UTC(
    bookedDate.getUTCFullYear(),
    bookedDate.getUTCMonth(),
    bookedDate.getUTCDate(),
  );
  const days = Math.floor((checkIn - booked) / MS_PER_DAY);

  if (days <= 3) return '0-3';
  if (days <= 7) return '4-7';
  if (days <= 14) return '8-14';
  if (days <= 30) return '15-30';
  return '31+';
}
