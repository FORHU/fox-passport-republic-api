import express from "express";
import Joi from "joi";

const router = express.Router();

router.post("/subscribe", async (req, res) => {
  const schema = Joi.object({ email: Joi.string().email().required() });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ message: error.message });

  console.info(`[newsletter] new subscriber: ${value.email}`);
  return res.status(200).json({ message: "You're on the list!" });
});

export default router;
