// Issue #12 受け入れ条件: 集計関数のユニットテスト (SQL の rounding 含む)。
// 02-pricing-model.md §補助指標の定義 / 04-api-contract.md §/stats/* に基づく。
// 連泊予約は丸ごと checkInDate の月に算入する。

import { describe, expect, it } from 'vitest';
import { Decimal } from 'decimal.js';
import {
  aggregateAdr,
  aggregateLeadTime,
  aggregateOccupancy,
  daysInYearMonth,
  enumerateYearMonths,
} from '../stats/index.js';

const date = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('enumerateYearMonths', () => {
  it('単月だけ含めて返す', () => {
    expect(enumerateYearMonths('2026-05', '2026-05')).toEqual(['2026-05']);
  });

  it('年跨ぎを含めて昇順で返す', () => {
    expect(enumerateYearMonths('2025-11', '2026-02')).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });

  it('from > to は空配列', () => {
    expect(enumerateYearMonths('2026-06', '2026-05')).toEqual([]);
  });
});

describe('daysInYearMonth', () => {
  it('うるう年 2 月は 29 日 (2024-02)', () => {
    expect(daysInYearMonth('2024-02')).toBe(29);
  });
  it('平年 2 月は 28 日 (2026-02)', () => {
    expect(daysInYearMonth('2026-02')).toBe(28);
  });
  it('30 日月 / 31 日月', () => {
    expect(daysInYearMonth('2026-04')).toBe(30);
    expect(daysInYearMonth('2026-07')).toBe(31);
  });
});

describe('aggregateOccupancy', () => {
  it('入力 0 件・期間 1ヶ月で rate は 0、totalRoomNights は inventory × 月日数', () => {
    const result = aggregateOccupancy([], 10, ['2026-05']);
    expect(result).toEqual([
      {
        yearMonth: '2026-05',
        occupancyRate: '0.0000',
        soldRoomNights: 0,
        totalRoomNights: 10 * 31, // 5 月は 31 日
      },
    ]);
  });

  it('checkInDate の月で集計する (連泊は丸ごと checkInDate の月)', () => {
    // 5 月 31 日に 3 連泊チェックイン → 6 月分には算入しない (02-pricing-model.md)
    const reservations = [
      { nights: 3, checkInDate: date('2026-05-31') },
      { nights: 1, checkInDate: date('2026-05-01') },
      { nights: 2, checkInDate: date('2026-06-15') },
    ];
    const result = aggregateOccupancy(reservations, 10, ['2026-05', '2026-06']);

    const may = result.find((r) => r.yearMonth === '2026-05')!;
    expect(may.soldRoomNights).toBe(4); // 3 + 1
    expect(may.totalRoomNights).toBe(10 * 31);
    // 4 / 310 = 0.012903... → ROUND_HALF_EVEN で 0.0129
    expect(may.occupancyRate).toBe('0.0129');

    const june = result.find((r) => r.yearMonth === '2026-06')!;
    expect(june.soldRoomNights).toBe(2);
    expect(june.totalRoomNights).toBe(10 * 30); // 6 月は 30 日
  });

  it('丸めは ROUND_HALF_EVEN で 4 桁 (Decimal(6,4) と揃える)', () => {
    // sold=1, total=8 → 0.125 ちょうど。ROUND_HALF_EVEN なら 0.1250 (5 桁目以降が無いので影響なし)。
    // sold=3, total=8 → 0.375 → 0.3750
    const r3 = aggregateOccupancy(
      [
        { nights: 1, checkInDate: date('2026-04-01') },
        { nights: 1, checkInDate: date('2026-04-02') },
        { nights: 1, checkInDate: date('2026-04-03') },
      ],
      // 4 月は 30 日。inventory を意図的に 0 に近づけても整数指定なので、
      // total=240 にしたいなら inventory=8。 sold=3 / 240 = 0.0125 → 0.0125
      8,
      ['2026-04'],
    );
    expect(r3[0]!.totalRoomNights).toBe(240);
    expect(r3[0]!.occupancyRate).toBe('0.0125');
  });

  it('期間外の月は 0 件として返る', () => {
    const result = aggregateOccupancy([{ nights: 1, checkInDate: date('2026-05-15') }], 10, [
      '2026-04',
      '2026-05',
      '2026-06',
    ]);
    expect(result.map((r) => r.soldRoomNights)).toEqual([0, 1, 0]);
  });

  it('nights<=0 のレコードは除外する (データ不正の防御)', () => {
    const result = aggregateOccupancy(
      [
        { nights: 0, checkInDate: date('2026-05-01') },
        { nights: -1, checkInDate: date('2026-05-02') },
        { nights: 2, checkInDate: date('2026-05-03') },
      ],
      10,
      ['2026-05'],
    );
    expect(result[0]!.soldRoomNights).toBe(2);
  });

  it('inventory が 0 でも totalRoomNights は 0、rate は 0 で返る (ゼロ除算防御)', () => {
    const result = aggregateOccupancy([{ nights: 1, checkInDate: date('2026-05-01') }], 0, [
      '2026-05',
    ]);
    expect(result[0]!.totalRoomNights).toBe(0);
    expect(result[0]!.occupancyRate).toBe('0.0000');
  });
});

describe('aggregateAdr', () => {
  it('入力 0 件・期間 1ヶ月で adr / totalRevenue は "0.00"、soldRoomNights は 0', () => {
    const result = aggregateAdr([], ['2026-05']);
    expect(result).toEqual([
      { yearMonth: '2026-05', adr: '0.00', totalRevenue: '0.00', soldRoomNights: 0 },
    ]);
  });

  it('連泊込みで totalRevenue / soldRoomNights を月集計する', () => {
    // 5 月: totalAmount=20000 (1泊) + 60000 (3泊) = 80000、nights=4 → ADR=20000.00
    // 6 月: totalAmount=30000 (2泊)、nights=2 → ADR=15000.00
    const reservations = [
      { nights: 1, totalAmount: new Decimal('20000'), checkInDate: date('2026-05-01') },
      { nights: 3, totalAmount: new Decimal('60000'), checkInDate: date('2026-05-31') },
      { nights: 2, totalAmount: new Decimal('30000'), checkInDate: date('2026-06-15') },
    ];
    const result = aggregateAdr(reservations, ['2026-05', '2026-06']);

    const may = result.find((r) => r.yearMonth === '2026-05')!;
    expect(may.totalRevenue).toBe('80000.00');
    expect(may.soldRoomNights).toBe(4);
    expect(may.adr).toBe('20000.00');

    const june = result.find((r) => r.yearMonth === '2026-06')!;
    expect(june.totalRevenue).toBe('30000.00');
    expect(june.soldRoomNights).toBe(2);
    expect(june.adr).toBe('15000.00');
  });

  it('丸めは ROUND_HALF_EVEN で 2 桁 (basePrice と揃える)', () => {
    // total=10001, nights=3 → 3333.6666... → ROUND_HALF_EVEN で 3333.67
    const result = aggregateAdr(
      [{ nights: 3, totalAmount: new Decimal('10001'), checkInDate: date('2026-05-01') }],
      ['2026-05'],
    );
    expect(result[0]!.adr).toBe('3333.67');
    expect(result[0]!.totalRevenue).toBe('10001.00');
  });

  it('銀行家丸め (HALF_EVEN): 12345.005 → 12345.00 (偶数寄せ)', () => {
    // total=24690.01, nights=2 → 12345.005 → ROUND_HALF_EVEN で 12345.00
    const result = aggregateAdr(
      [{ nights: 2, totalAmount: new Decimal('24690.01'), checkInDate: date('2026-05-01') }],
      ['2026-05'],
    );
    expect(result[0]!.adr).toBe('12345.00');
  });

  it('nights=0 のレコードは ADR の分母に入れない (revenue にも含めない)', () => {
    const result = aggregateAdr(
      [
        { nights: 0, totalAmount: new Decimal('99999'), checkInDate: date('2026-05-01') },
        { nights: 1, totalAmount: new Decimal('15000'), checkInDate: date('2026-05-02') },
      ],
      ['2026-05'],
    );
    expect(result[0]!.totalRevenue).toBe('15000.00');
    expect(result[0]!.soldRoomNights).toBe(1);
    expect(result[0]!.adr).toBe('15000.00');
  });
});

describe('aggregateLeadTime', () => {
  it('入力 0 件でも 5 ビン全て 0 件で返る', () => {
    const result = aggregateLeadTime([]);
    expect(result.map((r) => r.bin)).toEqual(['0-3', '4-7', '8-14', '15-30', '31+']);
    for (const r of result) {
      expect(r.count).toBe(0);
      expect(r.share).toBe('0.0000');
    }
  });

  it('境界値が正しいビンに入る (leadTimeBin と整合)', () => {
    // checkIn - booked = 0/3/4/7/8/14/15/30/31 → 各境界のビンを確認
    const reservations: Array<{ checkInDate: Date; bookedDate: Date }> = [
      { checkInDate: date('2026-05-10'), bookedDate: date('2026-05-10') }, // 0 → 0-3
      { checkInDate: date('2026-05-13'), bookedDate: date('2026-05-10') }, // 3 → 0-3
      { checkInDate: date('2026-05-14'), bookedDate: date('2026-05-10') }, // 4 → 4-7
      { checkInDate: date('2026-05-17'), bookedDate: date('2026-05-10') }, // 7 → 4-7
      { checkInDate: date('2026-05-18'), bookedDate: date('2026-05-10') }, // 8 → 8-14
      { checkInDate: date('2026-05-24'), bookedDate: date('2026-05-10') }, // 14 → 8-14
      { checkInDate: date('2026-05-25'), bookedDate: date('2026-05-10') }, // 15 → 15-30
      { checkInDate: date('2026-06-09'), bookedDate: date('2026-05-10') }, // 30 → 15-30
      { checkInDate: date('2026-06-10'), bookedDate: date('2026-05-10') }, // 31 → 31+
    ];
    const result = aggregateLeadTime(reservations);
    const counts = Object.fromEntries(result.map((r) => [r.bin, r.count]));
    expect(counts).toEqual({ '0-3': 2, '4-7': 2, '8-14': 2, '15-30': 2, '31+': 1 });
  });

  it('share は count / total で 4 桁固定。合計は (浮動少数誤差を除き) 1.0 になる', () => {
    // 0-3: 2 件 / total=10 → 0.2000
    // 4-7: 3 件 / total=10 → 0.3000
    // 8-14: 5 件 / total=10 → 0.5000
    const make = (offset: number) => ({
      bookedDate: date('2026-05-01'),
      checkInDate: new Date(date('2026-05-01').getTime() + offset * 24 * 60 * 60 * 1000),
    });
    const result = aggregateLeadTime([
      make(0),
      make(3), // 0-3 x2
      make(4),
      make(5),
      make(7), // 4-7 x3
      make(8),
      make(10),
      make(12),
      make(13),
      make(14), // 8-14 x5
    ]);
    const map = Object.fromEntries(result.map((r) => [r.bin, r.share]));
    expect(map['0-3']).toBe('0.2000');
    expect(map['4-7']).toBe('0.3000');
    expect(map['8-14']).toBe('0.5000');
    expect(map['15-30']).toBe('0.0000');
    expect(map['31+']).toBe('0.0000');
  });

  it('share は ROUND_HALF_EVEN 4 桁 (1/3 = 0.3333)', () => {
    const make = (offset: number) => ({
      bookedDate: date('2026-05-01'),
      checkInDate: new Date(date('2026-05-01').getTime() + offset * 24 * 60 * 60 * 1000),
    });
    // 1 件ずつ 0-3 / 4-7 / 8-14 → 各 1/3 = 0.3333...
    const result = aggregateLeadTime([make(1), make(5), make(10)]);
    const map = Object.fromEntries(result.map((r) => [r.bin, r.share]));
    expect(map['0-3']).toBe('0.3333');
    expect(map['4-7']).toBe('0.3333');
    expect(map['8-14']).toBe('0.3333');
  });
});
