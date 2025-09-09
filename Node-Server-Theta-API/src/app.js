import express from "express";
import router from "./routes/theta.routes.js";
import applySecurity from "./middleware/security.js";
import { notFound, errorHandler } from "./middleware/errors.js";

const app = express();
applySecurity(app);
app.use(express.json());
app.use(router);
app.use(notFound);
app.use(errorHandler);

export default app;
