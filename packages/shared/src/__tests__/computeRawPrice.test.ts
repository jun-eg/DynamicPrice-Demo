import { describe, expect, it } from 'vitest';
import { Decimal } from 'decimal.js';
import { computeRawPrice } from '../pricing/computeRawPrice.js';

describe('computeRawPrice', () => {
  it('basePrice × season × dayOfWeek × leadTime を計算する', () => {
    const result = computeRawPrice(
      new Decimal('20000'),
      new Decimal('1.10'),
      new Decimal('1.20'),
      new Decimal('0.95'),
    );
    expect(result.equals('25080')).toBe(true);
  });

  it('全ての係数が 1.0 なら基準価格と一致する', () => {
    const base = new Decimal('18500');
    const result = computeRawPrice(
      base,
      new Decimal('1'),
      new Decimal('1'),
      new Decimal('1'),
    );
    expect(result.equals(base)).toBe(true);
  });

  it('Decimal の精度を保ち float 誤差が混ざらない', () => {
    const result = computeRawPrice(
      new Decimal('19999.99'),
      new Decimal('1.0001'),
      new Decimal('1'),
      new Decimal('1'),
    );
    expect(result.toFixed(6)).toBe('20001.989999');
  });
});
