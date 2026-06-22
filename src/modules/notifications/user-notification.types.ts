export interface CreateNotificationInput {
    userId: string;
    type: string;
    title: string;
    message: string;
    metadata?: Record<string, unknown> | null;
}

export interface NotificationDTO {
    id: string;
    userId: string;
    type: string;
    title: string;
    message: string;
    metadata?: Record<string, unknown> | null;
    isRead: boolean;
    createdAt: Date;
}

