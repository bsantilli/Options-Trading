// src/services/optionsService.js
const BASE_URL = "http://localhost:5000";

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
