import express from "express";
import { search } from "../controllers/search.controller";
import { validateRequest } from "../middleware/validateRequest";
import { searchSchema } from "../validations/search.validation";
import { searchRateLimiter } from "../middleware/rateLimiter";

const router = express.Router();

router.get("/", searchRateLimiter, validateRequest(searchSchema), search);

export default router;
