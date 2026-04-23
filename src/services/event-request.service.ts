import EventRequestRepo from "../repositories/event-request.repository";
import BookingSvc from "./booking.service";
import { RequestStatus } from "@prisma/client";
import { prisma } from "../utils/prisma";

export default class EventRequestSvc {
    static async createRequest(data: any) {
        return EventRequestRepo.createRequest({
            ...data,
            startAt: new Date(data.startAt),
            endAt: new Date(data.endAt),
        });
    }

    static async getRequests(userId: string, isHost: boolean = false) {
        if (isHost) {
            return EventRequestRepo.findOrganizerRequests(userId);
        }
        return EventRequestRepo.findUserRequests(userId);
    }

    static async getRequestById(id: string) {
        const request = await EventRequestRepo.findRequestById(id);
        if (!request) throw new Error("Request not found");
        return request;
    }

    static async reviewRequest(id: string, status: RequestStatus, organizerId: string) {
        const request = await EventRequestRepo.findRequestById(id);
        if (!request) throw new Error("Request not found");
        if (request.organizerId !== organizerId) throw new Error("Unauthorized");

        return prisma.$transaction(async (tx) => {
            // 1. Update status
            const updated = await tx.eventClientRequest.update({
                where: { id },
                data: { requestStatus: status },
            });

            // 2. If approved, create booking
            if (status === RequestStatus.approved) {
                await BookingSvc.createBooking({
                    eventId: request.id,
                    userId: request.clientId,
                    guestCount: request.guestCount,
                    totalAmount: request.totalAmount,
                    startAt: request.startAt,
                    endAt: request.endAt,
                    status: "pending",
                });
            }

            return updated;
        });
    }
}
