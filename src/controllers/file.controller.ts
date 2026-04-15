import { Request, Response } from "express";
import Joi from "joi";
import FileSvc from "../services/file.service";

export default class FileCtrl {
  static async createFile(req: Request, res: Response) {
    const schema = Joi.object({
      url: Joi.string().uri().required(),
      name: Joi.string().min(1).required(),
      type: Joi.string().min(1).required(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.message });
    }

    try {
      const file = await FileSvc.createFile(value);
      return res.status(201).json({ message: "File created successfully", file });
    } catch (err: any) {
      return res.status(400).json({ message: err?.message || "Failed to create file" });
    }
  }
}
