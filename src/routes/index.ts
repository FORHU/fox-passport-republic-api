import express from "express";
import authRoute from "./auth.route";

const router = express.Router();

router.get("/v1", (_, res) => {
    res.json({
        message: "Welcome to my API",
    });
});

router.use("/v1/auth", authRoute);

export default router;