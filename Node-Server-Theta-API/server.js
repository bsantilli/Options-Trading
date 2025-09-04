import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();


// Put in .env and load with dotenv in real projects
//const PORT = process.env.PORT || 5000;
const THETA_BASE_URL = process.env.THETA_BASE_URL || "http://127.0.0.1:25510/v2";
const PORT = 5000;   // need to investigate how to use process.env

const app = express();

// Allow your front-end origins (adjust as needed)
app.use(cors({ origin: ["http://localhost:3000", "http://localhost:5173"] }));
app.use(express.json());


// Define a simple route
app.get("/", (req,res)=>{
res.send("Hello from the server");
});


/**
 * Parse a Theta bulk_snapshot NDJSON/text response into an array of objects.
 * Many Theta endpoints return newline-delimited JSON (not a single JSON array).
 * We’ll split on newlines and JSON.parse each non-empty line.
 */
function parseNdjsonToArray(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t)); } catch {}
  }
  return out;
}

// Fetch all pages; gracefully handles JSON or NDJSON pages + both pagination styles
async function fetchAllOptionSnapshotsJSON({ baseUrl, root, exp }) {
  const params = new URLSearchParams({ root, exp });
  let url = `${baseUrl}/bulk_snapshot/option/quote?${params.toString()}`;

  const all = [];
  let header = null;

  while (url) {
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Theta fetch failed: ${res.status} ${body}`);
    }
    const text = await res.text();
    const { items, header: pageHeader } = parseThetaPage(text);

    if (pageHeader && !header) header = pageHeader; // first page header
    all.push(...items);

    // Try HTTP header first, then body header.next_page
    const hNext = res.headers.get("Next-Page");
    if (hNext && hNext !== "null") {
      url = hNext;
    } else if (pageHeader?.next_page && pageHeader.next_page !== "null") {
      url = pageHeader.next_page;
    } else {
      url = null;
    }
  }

  return { items: all, header };
}

const validateParams = (root, exp, res) => {
  if (!root || typeof root !== "string") {
    res.status(400).json({ error: "Missing or invalid 'root' (e.g., AAPL)" });
    return false;
  }
  if (!/^\d{8}$/.test(String(exp))) {
    res.status(400).json({ error: "Missing or invalid 'exp' (YYYYMMDD, e.g., 20260116)" });
    return false;
  }
  return true;
};



// --- helpers ---

// Parse possible NDJSON OR JSON body into { items[], header? }
function parseThetaPage(text) {
  // Try JSON object (your sample shape)
  try {
    const obj = JSON.parse(text);
    if (obj && Array.isArray(obj.response)) {
      return { items: obj.response, header: obj.header || null };
    }
  } catch {
    // Fall through to NDJSON
  }

  // NDJSON: header line + many contract lines
  const items = [];
  let header = null;
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      const o = JSON.parse(t);
      if (o && o.header) header = o.header;
      else if (o && o.contract) items.push(o);
    } catch {
      // ignore bad line
    }
  }
  return { items, header };
}

// Find index of a field (e.g. "bid", "ask") from header.format, fallback if missing
function getFieldIndex(header, key, fallback) {
  const fmt = header?.format;
  if (Array.isArray(fmt)) {
    const idx = fmt.indexOf(key);
    if (idx !== -1) return idx;
  }
  return fallback;
}

// Strike minor-units -> dollars
function toStrikeDollars(minor) {
  const n = Number(minor);
  // Heuristic: your sample 20000 → 200.00 (÷100). Some feeds use ÷1000 (e.g., 180000 → 180.00).
  if (n >= 100000) return n / 1000; // 180000 -> 180.000
  if (n >= 10000)  return n / 100;  // 20000  -> 200.00
  return n / 100;                   // sensible default
}

function normRight(v) {
  const s = String(v ?? "").toUpperCase();
  if (s === "C" || s === "CALL") return "C";
  if (s === "P" || s === "PUT")  return "P";
  return null;
}



/**
 * Fetch *all* pages by following the Next-Page header.
 * Returns a single flattened array of snapshot objects.
 */

// ----------------------------------------------------------------

// Options chain: Calls | Strike | Puts with Bid/Ask only
// Replace your /api/theta/options-chain handler with this hardened version.
// --- route ---

app.get("/api/theta/options-chain", async (req, res) => {
  try {
    const { root, exp, debug } = req.query;
    if (!root || !/^\d{8}$/.test(String(exp))) {
      return res.status(400).json({ error: "Required query params: root, exp=YYYYMMDD" });
    }

    const baseUrl = process.env.THETA_BASE_URL || "http://127.0.0.1:25510/v2";
    const { items, header } = await fetchAllOptionSnapshotsJSON({ baseUrl, root, exp });

    // Derive indices from header.format with safe fallbacks
    const bidIdx = getFieldIndex(header, "bid", 3);
    const askIdx = getFieldIndex(header, "ask", 7);

    // Build chain: merge calls & puts per strike (latest tick = last in ticks[])
    const byStrike = new Map();

    for (const it of items) {
      const c = it?.contract;
      if (!c?.strike || !c?.right) continue;

      const ticks = Array.isArray(it?.ticks) ? it.ticks : [];
      const last = ticks.length ? ticks[ticks.length - 1] : null;
      const bid = last ? Number(last[bidIdx]) : null;
      const ask = last ? Number(last[askIdx]) : null;

      const strike = toStrikeDollars(c.strike);
      const key = strike.toFixed(2);
      const side = normRight(c.right);
      if (!side) continue;

      if (!byStrike.has(key)) {
        byStrike.set(key, { strike, callBid: null, callAsk: null, putBid: null, putAsk: null });
      }
      const row = byStrike.get(key);

      if (side === "C") {
        if (bid != null) row.callBid = bid;
        if (ask != null) row.callAsk = ask;
      } else {
        if (bid != null) row.putBid = bid;
        if (ask != null) row.putAsk = ask;
      }
    }

    const chain = Array.from(byStrike.values()).sort((a, b) => a.strike - b.strike);

    if (debug === "1") {
      return res.json({
        root, exp,
        format: header?.format || null,
        countIn: items.length,
        countOut: chain.length,
        sampleOut: chain.slice(0, 5),
      });
    }

    res.json({ root, exp, count: chain.length, results: chain });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err.message || err) });
  }
});


/**
 * GET /api/theta/options-snapshot?root=AAPL&exp=20250117
 */
app.get("/api/theta/options-snapshot", async (req, res) => {
  try {
    const { root, exp } = req.query;
    if (!validateParams(root, exp, res)) return;

    // IMPORTANT: pass baseUrl so it's never undefined
    const data = await fetchAllOptionSnapshotsJSON({ root, exp, baseUrl: THETA_BASE_URL });
    res.json({ count: data.length, results: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err.message || err) });
  }
});


/**
 * GET /api/theta/roots
 * Optional query params are passed straight through to Theta (e.g., ?asset_class=stock).
 * Returns concatenated text across all pages.
 */

app.get("/api/theta/roots", async (req, res) => {
  try {
    const params = new URLSearchParams(req.query); // pass-through filters
    let url = `${THETA_BASE_URL}/list/roots/stock?${params.toString()}`;

    // We'll accumulate text pages; if Theta returns CSV/lines, we’ll join with newlines.
    const pages = [];

    while (url) {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Theta responded with status ${response.status}`);
      }

      const pageText = await response.text();
      pages.push(pageText);

      const nextPage = response.headers.get("Next-Page");
      url = nextPage && nextPage !== "null" ? nextPage : null;
    }

    // If Theta returns text/CSV, keep text. If it’s JSON per line (NDJSON), you can parse here.
    res.type("text/plain").send(pages.join("\n"));
  } catch (err) {
    console.error("Theta proxy error:", err);
    res.status(502).json({ error: "Upstream Theta error", details: String(err) });
  }
});


//*****************************************************************************//
// START SERVER
//*****************************************************************************//
app.listen(PORT, ()=>{
console.log(`Server is running on port ${PORT}`);
});
