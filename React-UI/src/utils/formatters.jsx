export const fmt = (n, d = 2) =>
  n === null || n === undefined || Number.isNaN(Number(n)) ? "—" : Number(n).toFixed(d);

export const fmtStrike = (n) =>
  n === null || n === undefined || Number.isNaN(Number(n)) ? "—" : Number(n).toFixed(2);

export const formatExp = (yyyymmdd) => {
  if (!/^\d{8}$/.test(String(yyyymmdd))) return yyyymmdd || "";
  const y = String(yyyymmdd).slice(0, 4);
  const m = String(yyyymmdd).slice(4, 6);
  const d = String(yyyymmdd).slice(6, 8);
  const dt = new Date(`${y}-${m}-${d}T00:00:00`);
  return dt.toLocaleDateString(undefined, { month: "short", day: "2-digit", year: "numeric" });
};

export const fmtInt = (n) =>
  n === null || n === undefined || Number.isNaN(Number(n))
    ? "—"
    : Math.round(Number(n)).toLocaleString();

export const expLabelWithYear = (label, yyyymmdd) => {
  const CURRENT_YEAR = new Date().getFullYear();
  if (!label || !yyyymmdd || yyyymmdd.length < 4) return label || "";
  const yr = Number(yyyymmdd.slice(0, 4));
  if (!Number.isFinite(yr) || yr === CURRENT_YEAR) return label;

  const shortYr = String(yr % 100).padStart(2, "0");
  // Always append at end so "(W)" stays where it is: "Oct 24 (W) '26"
  const alreadyHas = label.includes(`'${shortYr}`);
  return alreadyHas ? label : `${label} '${shortYr}`;
};
