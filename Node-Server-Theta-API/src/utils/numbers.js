export const getLen = (obj) =>
  Math.max(...Object.values(obj || {}).map((v) => (Array.isArray(v) ? v.length : 0)), 0);
