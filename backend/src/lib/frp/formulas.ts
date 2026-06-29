// Fixed Reward Pool (FRP) — pure math functions.
// These are the single source of truth for all payout calculations.
// Mirror of the DB logic in place_stake() and settle_market().

/** Expected payout shown to user BEFORE committing a stake. */
export function expectedPayout(
  userStake: number,
  currentSideTotal: number,
  rewardPool: number
): number {
  if (userStake <= 0) return 0;
  return (userStake / (currentSideTotal + userStake)) * rewardPool;
}

/** Actual payout per winner calculated AFTER market closes. */
export function settlementPayout(
  userStake: number,
  winningSideTotal: number,
  rewardPool: number
): number {
  if (winningSideTotal <= 0) return 0;
  return (userStake / winningSideTotal) * rewardPool;
}

/** Platform margin — the profit kept by the platform. Always >= 0 when R < T. */
export function platformMargin(totalStaked: number, rewardPool: number): number {
  return totalStaked - rewardPool;
}

/** Recommended reward pool given expected total stakes and a target margin %. */
export function recommendedPool(expectedTotal: number, targetMarginPct: number): number {
  return expectedTotal * (1 - targetMarginPct / 100);
}

/** Margin as a percentage of total staked. */
export function marginPercent(totalStaked: number, rewardPool: number): number {
  if (totalStaked <= 0) return 0;
  return ((totalStaked - rewardPool) / totalStaked) * 100;
}

/** Percentage of the pool filled so far. */
export function poolFillPercent(totalStaked: number, rewardPool: number): number {
  if (rewardPool <= 0) return 0;
  return Math.min((totalStaked / rewardPool) * 100, 100);
}

/** YES percentage of total staked. */
export function yesPct(totalYes: number, totalNo: number): number {
  const total = totalYes + totalNo;
  if (total <= 0) return 50;
  return (totalYes / total) * 100;
}
