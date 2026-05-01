import { describe, expect, it } from 'vitest';
import { leadTimeBin } from '../pricing/leadTimeBin.js';

const date = (iso: string) => new Date(`${iso}T00:00:00Z`);

const cases: Array<{ booked: string; checkIn: string; expected: ReturnType<typeof leadTimeBin> }> =
  [
    { booked: '2026-05-01', checkIn: '2026-05-01', expected: '0-3' },
    { booked: '2026-04-30', checkIn: '2026-05-01', expected: '0-3' },
    { booked: '2026-04-28', checkIn: '2026-05-01', expected: '0-3' },
    { booked: '2026-04-27', checkIn: '2026-05-01', expected: '4-7' },
    { booked: '2026-04-24', checkIn: '2026-05-01', expected: '4-7' },
    { booked: '2026-04-23', checkIn: '2026-05-01', expected: '8-14' },
    { booked: '2026-04-17', checkIn: '2026-05-01', expected: '8-14' },
    { booked: '2026-04-16', checkIn: '2026-05-01', expected: '15-30' },
    { booked: '2026-04-01', checkIn: '2026-05-01', expected: '15-30' },
    { booked: '2026-03-31', checkIn: '2026-05-01', expected: '31+' },
    { booked: '2025-05-01', checkIn: '2026-05-01', expected: '31+' },
  ];

describe('leadTimeBin', () => {
  for (const { booked, checkIn, expected } of cases) {
    it(`booked=${booked} / checkIn=${checkIn} -> ${expected}`, () => {
      expect(leadTimeBin(date(checkIn), date(booked))).toBe(expected);
    });
  }

  it('時刻成分が含まれていても日付差で判定される', () => {
    const booked = new Date('2026-04-27T23:59:59Z');
    const checkIn = new Date('2026-05-01T00:00:00Z');
    expect(leadTimeBin(checkIn, booked)).toBe('4-7');
  });
});
