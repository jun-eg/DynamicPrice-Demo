import { describe, expect, it } from 'vitest';
import { Decimal } from 'decimal.js';
import { clampPrice } from '../pricing/clampPrice.js';

const min = new Decimal('14000');
const max = new Decimal('26000');

describe('clampPrice', () => {
  it('raw が範囲内なら値そのままで reason は null', () => {
    const result = clampPrice(new Decimal('20000'), min, max);
    expect(result.value.equals('20000')).toBe(true);
    expect(result.reason).toBeNull();
  });

  it('raw === min は範囲内扱い (reason null)', () => {
    const result = clampPrice(min, min, max);
    expect(result.value.equals(min)).toBe(true);
    expect(result.reason).toBeNull();
  });

  it('raw === max は範囲内扱い (reason null)', () => {
    const result = clampPrice(max, min, max);
    expect(result.value.equals(max)).toBe(true);
    expect(result.reason).toBeNull();
  });

  it('raw < min なら min にクランプして reason は MIN', () => {
    const result = clampPrice(new Decimal('13999.99'), min, max);
    expect(result.value.equals(min)).toBe(true);
    expect(result.reason).toBe('MIN');
  });

  it('raw > max なら max にクランプして reason は MAX', () => {
    const result = clampPrice(new Decimal('26000.01'), min, max);
    expect(result.value.equals(max)).toBe(true);
    expect(result.reason).toBe('MAX');
  });

  it('min === max のときも矛盾なく動く', () => {
    const fixed = new Decimal('20000');
    expect(clampPrice(new Decimal('19999'), fixed, fixed).reason).toBe('MIN');
    expect(clampPrice(new Decimal('20000'), fixed, fixed).reason).toBeNull();
    expect(clampPrice(new Decimal('20001'), fixed, fixed).reason).toBe('MAX');
  });
});
