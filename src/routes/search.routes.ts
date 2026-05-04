import express from "express";
import { search } from "../controllers/search.controller";
import { validateRequest } from "../middleware/validateRequest";
import { searchSchema } from "../validations/search.validation";

const router = express.Router();

router.get("/", validateRequest(searchSchema), search);

export default router;
