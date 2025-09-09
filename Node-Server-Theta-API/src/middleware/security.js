import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import compression from "compression";
import cfg from "../config/env.js";

export default function applySecurity(app) {
  app.use(helmet());
  app.use(compression());
  app.use(morgan("dev"));
  app.use(cors({ origin: cfg.CORS_ORIGINS.length ? cfg.CORS_ORIGINS : true }));
  app.use((req, _res, next) => { req.startTs = Date.now(); next(); });
}
