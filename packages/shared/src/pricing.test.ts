import { describe, expect, it } from 'vitest';
import { computeBill, priceRange, servicePrice, sizeForWeight, tipFromPercent } from './pricing';

const fullGroom = {
  pricesCents: { S: 5500, M: 6500, L: 8000, XL: 9500 },
  durationsMinutes: { S: 60, M: 90, L: 120, XL: 150 },
};

describe('sizeForWeight', () => {
  it.each([
    [8, 'S'],
    [19.9, 'S'],
    [20, 'M'],
    [49, 'M'],
    [50, 'L'],
    [89.5, 'L'],
    [90, 'XL'],
    [140, 'XL'],
  ] as const)('%d lb is %s', (weight, size) => {
    expect(sizeForWeight(weight)).toBe(size);
  });

  it('quotes unknown weight as medium', () => {
    expect(sizeForWeight(null)).toBe('M');
    expect(sizeForWeight(0)).toBe('M');
  });
});

describe('service pricing', () => {
  it('prices by size band', () => {
    expect(servicePrice(fullGroom, sizeForWeight(72))).toBe(8000);
  });

  it('reports the range shown on the booking page', () => {
    expect(priceRange(fullGroom)).toEqual({ minCents: 5500, maxCents: 9500 });
  });
});

describe('computeBill', () => {
  it('adds add-ons and tip to the service', () => {
    const bill = computeBill({
      service: { label: 'Full groom', priceCents: 6500 },
      addOns: [
        { label: 'Nail grind', priceCents: 1200 },
        { label: 'Teeth brushing', priceCents: 1000 },
      ],
      depositPaidCents: 0,
      tipCents: 1500,
    });
    expect(bill.subtotalCents).toBe(8700);
    expect(bill.totalDueCents).toBe(10200);
    expect(bill.lines).toHaveLength(3);
  });

  it('never lets a negative tip reduce the bill', () => {
    const bill = computeBill({ service: { label: 'Bath', priceCents: 4000 }, addOns: [], depositPaidCents: 0, tipCents: -500 });
    expect(bill.totalDueCents).toBe(4000);
  });

  it('suggests tips from the subtotal', () => {
    expect(tipFromPercent(8700, 20)).toBe(1740);
  });
});
