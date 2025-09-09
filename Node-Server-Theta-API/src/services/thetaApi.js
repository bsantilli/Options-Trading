import cfg from "../config/env.js";
import { cacheGet, cacheSet } from "../utils/cache.js";

// Node 18+ has global fetch; if you're on older Node, install node-fetch and import it.

const base = cfg.THETA_V3_BASE_URL;

async function getJson(url, cacheKey) {
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const resp = await fetch(url);
  const raw = await resp.text();

  if (!resp.ok) {
    throw new Error(`Theta ${url} -> ${resp.status}: ${raw.slice(0,300)}`);
  }
  let data;
  try { data = JSON.parse(raw); }
  catch { throw new Error(`Theta returned non-JSON for ${url}: ${raw.slice(0,400)}`); }

  cacheSet(cacheKey, data, cfg.THETA_CACHE_TTL_MS);
  return data;
}

export async function listExpirations(symbol) {
  const q = new URLSearchParams({ symbol, format: "json" });
  return getJson(`${base}/option/list/expirations?${q.toString()}`, `exp:${symbol}`);
}

export async function snapshotQuotes(symbol, expIso) {
  const q = new URLSearchParams({ symbol, expiration: expIso, format: "json" });
  return getJson(`${base}/option/snapshot/quote?${q.toString()}`, `q:${symbol}:${expIso}`);
}

export async function snapshotOpenInterest(symbol, expIso) {
  const q = new URLSearchParams({ symbol, expiration: expIso, format: "json" });
  return getJson(`${base}/option/snapshot/open_interest?${q.toString()}`, `oi:${symbol}:${expIso}`);
}

export async function snapshotOHLC(symbol, expIso) {
  const q = new URLSearchParams({ symbol, expiration: expIso, format: "json" });
  return getJson(`${base}/option/snapshot/ohlc?${q.toString()}`, `ohlc:${symbol}:${expIso}`);
}
