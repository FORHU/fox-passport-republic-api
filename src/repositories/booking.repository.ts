import { prisma } from "../utils/prisma";
import { Prisma } from "@prisma/client";

export default class BookingRepo {
    static async create(data: Prisma.BookingCreateInput) {
        return prisma.booking.create({
            data,
            include: {
                event: true,
                user: { select: { name: true, email: true } },
                attendees: true
            }
        });
    }

    static async findAll(filters: any) {
        return prisma.booking.findMany({
            where: filters,
            include: {
                event: true,
                user: { select: { name: true, email: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    static async findById(id: string) {
        return prisma.booking.findUnique({
            where: { id },
            include: {
                event: true,
                user: { select: { name: true, email: true } },
                attendees: true,
                payments: true,
                assetTransactions: true,
                serviceTransactions: true,
                venueTransactions: true
            }
        });
    }

    static async findByUserId(userId: string) {
        return prisma.booking.findMany({
            where: { userId },
            include: {
                event: true
            }
        });
    }
}
