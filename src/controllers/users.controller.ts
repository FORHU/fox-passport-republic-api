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
    const roleTypes = roleTypeParam ? roleTypeParam.split(',').map(r => r.trim()) : undefined;
    const users = await UsersSvc.getAllUsers(roleTypes);
    return res.json(users);
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

  // DELETE
  static async deleteUserById(req: Request, res: Response) {
    await UsersSvc.deleteUser(req.params.id);
    return res.status(204).send();
  }
}
