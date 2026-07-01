import { describe, it, expect } from 'vitest';
import {
  expectedPayout,
  settlementPayout,
  platformMargin,
  recommendedPool,
  marginPercent,
  poolFillPercent,
  yesPct,
} from './formulas';

// ─── expectedPayout ───────────────────────────────────────────────────────────
describe('expectedPayout', () => {
  it('returns full pool when first stake on a side', () => {
    // If no one has staked YES yet, a ₦1,000 YES stake owns 100% of the pool
    expect(expectedPayout(1000, 0, 100_000)).toBeCloseTo(100_000);
  });

  it('returns proportional share when others have already staked', () => {
    // ₦1,000 stake when ₦9,000 already on YES → 1000/(9000+1000) = 10% of pool
    expect(expectedPayout(1000, 9000, 100_000)).toBeCloseTo(10_000);
  });

  it('returns 0 for zero or negative stake amount', () => {
    expect(expectedPayout(0, 5000, 100_000)).toBe(0);
    expect(expectedPayout(-100, 5000, 100_000)).toBe(0);
  });

  it('always returns ≤ reward_pool', () => {
    expect(expectedPayout(50_000, 0, 100_000)).toBeLessThanOrEqual(100_000);
    expect(expectedPayout(100_000, 0, 100_000)).toBeLessThanOrEqual(100_000);
  });
});

// ─── settlementPayout ─────────────────────────────────────────────────────────
describe('settlementPayout', () => {
  it('sum of all winner payouts equals reward_pool exactly', () => {
    const rewardPool = 100_000;
    const stakes = [10_000, 5_000, 25_000, 60_000];  // sum = 100_000 = pool
    const total = stakes.reduce((a, b) => a + b, 0);

    const payouts = stakes.map((s) => settlementPayout(s, total, rewardPool));
    const totalPayout = payouts.reduce((a, b) => a + b, 0);

    expect(totalPayout).toBeCloseTo(rewardPool, 2);
  });

  it('winner with 100% of winning side receives full pool', () => {
    expect(settlementPayout(5000, 5000, 100_000)).toBeCloseTo(100_000);
  });

  it('returns 0 if winning side total is 0 (edge case)', () => {
    expect(settlementPayout(1000, 0, 100_000)).toBe(0);
  });

  it('proportional payout is correct for multiple winners', () => {
    // 2 winners: ₦3k and ₦7k. Pool = ₦50k. Winning total = ₦10k.
    expect(settlementPayout(3000, 10_000, 50_000)).toBeCloseTo(15_000);
    expect(settlementPayout(7000, 10_000, 50_000)).toBeCloseTo(35_000);
  });
});

// ─── platformMargin ───────────────────────────────────────────────────────────
describe('platformMargin', () => {
  it('is always positive when total_staked > reward_pool', () => {
    expect(platformMargin(120_000, 100_000)).toBeGreaterThan(0);
  });

  it('equals total_staked minus reward_pool', () => {
    expect(platformMargin(120_000, 100_000)).toBe(20_000);
  });

  it('is 0 when pool exactly fills (no margin)', () => {
    expect(platformMargin(100_000, 100_000)).toBe(0);
  });

  it('is negative if pool not yet filled (normal during active market)', () => {
    expect(platformMargin(50_000, 100_000)).toBe(-50_000);
  });
});

// ─── recommendedPool ──────────────────────────────────────────────────────────
describe('recommendedPool', () => {
  it('gives a pool 16.7% below expected stakes for 16.7% target margin', () => {
    const pool = recommendedPool(120_000, 16.7);
    // Expected: 120_000 * (1 - 0.167) = 99_960
    expect(pool).toBeCloseTo(99_960, 0);
  });

  it('pool at 0% margin equals expectedTotal', () => {
    expect(recommendedPool(100_000, 0)).toBeCloseTo(100_000);
  });

  it('pool is within 15–20% margin range per CLAUDE.md', () => {
    const expectedTotal = 100_000;
    const pool = recommendedPool(expectedTotal, 17.5); // mid of 15–20
    const margin = platformMargin(expectedTotal, pool);
    const pct = marginPercent(expectedTotal, pool);
    expect(pct).toBeCloseTo(17.5, 1);
    expect(margin).toBeGreaterThan(0);
  });
});

// ─── marginPercent ────────────────────────────────────────────────────────────
describe('marginPercent', () => {
  it('returns correct margin %', () => {
    expect(marginPercent(120_000, 100_000)).toBeCloseTo(16.67, 1);
  });

  it('returns 0 when total staked is 0', () => {
    expect(marginPercent(0, 100_000)).toBe(0);
  });

  it('returns 0 when pool equals total staked', () => {
    expect(marginPercent(100_000, 100_000)).toBe(0);
  });
});

// ─── poolFillPercent ──────────────────────────────────────────────────────────
describe('poolFillPercent', () => {
  it('returns 0 when nothing is staked', () => {
    expect(poolFillPercent(0, 100_000)).toBe(0);
  });

  it('returns 100 when pool is exactly full', () => {
    expect(poolFillPercent(100_000, 100_000)).toBe(100);
  });

  it('caps at 100 even if staked > pool (should not happen but guard exists)', () => {
    expect(poolFillPercent(150_000, 100_000)).toBe(100);
  });

  it('returns 50 when half the pool is filled', () => {
    expect(poolFillPercent(50_000, 100_000)).toBe(50);
  });
});

// ─── yesPct ──────────────────────────────────────────────────────────────────
describe('yesPct', () => {
  it('returns 50 when no stakes exist (default neutral)', () => {
    expect(yesPct(0, 0)).toBe(50);
  });

  it('returns 100 when all stakes are on YES', () => {
    expect(yesPct(10_000, 0)).toBe(100);
  });

  it('returns 0 when all stakes are on NO', () => {
    expect(yesPct(0, 10_000)).toBe(0);
  });

  it('correctly splits 3:1 YES to NO', () => {
    expect(yesPct(75_000, 25_000)).toBe(75);
  });
});
