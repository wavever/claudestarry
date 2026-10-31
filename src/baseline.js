// Frozen, manually verified source snapshot. Never interpret this rounded
// aggregate as a list of people or as the number of accounts still banned.
export const BASELINE = Object.freeze({
  id: 'anthropic-banned-accounts-2026-h1',
  accounts: 11_400_000,
  reportedValue: '11.4 million',
  precision: 'rounded',
  metric: 'Banned Accounts',
  periodStart: '2026-01-01',
  periodEnd: '2026-06-30',
  sourceUpdatedAt: '2026-07-23',
  verifiedAt: '2026-10-29',
  sourceTitle: 'Anthropic Transparency Hub · System Trust and Reporting',
  sourceUrl: 'https://www.anthropic.com/transparency/system-trust-reporting',
  appeals: 398_000,
  appealOverturns: 42_000,
  hasIndividualRecords: false,
});

// Each LOD represents the same reported population. Points are aggregate
// samples, NOT individually identified accounts. No fabricated ban dates.
export const HISTORY_LEVELS = Object.freeze([
  {points:22_800, accountsPerPoint:500},
  {points:57_000, accountsPerPoint:200},
  {points:114_000, accountsPerPoint:100},
]);
export function historyLevel(distance, mobile = false) {
  if (mobile) return distance < 24 ? HISTORY_LEVELS[1] : HISTORY_LEVELS[0];
  if (distance < 28) return HISTORY_LEVELS[2];
  return distance > 68 ? HISTORY_LEVELS[0] : HISTORY_LEVELS[1];
}
