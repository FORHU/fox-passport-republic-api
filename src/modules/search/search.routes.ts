import express from "express";
import SearchCtrl from "./search.controller";

const router = express.Router();

// Public aggregate discovery search
router.get("/", SearchCtrl.search);

export default router;
