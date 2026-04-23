import { prisma } from "../utils/prisma";
import { RequestStatus } from "@prisma/client";

export default class EventRequestRepo {
    static async createRequest(data: {
        clientId: string;
        organizerId: string;
        templateId: string;
        name: string;
        description: string;
        startAt: Date;
        endAt: Date;
        guestCount: number;
        totalAmount: number;
    }) {
        return prisma.eventClientRequest.create({
            data,
            include: {
                template: true,
                client: { select: { id: true, name: true, email: true } },
                host: { select: { id: true, name: true, email: true } },
            },
        });
    }

    static async findRequestById(id: string) {
        return prisma.eventClientRequest.findUnique({
            where: { id },
            include: {
                template: true,
                client: { select: { id: true, name: true, email: true } },
                host: { select: { id: true, name: true, email: true } },
            },
        });
    }

    static async findUserRequests(clientId: string) {
        return prisma.eventClientRequest.findMany({
            where: { clientId },
            include: { template: true },
            orderBy: { createdAt: "desc" },
        });
    }

    static async findOrganizerRequests(organizerId: string) {
        return prisma.eventClientRequest.findMany({
            where: { organizerId },
            include: {
                template: true,
                client: { select: { id: true, name: true, email: true } },
            },
            orderBy: { createdAt: "desc" },
        });
    }

    static async updateStatus(id: string, status: RequestStatus) {
        return prisma.eventClientRequest.update({
            where: { id },
            data: { requestStatus: status },
        });
    }
}
