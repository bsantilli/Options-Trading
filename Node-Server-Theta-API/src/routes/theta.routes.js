import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { health, optionExpirations, optionsChain } from "../controllers/theta.controller.js";

const router = Router();

router.get("/health", health);
router.get("/api/theta/option-expirations", asyncHandler(optionExpirations));
router.get("/api/theta/options-chain",      asyncHandler(optionsChain));

export default router;
