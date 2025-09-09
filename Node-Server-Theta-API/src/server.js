import cfg from "./config/env.js";
import app from "./app.js";

app.listen(cfg.PORT, () => {
  console.log(`Server listening on :${cfg.PORT} (${cfg.NODE_ENV})`);
});
