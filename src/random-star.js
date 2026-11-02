// Picks stars for the "visit a random star" control. A shuffle bag rather
// than independent draws: every eligible star is visited once, in random
// order, before any repeats — so a small sky never ping-pongs between two
// records. The bag holds account IDs (not indices) because the account list
// can be replaced by remote sync between presses.

function shuffle(items, random) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/**
 * Returns the index of the next star to visit, or -1 when none is eligible.
 * `bag` is mutated: callers keep one array across presses.
 */
export function drawRandomStar(accounts, bag, { isEligible, currentId = null, random = Math.random }) {
  if (!Array.isArray(accounts) || !Array.isArray(bag)) return -1;
  const indexById = new Map(accounts.map((account, index) => [account?.id, index]));
  const eligibleIndex = id => {
    const index = indexById.get(id);
    return index !== undefined && isEligible(accounts[index], index) ? index : -1;
  };
  for (let refill = 0; refill < 2; refill++) {
    while (bag.length) {
      const id = bag.pop();
      const index = eligibleIndex(id);
      if (index >= 0 && id !== currentId) return index;
    }
    const ids = accounts
      .filter((account, index) => account?.id !== currentId && isEligible(account, index))
      .map(account => account.id);
    if (!ids.length) break;
    bag.push(...shuffle(ids, random));
  }
  // The only eligible star is the one already open: show it again rather
  // than leaving the button unresponsive.
  return currentId === null ? -1 : eligibleIndex(currentId);
}
