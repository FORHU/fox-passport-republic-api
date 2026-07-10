import { Request, Response } from "express";
import NotificationService from "./user-notification.service";

export default class NotificationController {
  static async getNotifications(req: Request, res: Response) {
    try {
      const limit = Math.min(Number(req.query.limit) || 20, 100);
      const { notifications, unreadCount } =
        await NotificationService.getForUser(req.user!.userId, limit);
      res.json({ success: true, notifications, unreadCount });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  static async markAsRead(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const notification = await NotificationService.markAsRead(
        id,
        req.user!.userId,
      );
      res.json({ success: true, data: notification });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  static async markAllAsRead(req: Request, res: Response) {
    try {
      await NotificationService.markAllAsRead(req.user!.userId);
      res.json({ success: true, message: "All notifications marked as read" });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }
}
