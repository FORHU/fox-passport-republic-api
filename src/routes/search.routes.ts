import express from "express";
import SearchCtrl from "../controllers/search.controller";

const router = express.Router();

// Public aggregate discovery search
router.get("/", SearchCtrl.search);

export default router;
