import dotenv from "dotenv";
dotenv.config();

const cfg = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT || 3001),
  TZ: process.env.TZ || "America/New_York",
  CORS_ORIGINS: (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  THETA_V3_BASE_URL: process.env.THETA_V3_BASE_URL || "http://localhost:25503/v3",
  THETA_CACHE_TTL_MS: Number(process.env.THETA_CACHE_TTL_MS || 1500), // short-lived snapshots
};

export default cfg;
