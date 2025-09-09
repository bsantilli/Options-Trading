import cfg from "../config/env.js";
import { getExpirationsService, getOptionsChainService } from "../services/optionsChain.js";

export const health = (req, res) =>
  res.json({ ok: true, time: new Date().toISOString() });

export const optionExpirations = async (req, res) => {
  const symbol = String(req.query.symbol || req.query.root || "").trim().toUpperCase();
  const out = await getExpirationsService(symbol, cfg.TZ);
  res.json(out);
};

export const optionsChain = async (req, res) => {
  const symbol = String(req.query.symbol || req.query.root || "").trim().toUpperCase();
  const exp    = String(req.query.exp || "").trim();
  const data   = await getOptionsChainService(symbol, exp);
  res.json(data);
};
