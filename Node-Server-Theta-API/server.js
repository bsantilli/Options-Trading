import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import morgan from "morgan";

dotenv.config();

const THETA_V3_BASE_URL = process.env.THETA_V3_BASE_URL || "http://localhost:25503/v3";
const PORT = Number(process.env.PORT);

// Optional: configurable CORS origins via env
const corsOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const app = express();
app.use(helmet());
app.use(morgan("dev"));
app.use(cors({ origin: corsOrigins.length ? corsOrigins : true }));
app.use(express.json());

// ------------------ small helpers ------------------
const isYYYYMMDD = (s) => typeof s === "string" && /^\d{8}$/.test(s);
const isISODate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

function ymdToIso(ymd) {
  if (!isYYYYMMDD(ymd)) throw new Error("exp must be YYYYMMDD");
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

function isoToYmd(iso) {
  if (!isISODate(iso)) throw new Error("exp must be YYYY-MM-DD");
  return iso.replaceAll("-", "");
}

const normRight = (v) => {
  const s = String(v ?? "").toUpperCase();
  if (s === "C" || s === "CALL") return "C";
  if (s === "P" || s === "PUT") return "P";
  return null;
};

const fmtNum = (v) => (v == null || Number.isNaN(Number(v)) ? null : Number(v));

// Health check
app.get("/health", (_req, res) =>
  res.json({ ok: true, time: new Date().toISOString() })
);

/**
 * v3 Option expirations (already added; kept as-is)
 * Input:  ?symbol=TSLA  (or ?root=TSLA for back-compat)
 * Output: [{ yyyymmdd, label }, ...] (today + future only)
 */
app.get("/api/theta/option-expirations", async (req, res) => {
  try {
    const symbolRaw = (req.query.symbol || req.query.root || "").toString().trim().toUpperCase();
    if (!symbolRaw || !/^[A-Z.\-]{1,8}$/.test(symbolRaw)) {
      return res.status(400).json({ error: "Invalid or missing ?symbol (or ?root) parameter" });
    }

    // helpers
    const toYYYYMMDD = (iso /* 'YYYY-MM-DD' */) => String(iso ?? "").replaceAll("-", "");
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
        timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      }).formatToParts(new Date());
      const obj = Object.fromEntries(parts.map((p) => [p.type, p.value]));
      return `${obj.year}${obj.month}${obj.day}`;
    };
    const cutoff = todayYMD();

    // call v3
    const params = new URLSearchParams({ symbol: symbolRaw, format: "json" });
    const url = `${THETA_V3_BASE_URL}/option/list/expirations?${params.toString()}`;

    const response = await fetch(url);
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return res.status(response.status).json({ error: `Theta v3 response ${response.status}`, detail: body });
    }

    const raw = await response.text();
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return res.status(502).json({ error: "Theta v3 returned non-JSON", sample: raw.slice(0, 800) });
    }

    const isoList = Array.isArray(payload?.expiration) ? payload.expiration : [];
    const seen = new Set(
      isoList
        .filter((s) => typeof s === "string" && isISODate(s))
        .map(toYYYYMMDD)
        .filter((ymd) => Number(ymd) >= Number(cutoff))
    );

    const out = Array.from(seen)
      .sort((a, b) => Number(a) - Number(b))
      .map((yyyymmdd) => ({ yyyymmdd, label: labelFor(yyyymmdd) }));

    return res.json(out);
  } catch (err) {
    console.error("option-expirations (v3) error:", err);
    return res.status(500).json({ error: String(err.message || err) });
  }
});

/**
 * ✅ UPDATED: Options chain via Theta v3 snapshot
 * Accepts:
 *   - ?symbol= or ?root=  (SYMBOL)
 *   - ?exp=YYYYMMDD or YYYY-MM-DD
 *
 * Returns (unchanged shape):
 *   { root, exp, count, results: [{ strike, callBid, callAsk, putBid, putAsk }, ...] }
 */
app.get("/api/theta/options-chain", async (req, res) => {
  try {
    const isYYYYMMDD = (s) => typeof s === "string" && /^\d{8}$/.test(s);
    const isISODate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
    const ymdToIso = (ymd) => `${ymd.slice(0,4)}-${ymd.slice(4,6)}-${ymd.slice(6,8)}`;
    const isoToYmd = (iso) => iso.replaceAll("-", "");
    const normRight = (v) => {
      const s = String(v ?? "").toUpperCase();
      if (s === "C" || s === "CALL") return "C";
      if (s === "P" || s === "PUT") return "P";
      return null;
    };
    const numOrNull = (v) => (v == null || Number.isNaN(Number(v)) ? null : Number(v));

    const symbol = (req.query.symbol || req.query.root || "").toString().trim().toUpperCase();
    let exp = (req.query.exp || "").toString().trim();

    if (!symbol || !/^[A-Z.\-]{1,8}$/.test(symbol)) {
      return res.status(400).json({ error: "Required query param: symbol/root" });
    }
    if (!exp || (!isYYYYMMDD(exp) && !isISODate(exp))) {
      return res.status(400).json({ error: "Required query param: exp (YYYYMMDD or YYYY-MM-DD)" });
    }

    const expIso = isISODate(exp) ? exp : ymdToIso(exp);
    const expYmd = isYYYYMMDD(exp) ? exp : isoToYmd(exp);

    // Build URLs
    const q = new URLSearchParams({ symbol, expiration: expIso, format: "json" });
    const urlQuotes = `${THETA_V3_BASE_URL}/option/snapshot/quote?${q.toString()}`;
    const urlOI     = `${THETA_V3_BASE_URL}/option/snapshot/open_interest?${q.toString()}`;
    const urlOHLC   = `${THETA_V3_BASE_URL}/option/snapshot/ohlc?${q.toString()}`;


    // Fetch both in parallel
    const [respQ, respOI, respOHLC] = await Promise.all([
      fetch(urlQuotes),
      fetch(urlOI),
      fetch(urlOHLC),
    ]);

    if (!respQ.ok) {
      const body = await respQ.text().catch(() => "");
      return res.status(respQ.status).json({ error: `Theta v3 quotes ${respQ.status}`, detail: body });
    }
    if (!respOI.ok) {
      const body = await respOI.text().catch(() => "");
      return res.status(respOI.status).json({ error: `Theta v3 open_interest ${respOI.status}`, detail: body });
    }

    if (!respOHLC.ok) {
      const body = await respOHLC.text().catch(() => "");
      return res.status(respOHLC.status).json({ error: `Theta v3 ohlc ${respOHLC.status}`, detail: body });
    }

    const rawQ  = await respQ.text();
    const rawOI = await respOI.text();
    const rawOHLC = await respOHLC.text();

    let dataQ, dataOI, dataOHLC;
    try { dataQ = JSON.parse(rawQ); } catch { return res.status(502).json({ error: "Theta v3 quotes returned non-JSON", sample: rawQ.slice(0,800) }); }
    try { dataOI = JSON.parse(rawOI); } catch { return res.status(502).json({ error: "Theta v3 open_interest returned non-JSON", sample: rawOI.slice(0,800) }); }
    try { dataOHLC = JSON.parse(rawOHLC); } catch { return res.status(502).json({ error: "Theta v3 ohlc returned non-JSON", sample: rawOHLC.slice(0,800) }); }


    // Build a quick lookup for OI keyed by (strike,right)
    // Try to read OI from common keys: open_interest | oi (fallbacks)
    const getLen = (obj) => Math.max(...Object.values(obj || {}).map((v) => (Array.isArray(v) ? v.length : 0)), 0);
    const N_oi = getLen(dataOI);
    const oiMap = new Map(); // key: `${strike}|${right}` -> number
    for (let i = 0; i < N_oi; i++) {
      const strike = numOrNull(dataOI?.strike?.[i]);
      const right  = normRight(dataOI?.right?.[i]);
      const oi = (
        dataOI?.open_interest?.[i] ??
        dataOI?.oi?.[i] ??
        null
      );
      const oiNum = oi == null ? null : Number(oi);
      if (strike == null || !right) continue;
      oiMap.set(`${strike}|${right}`, Number.isFinite(oiNum) ? oiNum : null);
    }

    // ---- NEW: build volume map from OHLC
    const N_ohlc = getLen(dataOHLC);
    const volMap = new Map(); // key: `${strike}|${right}` -> number
    for (let i = 0; i < N_ohlc; i++) {
      const strike = numOrNull(dataOHLC?.strike?.[i]);
      const right  = normRight(dataOHLC?.right?.[i]); // "C" | "P"
      const volRaw = dataOHLC?.volume?.[i];
      const volNum = volRaw == null ? null : Number(volRaw);
      if (strike == null || !right) continue;
      volMap.set(`${strike}|${right}`, Number.isFinite(volNum) ? volNum : null);
    }

    // Build rows from quotes and merge OI
    const N = getLen(dataQ);
    const byStrike = new Map(); // strike -> row
    for (let i = 0; i < N; i++) {
      const strike = numOrNull(dataQ?.strike?.[i]);
      const right  = normRight(dataQ?.right?.[i]);
      const bid = numOrNull(dataQ?.bid?.[i]);
      const ask = numOrNull(dataQ?.ask?.[i]);
      if (strike == null || !right) continue;

      if (!byStrike.has(strike)) {
        byStrike.set(strike, {
          strike,
          // calls
          callBid: null, callAsk: null, callOI: null, callVol: null,
          // puts
          putBid: null, putAsk: null, putOI: null, putVol: null,
        });
      }
      const row = byStrike.get(strike);

      const key = `${strike}|${right}`;
      const oiVal = oiMap.get(key) ?? null;
      const volVal = volMap.get(key) ?? null;

      if (right === "C") {
        if (bid != null) row.callBid = bid;
        if (ask != null) row.callAsk = ask;
        if (oiVal != null) row.callOI = oiVal;
        if (volVal != null) row.callVol = volVal;
      } else {
        if (bid != null) row.putBid = bid;
        if (ask != null) row.putAsk = ask;
        if (oiVal != null) row.putOI = oiVal;
        if (volVal != null) row.putVol = volVal;
      }
    }

    const results = Array.from(byStrike.values()).sort((a, b) => a.strike - b.strike);
    return res.json({ root: symbol, exp: expYmd, count: results.length, results });
  } catch (err) {
    console.error("options-chain (v3+OI) error:", err);
    return res.status(500).json({ error: String(err.message || err) });
  }
});


//*****************************************************************************//
// START SERVER
//*****************************************************************************//
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
