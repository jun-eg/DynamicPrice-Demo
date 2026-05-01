// Issue #9 受け入れ条件: 推定ロジックのユニットテスト (集計関数を純関数に切り出してテスト)。
// ADR-0007 §各係数の式 / §サンプル不足の扱い に基づく。

import { describe, expect, it } from 'vitest';
import { Decimal } from 'decimal.js';
import {
  aggregateCoefficients,
  COEFFICIENT_SOURCE_V1,
  DAY_OF_WEEK_KEYS,
  LEAD_TIME_KEYS,
  MIN_SAMPLE_SIZE,
  SEASON_KEYS,
  type CoefficientInput,
} from '../coefficients/index.js';

const date = (iso: string) => new Date(`${iso}T00:00:00Z`);

const baseInput = (override: Partial<CoefficientInput> = {}): CoefficientInput => ({
  totalAmount: new Decimal('20000'),
  nights: 1,
  checkInDate: date('2026-05-01'),
  bookedDate: date('2026-04-29'),
  ...override,
});

describe('COEFFICIENT_SOURCE_V1', () => {
  it('source は ADR-0007 で固定された値', () => {
    expect(COEFFICIENT_SOURCE_V1).toBe('unit_price_avg_v1');
  });
});

describe('aggregateCoefficients', () => {
  it('入力 0 件でも 24 行返り、すべて fallback=true / value=1.0000', () => {
    const result = aggregateCoefficients([]);
    expect(result).toHaveLength(SEASON_KEYS.length + DAY_OF_WEEK_KEYS.length + LEAD_TIME_KEYS.length);
    expect(result).toHaveLength(24);
    for (const r of result) {
      expect(r.fallback).toBe(true);
      expect(r.value.toFixed(4)).toBe('1.0000');
      expect(r.sampleSize).toBe(0);
    }
  });

  it('SEASON / DAY_OF_WEEK / LEAD_TIME すべての key を網羅して返す', () => {
    const result = aggregateCoefficients([]);
    const seasonKeys = result.filter((r) => r.type === 'SEASON').map((r) => r.key);
    const dowKeys = result.filter((r) => r.type === 'DAY_OF_WEEK').map((r) => r.key);
    const leadKeys = result.filter((r) => r.type === 'LEAD_TIME').map((r) => r.key);
    expect(seasonKeys).toEqual([...SEASON_KEYS]);
    expect(dowKeys).toEqual([...DAY_OF_WEEK_KEYS]);
    expect(leadKeys).toEqual([...LEAD_TIME_KEYS]);
  });

  it('サンプル数 < 30 のキーは value=1.0000 / fallback=true', () => {
    // 5 月 (キー "5") にだけ 10 件、それ以外の月は 0 件。
    const inputs: CoefficientInput[] = Array.from({ length: 10 }, () =>
      baseInput({ totalAmount: new Decimal('30000') }),
    );
    const result = aggregateCoefficients(inputs);
    const may = result.find((r) => r.type === 'SEASON' && r.key === '5')!;
    expect(may.fallback).toBe(true);
    expect(may.value.toFixed(4)).toBe('1.0000');
    expect(may.sampleSize).toBe(10);
  });

  it('閾値ちょうど (30 件) は fallback=false', () => {
    // 全件 5 月 / 同じ 1 泊単価なので、全期間平均と一致 → value=1.0000 だが fallback=false。
    const inputs: CoefficientInput[] = Array.from({ length: MIN_SAMPLE_SIZE }, () =>
      baseInput({ totalAmount: new Decimal('20000') }),
    );
    const result = aggregateCoefficients(inputs);
    const may = result.find((r) => r.type === 'SEASON' && r.key === '5')!;
    expect(may.sampleSize).toBe(30);
    expect(may.fallback).toBe(false);
    expect(may.value.toFixed(4)).toBe('1.0000');
  });

  it('閾値未満 (29 件) は fallback=true', () => {
    const inputs: CoefficientInput[] = Array.from({ length: MIN_SAMPLE_SIZE - 1 }, () =>
      baseInput({ totalAmount: new Decimal('20000') }),
    );
    const result = aggregateCoefficients(inputs);
    const may = result.find((r) => r.type === 'SEASON' && r.key === '5')!;
    expect(may.sampleSize).toBe(29);
    expect(may.fallback).toBe(true);
  });

  it('SEASON 係数 = 月別平均1泊単価 / 全期間平均1泊単価 で計算される', () => {
    // 5 月 (1泊単価 30000) を 30 件、12 月 (1泊単価 10000) を 30 件。
    // 全期間平均 = 20000、5 月の係数 = 30000 / 20000 = 1.5000、12 月 = 0.5000。
    const may: CoefficientInput[] = Array.from({ length: 30 }, () =>
      baseInput({
        totalAmount: new Decimal('30000'),
        checkInDate: date('2026-05-15'),
        bookedDate: date('2026-04-15'),
      }),
    );
    const dec: CoefficientInput[] = Array.from({ length: 30 }, () =>
      baseInput({
        totalAmount: new Decimal('10000'),
        checkInDate: date('2026-12-15'),
        bookedDate: date('2026-11-15'),
      }),
    );
    const result = aggregateCoefficients([...may, ...dec]);

    const mayCoef = result.find((r) => r.type === 'SEASON' && r.key === '5')!;
    expect(mayCoef.sampleSize).toBe(30);
    expect(mayCoef.fallback).toBe(false);
    expect(mayCoef.value.toFixed(4)).toBe('1.5000');

    const decCoef = result.find((r) => r.type === 'SEASON' && r.key === '12')!;
    expect(decCoef.sampleSize).toBe(30);
    expect(decCoef.fallback).toBe(false);
    expect(decCoef.value.toFixed(4)).toBe('0.5000');
  });

  it('1泊単価は totalAmount / nights で計算される (連泊は単価で正規化)', () => {
    // 連泊 2 泊 / totalAmount 60000 → 1 泊単価 30000。
    // 単泊 / totalAmount 10000 → 1 泊単価 10000。
    // それぞれ別の月に置いて、係数が単価ベースで動くことを確かめる。
    const expensive: CoefficientInput[] = Array.from({ length: 30 }, () =>
      baseInput({
        totalAmount: new Decimal('60000'),
        nights: 2,
        checkInDate: date('2026-05-15'),
        bookedDate: date('2026-04-15'),
      }),
    );
    const cheap: CoefficientInput[] = Array.from({ length: 30 }, () =>
      baseInput({
        totalAmount: new Decimal('10000'),
        nights: 1,
        checkInDate: date('2026-12-15'),
        bookedDate: date('2026-11-15'),
      }),
    );
    const result = aggregateCoefficients([...expensive, ...cheap]);

    // 全期間平均 = (30000*30 + 10000*30) / 60 = 20000
    const mayCoef = result.find((r) => r.type === 'SEASON' && r.key === '5')!;
    expect(mayCoef.value.toFixed(4)).toBe('1.5000');
  });

  it('DAY_OF_WEEK の key は MON..SUN で、UTC 曜日に基づいてマッピングされる', () => {
    // 2026-05-04 は月曜日 (UTC)。
    const monday: CoefficientInput[] = Array.from({ length: 30 }, () =>
      baseInput({
        totalAmount: new Decimal('40000'),
        checkInDate: date('2026-05-04'),
        bookedDate: date('2026-04-04'),
      }),
    );
    // 2026-05-03 は日曜日 (UTC)。
    const sunday: CoefficientInput[] = Array.from({ length: 30 }, () =>
      baseInput({
        totalAmount: new Decimal('20000'),
        checkInDate: date('2026-05-03'),
        bookedDate: date('2026-04-03'),
      }),
    );
    const result = aggregateCoefficients([...monday, ...sunday]);

    // 全期間平均 = 30000、月 = 40000/30000、日 = 20000/30000。
    const mon = result.find((r) => r.type === 'DAY_OF_WEEK' && r.key === 'MON')!;
    const sun = result.find((r) => r.type === 'DAY_OF_WEEK' && r.key === 'SUN')!;
    expect(mon.value.toFixed(4)).toBe('1.3333');
    expect(sun.value.toFixed(4)).toBe('0.6667');
  });

  it('LEAD_TIME の key は leadTimeBin に対応する', () => {
    // ビン "0-3" (リード 1 日) を 30 件、"31+" (リード 60 日) を 30 件。
    const last: CoefficientInput[] = Array.from({ length: 30 }, () =>
      baseInput({
        totalAmount: new Decimal('40000'),
        checkInDate: date('2026-05-15'),
        bookedDate: date('2026-05-14'),
      }),
    );
    const early: CoefficientInput[] = Array.from({ length: 30 }, () =>
      baseInput({
        totalAmount: new Decimal('20000'),
        checkInDate: date('2026-05-15'),
        bookedDate: date('2026-03-16'),
      }),
    );
    const result = aggregateCoefficients([...last, ...early]);

    const lastBin = result.find((r) => r.type === 'LEAD_TIME' && r.key === '0-3')!;
    const earlyBin = result.find((r) => r.type === 'LEAD_TIME' && r.key === '31+')!;
    expect(lastBin.value.toFixed(4)).toBe('1.3333');
    expect(earlyBin.value.toFixed(4)).toBe('0.6667');
  });

  it('minSampleSize オプションで閾値を上書きできる', () => {
    const inputs: CoefficientInput[] = Array.from({ length: 5 }, () =>
      baseInput({ totalAmount: new Decimal('20000') }),
    );
    const result = aggregateCoefficients(inputs, { minSampleSize: 5 });
    const may = result.find((r) => r.type === 'SEASON' && r.key === '5')!;
    expect(may.fallback).toBe(false);
    expect(may.sampleSize).toBe(5);
  });

  it('nights<=0 の異常データは除外される', () => {
    // 健全データ 30 件 (5 月) + 異常データ 1 件 (nights=0) → 5 月の sampleSize=30 のまま。
    const healthy: CoefficientInput[] = Array.from({ length: 30 }, () =>
      baseInput({ totalAmount: new Decimal('20000') }),
    );
    const broken: CoefficientInput = baseInput({ nights: 0, totalAmount: new Decimal('99999') });
    const result = aggregateCoefficients([...healthy, broken]);
    const may = result.find((r) => r.type === 'SEASON' && r.key === '5')!;
    expect(may.sampleSize).toBe(30);
    expect(may.fallback).toBe(false);
  });
});
