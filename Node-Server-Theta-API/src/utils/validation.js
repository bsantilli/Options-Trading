export const isSymbol = (s) => /^[A-Z.\-]{1,8}$/.test(s || "");
export const normRight = (v) => {
  const s = String(v ?? "").toUpperCase();
  if (s === "C" || s === "CALL") return "C";
  if (s === "P" || s === "PUT") return "P";
  return null;
};
export const numOrNull = (v) =>
  v == null || Number.isNaN(Number(v)) ? null : Number(v);
