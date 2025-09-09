export const isYYYYMMDD = (s) => typeof s === "string" && /^\d{8}$/.test(s);
export const isISODate  = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

export function ymdToIso(ymd) {
  if (!isYYYYMMDD(ymd)) throw new Error("exp must be YYYYMMDD");
  return `${ymd.slice(0,4)}-${ymd.slice(4,6)}-${ymd.slice(6,8)}`;
}
export function isoToYmd(iso) {
  if (!isISODate(iso)) throw new Error("exp must be YYYY-MM-DD");
  return iso.replaceAll("-", "");
}

export const todayYMD = (tz = "America/New_York") => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const obj = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${obj.year}${obj.month}${obj.day}`;
};

const yyyymmddToDate = (ymd) => new Date(+ymd.slice(0,4), +ymd.slice(4,6)-1, +ymd.slice(6,8));
const isThirdFriday = (dt) => dt.getDay() === 5 && dt.getDate() >= 15 && dt.getDate() <= 21;

export const labelForExp = (yyyymmdd) => {
  const dt = yyyymmddToDate(yyyymmdd);
  const mon = dt.toLocaleString("en-US", { month: "short" });
  const day = String(dt.getDate()).padStart(2, "0");
  const base = `${mon} ${day}`;
  return isThirdFriday(dt) ? base : `${base} (W)`;
};
