import { Request, Response } from "express";
import Joi from "joi";
import UsersSvc from "../services/users.service";

export default class UsersCtrl {
  // CREATE
  static async createUser(req: Request, res: Response) {
    const schema = Joi.object({
      email: Joi.string().email().required(),
      username: Joi.string().min(3).required(),
      password: Joi.string().min(6).required(),
      name: Joi.string().optional(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    try {
      const user = await UsersSvc.createUser(value);
      return res.status(201).json(user);
    } catch (err: any) {
      return res.status(400).json({ message: err.message });
    }
  }

  // READ ALL
  static async getAllUsers(req: Request, res: Response) {
    const roleTypeParam = req.query.roleType as string | undefined;
    const roleTypes = roleTypeParam
      ? roleTypeParam.split(",").map((r) => r.trim())
      : undefined;
    const users = await UsersSvc.getAllUsers(roleTypes);
    return res.json(users);
  }

  // READ FOXERS — public listing for landing page
  static async getFoxers(req: Request, res: Response) {
    try {
      const limit = Math.min(Number(req.query.limit) || 9, 30);
      const page = Math.max(Number(req.query.page) || 1, 1);
      const roleType = req.query.roleType as string | undefined;
      const specialization = req.query.specialization as string | undefined;
      const city = req.query.city as string | undefined;
      const result = await UsersSvc.getFoxers(
        limit,
        page,
        roleType,
        specialization,
        city,
      );
      return res.status(200).json({
        success: true,
        data: result.foxers,
        total: result.total,
        totalPages: result.totalPages,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // READ SINGLE FOXER (public profile with services)
  static async getFoxerById(req: Request, res: Response) {
    try {
      const foxer = await UsersSvc.getFoxerById(req.params.id);
      return res.status(200).json({ success: true, data: foxer });
    } catch (err: any) {
      return res.status(404).json({ success: false, message: err.message });
    }
  }

  // READ ONE
  static async getUserById(req: Request, res: Response) {
    try {
      const user = await UsersSvc.getUserById(req.params.id);
      return res.json(user);
    } catch (err: any) {
      return res.status(404).json({ message: err.message });
    }
  }

  // ✅ UPDATE (THIS IS THE IMPORTANT PART)
  static async updateUserById(req: Request, res: Response) {
    const schema = Joi.object({
      email: Joi.string().email().optional(),
      username: Joi.string().min(3).optional(),
      password: Joi.string().min(6).optional(),
      name: Joi.string().optional(),
      role: Joi.string().optional(),
    }).min(1); // must send at least one field

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    try {
      const updatedUser = await UsersSvc.updateUser(req.params.id, value);
      return res.json(updatedUser);
    } catch (err: any) {
      return res.status(400).json({ message: err.message });
    }
  }

  // BECOME HOST
  static async becomeHost(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId)
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized" });

      const user = (await UsersSvc.becomeHost(userId)) as any;
      return res.status(200).json({
        success: true,
        message: "You are now a host!",
        data: {
          id: user.id,
          email: user.email,
          username: user.username,
          name: user.name,
          role: user.systemRole,
          isHost: (user.roleType as string[]).includes("host"),
        },
      });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  // FOXER STATS
  static async getFoxerStats(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId)
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized" });

      const stats = await UsersSvc.getFoxerStats(userId);
      return res.status(200).json({ success: true, data: stats });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // DELETE
  static async deleteUserById(req: Request, res: Response) {
    await UsersSvc.deleteUser(req.params.id);
    return res.status(204).send();
  }
}
