// src/services/optionsService.js
const BASE_URL = "http://localhost:3001";

/**
 * Fetch the options chain for a given root + expiration (YYYYMMDD)
 * Returns: { results, root, exp, count }
 */
export async function getOptionsChain(root, exp, { signal } = {}) {
  const params = new URLSearchParams({ root, exp });
  const url = `${BASE_URL}/api/theta/options-chain?${params}`;

  const res = await fetch(url, { signal });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${txt ? `: ${txt}` : ""}`);
  }
  return res.json();
}


// --- Expirations (v3 via server proxy) ---
// Returns array of objects: [{ yyyymmdd, label }, ...]
export async function getExpirations(symbol) {
  if (!symbol) throw new Error("symbol required");
  const res = await fetch(`/api/theta/option-expirations?symbol=${encodeURIComponent(symbol)}`);
  if (!res.ok) throw new Error(`Expirations request failed: ${res.status}`);
  // Server already filters to today/future and adds labels
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data;
}