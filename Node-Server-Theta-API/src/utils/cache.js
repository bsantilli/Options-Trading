// Tiny in-memory TTL cache for GETs
const store = new Map(); // key -> { value, expiry }
export function cacheGet(key) {
  const hit = store.get(key);
  if (!hit) return null;
  if (hit.expiry < Date.now()) { store.delete(key); return null; }
  return hit.value;
}
export function cacheSet(key, value, ttlMs) {
  store.set(key, { value, expiry: Date.now() + ttlMs });
}
