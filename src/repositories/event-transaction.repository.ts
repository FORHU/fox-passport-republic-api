import { prisma } from "../utils/prisma";
import { TransactionStatus } from "@prisma/client";

export default class EventTransactionRepo {
    // ASSET TRANSACTIONS
    static async createAssetTransaction(data: {
        eventId: string;
        assetId: string;
        providerId: string;
        quantity: number;
        agreedPrice: number;
    }) {
        return prisma.eventAssetTransaction.create({
            data,
            include: { asset: true, provider: true }
        });
    }

    static async findAssetTransactionById(id: string) {
        return prisma.eventAssetTransaction.findUnique({
            where: { id },
            include: { asset: true, provider: true, event: true }
        });
    }

    static async updateAssetTransaction(id: string, data: any) {
        return prisma.eventAssetTransaction.update({
            where: { id },
            data,
            include: { asset: true }
        });
    }

    // SERVICE TRANSACTIONS
    static async createServiceTransaction(data: {
        eventId: string;
        serviceId: string;
        providerId: string;
        agreedPrice: number;
    }) {
        return prisma.eventServiceTransaction.create({
            data,
            include: { service: true, provider: true }
        });
    }

    static async findServiceTransactionById(id: string) {
        return prisma.eventServiceTransaction.findUnique({
            where: { id },
            include: { service: true, provider: true, event: true }
        });
    }

    static async updateServiceTransaction(id: string, data: any) {
        return prisma.eventServiceTransaction.update({
            where: { id },
            data,
            include: { service: true }
        });
    }

    // VENUE TRANSACTIONS
    static async createVenueTransaction(data: {
        eventId: string;
        venueId: string;
        providerId: string;
        agreedPrice: number;
    }) {
        return prisma.eventVenueTransaction.create({
            data,
            include: { venue: true, provider: true }
        });
    }

    static async findVenueTransactionById(id: string) {
        return prisma.eventVenueTransaction.findUnique({
            where: { id },
            include: { venue: true, provider: true, event: true }
        });
    }

    static async updateVenueTransaction(id: string, data: any) {
        return prisma.eventVenueTransaction.update({
            where: { id },
            data,
            include: { venue: true }
        });
    }

    // SHARED
    static async findTransactionsByEventId(eventId: string) {
        const [assets, services, venues] = await Promise.all([
            prisma.eventAssetTransaction.findMany({ where: { eventId }, include: { asset: true } }),
            prisma.eventServiceTransaction.findMany({ where: { eventId }, include: { service: true } }),
            prisma.eventVenueTransaction.findMany({ where: { eventId }, include: { venue: true } }),
        ]);
        return { assets, services, venues };
    }
}