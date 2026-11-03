export const OWN_IDS_STORAGE_KEY = 'afterlight_own_ids_v1';

function validId(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function normalizeOwnIds(value) {
  if (!Array.isArray(value)) return [];
  const ids = new Set();
  for (const id of value) {
    if (validId(id)) ids.add(id);
  }
  return [...ids];
}

export function loadOwnIds(storage, key = OWN_IDS_STORAGE_KEY) {
  try {
    return new Set(normalizeOwnIds(JSON.parse(storage?.getItem?.(key) || '[]')));
  } catch {
    return new Set();
  }
}

export function persistOwnIds(storage, ownIds, key = OWN_IDS_STORAGE_KEY) {
  try {
    storage?.setItem?.(key, JSON.stringify(normalizeOwnIds([...ownIds])));
    return true;
  } catch {
    return false;
  }
}

export function rememberOwnId(ownIds, id, storage, key = OWN_IDS_STORAGE_KEY) {
  if (!validId(id) || !ownIds?.add) return false;
  ownIds.add(id);
  persistOwnIds(storage, ownIds, key);
  return true;
}

export function isOwnStar(account, {
  ownIds = new Set(),
  sessionOwnIds = new Set(),
  includeLocalMyStars = false,
} = {}) {
  const id = account?.id;
  return validId(id) && (
    ownIds?.has?.(id) ||
    sessionOwnIds?.has?.(id) ||
    (includeLocalMyStars && id.startsWith('MY-'))
  );
}

export function ownStarIndices(accounts, options) {
  if (!Array.isArray(accounts)) return [];
  const indices = [];
  accounts.forEach((account, index) => {
    if (isOwnStar(account, options)) indices.push(index);
  });
  return indices;
}

export function canAddAccountOwner(account, options) {
  return Boolean(account && !account.owner && isOwnStar(account, options));
}

// Returns -1 when no currently visible account belongs to this browser. Stale
// IDs deliberately remain in storage: a shared list can be temporarily stale,
// while the dock only acts on records that are actually present right now.
export function nextOwnStarIndex(accounts, currentId, options) {
  const indices = ownStarIndices(accounts, options);
  if (!indices.length) return -1;
  const currentOffset = indices.findIndex(index => accounts[index]?.id === currentId);
  return indices[(currentOffset + 1 + indices.length) % indices.length];
}
