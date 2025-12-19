import { Request, Response } from "express";
import Joi from "joi";
import UsersSvc from "../services/users.service";

export default class UsersCtrl {
  // Create a new user
  static async createUser(req: Request, res: Response) {
    const schema = Joi.object({
      email: Joi.string().email().required(),
      username: Joi.string().min(3).required(),
      password: Joi.string().min(6).required(),
      name: Joi.string().optional(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    try {
      const newUser = await UsersSvc.createUser(value);
      return res.status(201).json(newUser);
    } catch (err: any) {
      return res.status(400).json({ message: err.message });
    }
  }

  // Get all users
  static async getAllUsers(req: Request, res: Response) {
    try {
      const users = await UsersSvc.getAllUsers();
      return res.json(users);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  // Get a single user by ID
  static async getUserById(req: Request, res: Response) {
    try {
      const user = await UsersSvc.getUserById(req.params.id);
      return res.json(user);
    } catch (err: any) {
      return res.status(404).json({ message: err.message });
    }
  }

  // Update a user
  static async updateUserById(req: Request, res: Response) {
    try {
      const updatedUser = await UsersSvc.updateUser(req.params.id, req.body);
      return res.json(updatedUser);
    } catch (err: any) {
      return res.status(400).json({ message: err.message });
    }
  }

  // Delete a user
  static async deleteUserById(req: Request, res: Response) {
    try {
      await UsersSvc.deleteUser(req.params.id);
      return res.status(204).send();
    } catch (err: any) {
      return res.status(400).json({ message: err.message });
    }
  }
}
