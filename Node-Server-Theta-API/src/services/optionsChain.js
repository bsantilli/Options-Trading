import { isISODate, isYYYYMMDD, isoToYmd, ymdToIso, todayYMD, labelForExp } from "../utils/date.js";
import { isSymbol, normRight, numOrNull } from "../utils/validation.js";
import { getLen } from "../utils/numbers.js";
import { listExpirations, snapshotQuotes, snapshotOpenInterest, snapshotOHLC, snapshotImpliedVol } from "./thetaApi.js";

export async function getExpirationsService(symbol, tz) {
  if (!isSymbol(symbol)) throw new Error("Invalid or missing ?symbol");
  const payload = await listExpirations(symbol);
  const isoList = Array.isArray(payload?.expiration) ? payload.expiration : [];
  const cutoff = todayYMD(tz);

  const seen = new Set(
    isoList
      .filter((s) => typeof s === "string" && isISODate(s))
      .map((iso) => iso.replaceAll("-", ""))
      .filter((ymd) => Number(ymd) >= Number(cutoff))
  );

  const out = Array.from(seen)
    .sort((a, b) => Number(a) - Number(b))
    .map((yyyymmdd) => ({ yyyymmdd, label: labelForExp(yyyymmdd) }));

  return out;
}

export async function getOptionsChainService(symbol, exp) {
  if (!isSymbol(symbol)) throw new Error("Invalid or missing ?root|symbol");
  if (!exp) throw new Error("Missing ?exp");

  const expIso = isISODate(exp) ? exp : ymdToIso(exp);
  const expYmd = isYYYYMMDD(exp) ? exp : isoToYmd(exp);

  // Parallel fetch
  const [dataQ, dataOI, dataOHLC, dataIV] = await Promise.all([
    snapshotQuotes(symbol, expIso),
    snapshotOpenInterest(symbol, expIso),
    snapshotOHLC(symbol, expIso),
    snapshotImpliedVol(symbol, expIso),
  ]);

  // Build OI map
  const oiMap = new Map();
  for (let i = 0, n = getLen(dataOI); i < n; i++) {
    const strike = numOrNull(dataOI?.strike?.[i]);
    const right  = normRight(dataOI?.right?.[i]);
    const oiRaw  = dataOI?.open_interest?.[i] ?? dataOI?.oi?.[i] ?? null;
    const oiNum  = oiRaw == null ? null : Number(oiRaw);
    if (strike == null || !right) continue;
    oiMap.set(`${strike}|${right}`, Number.isFinite(oiNum) ? oiNum : null);
  }

  // Build Vol map (from OHLC)
  const volMap = new Map();
  for (let i = 0, n = getLen(dataOHLC); i < n; i++) {
    const strike = numOrNull(dataOHLC?.strike?.[i]);
    const right  = normRight(dataOHLC?.right?.[i]); // C/P
    const volRaw = dataOHLC?.volume?.[i];
    const volNum = volRaw == null ? null : Number(volRaw);
    if (strike == null || !right) continue;
    volMap.set(`${strike}|${right}`, Number.isFinite(volNum) ? volNum : null);
  }

  // Build IV map and extract underlying price/time from IV snapshot
  const ivMap = new Map();
  let underlyingPrice = null;
  let underlyingTimestamp = null;
  if (dataIV) {
    const len = getLen(dataIV);
    for (let i = 0; i < len; i++) {
      const strike = numOrNull(dataIV?.strike?.[i]);
      const right  = normRight(dataIV?.right?.[i]);
      const ivRaw  = dataIV?.implied_vol?.[i];
      if (i === 0) {
        const u = dataIV?.underlying_price?.[i];
        const t = dataIV?.underlying_timestamp?.[i];
        if (u != null) underlyingPrice = Number(u);
        if (t) underlyingTimestamp = String(t);
      }
      const ivNum = ivRaw == null ? null : Number(ivRaw);
      if (strike == null || !right) continue;
      ivMap.set(`${strike}|${right}`, Number.isFinite(ivNum) ? ivNum : null);
    }
  }

  // Merge into rows from Quotes
  const byStrike = new Map();
  for (let i = 0, n = getLen(dataQ); i < n; i++) {
    const strike = numOrNull(dataQ?.strike?.[i]);
    const right  = normRight(dataQ?.right?.[i]); // "C" or "P"
    const bidRaw = dataQ?.bid?.[i];
    const askRaw = dataQ?.ask?.[i];
    const bid = bidRaw == null ? null : Number(bidRaw);
    const ask = askRaw == null ? null : Number(askRaw);
    if (strike == null || !right) continue;

    if (!byStrike.has(strike)) {
      byStrike.set(strike, {
        strike,
        callBid: null, callAsk: null, callOI: null, callVol: null, callIV: null,
        putBid:  null, putAsk:  null, putOI:  null, putVol:  null, putIV: null,
      });
    }
    const row = byStrike.get(strike);
    const key = `${strike}|${right}`;
    const oiVal  = oiMap.get(key) ?? null;
    const volVal = volMap.get(key) ?? null;
    const ivVal  = ivMap.get(key) ?? null;

    if (right === "C") {
      if (bid != null) row.callBid = bid;
      if (ask != null) row.callAsk = ask;
      if (oiVal != null) row.callOI = oiVal;
      if (volVal != null) row.callVol = volVal;
      if (ivVal != null) row.callIV = ivVal;
    } else {
      if (bid != null) row.putBid = bid;
      if (ask != null) row.putAsk = ask;
      if (oiVal != null) row.putOI = oiVal;
      if (volVal != null) row.putVol = volVal;
      if (ivVal != null) row.putIV = ivVal;
    }
  }

  const results = Array.from(byStrike.values()).sort((a, b) => a.strike - b.strike);
  const underlying = underlyingPrice != null ? { price: underlyingPrice, timestamp: underlyingTimestamp } : null;
  return { root: symbol, exp: expYmd, count: results.length, underlying, results };
}
