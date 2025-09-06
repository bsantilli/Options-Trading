import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import morgan from "morgan";

dotenv.config();

// Put in .env and load with dotenv in real projects
//const PORT = process.env.PORT || 5000;
const THETA_BASE_URL = process.env.THETA_BASE_URL;
const PORT = Number(process.env.PORT);

// Optional: configurable CORS origins via env
const corsOrigins = (process.env.CORS_ORIGINS)
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const app = express();
app.use(helmet());
app.use(morgan("dev"));
app.use(cors({ origin: corsOrigins }));
app.use(express.json());


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
  if (n >= 10000) return n / 100;  // 20000  -> 200.00
  return n / 100;                   // sensible default
}

function normRight(v) {
  const s = String(v ?? "").toUpperCase();
  if (s === "C" || s === "CALL") return "C";
  if (s === "P" || s === "PUT") return "P";
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

// Health check
app.get("/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.get("/api/theta/options-chain", async (req, res) => {
  try {
    const { root, exp, debug } = req.query;
    if (!root || !/^\d{8}$/.test(String(exp))) {
      return res.status(400).json({ error: "Required query params: root, exp=YYYYMMDD" });
    }

    const baseUrl = process.env.THETA_BASE_URL /*|| "http://127.0.0.1:25510/v2"*/;
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

app.get("/api/theta/option-expirations", async(req, res) => {
try {
  const root = String(req.query.root || "").trim().toUpperCase();
  if (!root || !/^[A-Z.\-]{1,8}$/.test(root)) {
    return res.status(400).json({ error: "Invalid or missing ?root symbol" });
  }

  const baseUrl = THETA_BASE_URL || "http://127.0.0.1:25510/v2";
  const params = new URLSearchParams({ root });
  let url = `${baseUrl}/list/expirations?${params.toString()}`;

  // --- helpers ---
  const asYMD = (v) => {
    const s = String(v ?? "").trim();
    return /^\d{8}$/.test(s) ? s : null; // accept numeric or string YYYYMMDD
  };
  const yyyymmddToDate = (ymd) => {
    const y = Number(ymd.slice(0, 4));
    const m = Number(ymd.slice(4, 6));
    const d = Number(ymd.slice(6, 8));
    return new Date(y, m - 1, d);
  };
  const isThirdFriday = (dt) => dt.getDay() === 5 && dt.getDate() >= 15 && dt.getDate() <= 21;
  const labelFor = (ymd) => {
    const dt = yyyymmddToDate(ymd);
    const mon = dt.toLocaleString("en-US", { month: "short" });
    const day = String(dt.getDate()).padStart(2, "0");
    const base = `${mon} ${day}`;
    return isThirdFriday(dt) ? base : `${base} (W)`;
  };
  const todayYMD = (tz = "America/New_York") => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const obj = Object.fromEntries(parts.map(p => [p.type, p.value]));
    // en-CA gives YYYY-MM-DD parts
    return `${obj.year}${obj.month}${obj.day}`;
  };
  const cutoff = todayYMD(); // keep today and future only

  // --- collect across paginated responses ---
  const seen = new Set();
  while (url) {
    const response = await fetch(url);
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return res.status(response.status).json({ error: `Theta response ${response.status}: ${body}` });
    }

    const text = await response.text();

    // Expected shape per Theta docs:
    // { "header": { "format": ["date"], ... }, "response": [20241011, 20241018, ...] }
    let bodyNextPage = null;
    let parsed = false;
    try {
      const obj = JSON.parse(text);
      if (obj && Array.isArray(obj.response)) {
        parsed = true;
        for (const v of obj.response) {
          const ymd = asYMD(v);
          if (ymd && Number(ymd) >= Number(cutoff)) seen.add(ymd);
        }
        bodyNextPage = obj?.header?.next_page || null;
      }
    } catch {
      // Fallback: NDJSON/line-delimited tolerance (just in case)
    }

    if (!parsed) {
      for (const line of text.split(/\r?\n/)) {
        const t = line.trim();
        if (!t) continue;
        const direct = asYMD(t);
        if (direct) {
          if (Number(direct) >= Number(cutoff)) seen.add(direct);
          continue;
        }
        try {
          const o = JSON.parse(t);
          const ymd = asYMD(o?.date ?? o?.yyyymmdd ?? o?.exp ?? o);
          if (ymd && Number(ymd) >= Number(cutoff)) seen.add(ymd);
          if (!bodyNextPage && o?.header?.next_page) bodyNextPage = o.header.next_page;
        } catch { /* ignore */ }
      }
    }

    const headerNext = response.headers.get("Next-Page");
    url =
      headerNext && headerNext !== "null"
        ? headerNext
        : bodyNextPage && bodyNextPage !== "null"
        ? bodyNextPage
        : null;
  }

  // Normalize + sort ascending + label
  const out = Array.from(seen)
    .sort((a, b) => Number(a) - Number(b))
    .map((yyyymmdd) => ({ yyyymmdd, label: labelFor(yyyymmdd) }));

  return res.json(out);
} catch (err) {
  console.error("option-expirations error:", err);
  return res.status(500).json({ error: String(err.message || err) });
}
  });  


//*****************************************************************************//
// START SERVER
//*****************************************************************************//
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
