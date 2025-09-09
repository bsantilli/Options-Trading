import { isISODate, isYYYYMMDD, isoToYmd, ymdToIso, todayYMD, labelForExp } from "../utils/date.js";
import { isSymbol, normRight, numOrNull } from "../utils/validation.js";
import { getLen } from "../utils/numbers.js";
import { listExpirations, snapshotQuotes, snapshotOpenInterest, snapshotOHLC } from "./thetaApi.js";

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

  return Array.from(seen)
    .sort((a, b) => Number(a) - Number(b))
    .map((yyyymmdd) => ({ yyyymmdd, label: labelForExp(yyyymmdd) }));
}

export async function getOptionsChainService(symbol, exp) {
  if (!isSymbol(symbol)) throw new Error("Required query param: symbol/root");
  if (!exp || (!isYYYYMMDD(exp) && !isISODate(exp))) {
    throw new Error("Required query param: exp (YYYYMMDD or YYYY-MM-DD)");
  }

  const expIso = isISODate(exp) ? exp : ymdToIso(exp);
  const expYmd = isYYYYMMDD(exp) ? exp : isoToYmd(exp);

  // Parallel fetch
  const [dataQ, dataOI, dataOHLC] = await Promise.all([
    snapshotQuotes(symbol, expIso),
    snapshotOpenInterest(symbol, expIso),
    snapshotOHLC(symbol, expIso),
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

  // Merge into rows from Quotes
  const byStrike = new Map();
  for (let i = 0, n = getLen(dataQ); i < n; i++) {
    const strike = numOrNull(dataQ?.strike?.[i]);
    const right  = normRight(dataQ?.right?.[i]);
    const bid    = numOrNull(dataQ?.bid?.[i]);
    const ask    = numOrNull(dataQ?.ask?.[i]);
    if (strike == null || !right) continue;

    if (!byStrike.has(strike)) {
      byStrike.set(strike, {
        strike,
        callBid: null, callAsk: null, callOI: null, callVol: null,
        putBid:  null, putAsk:  null, putOI:  null, putVol:  null,
      });
    }
    const row = byStrike.get(strike);
    const key = `${strike}|${right}`;
    const oiVal  = oiMap.get(key) ?? null;
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
  return { root: symbol, exp: expYmd, count: results.length, results };
}
