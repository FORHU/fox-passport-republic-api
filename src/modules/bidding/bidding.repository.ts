import { prisma } from "../../utils/prisma";
import { BidStatus } from "@prisma/client";

export default class BiddingRepo {
  static async createServiceBid(data: {
    eventId: string;
    eventTemplateServiceId: string;
    providerId: string;
    proposedServiceId: string;
    message?: string;
    proposedPrice: number;
  }) {
    return prisma.eventServiceBid.create({
      data,
      include: {
        provider: true,
        proposedService: true,
      },
    });
  }

  static async updateServiceBidStatus(id: string, status: BidStatus) {
    return prisma.eventServiceBid.update({
      where: { id },
      data: { status },
    });
  }

  static async findServiceBidById(id: string) {
    return prisma.eventServiceBid.findUnique({
      where: { id },
      include: {
        provider: true,
        proposedService: true,
        event: true,
      },
    });
  }

  static async findServiceBidsByEventId(eventId: string) {
    return prisma.eventServiceBid.findMany({
      where: { eventId },
      include: {
        provider: {
          select: {
            id: true,
            name: true,
            imgId: true,
          }
        },
        proposedService: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  static async findServiceBidsByProviderId(providerId: string) {
    return prisma.eventServiceBid.findMany({
      where: { providerId },
      include: {
        event: {
          select: {
            id: true,
            name: true,
            startAt: true,
            endAt: true,
            eventStatus: true,
            targetCity: true,
          }
        },
        proposedService: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // --- Asset Bids ---

  static async createAssetBid(data: {
    eventId: string;
    eventTemplateAssetId: string;
    providerId: string;
    proposedAssetId: string;
    message?: string;
    proposedPrice: number;
  }) {
    return prisma.eventAssetBid.create({
      data,
      include: {
        provider: true,
        proposedAsset: true,
      },
    });
  }

  static async updateAssetBidStatus(id: string, status: BidStatus) {
    return prisma.eventAssetBid.update({
      where: { id },
      data: { status },
    });
  }

  static async findAssetBidById(id: string) {
    return prisma.eventAssetBid.findUnique({
      where: { id },
      include: {
        provider: true,
        proposedAsset: true,
        event: true,
      },
    });
  }

  static async findAssetBidsByEventId(eventId: string) {
    return prisma.eventAssetBid.findMany({
      where: { eventId },
      include: {
        provider: {
          select: {
            id: true,
            name: true,
            imgId: true,
          }
        },
        proposedAsset: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  static async findAssetBidsByProviderId(providerId: string) {
    return prisma.eventAssetBid.findMany({
      where: { providerId },
      include: {
        event: {
          select: {
            id: true,
            name: true,
            startAt: true,
            endAt: true,
            eventStatus: true,
            targetCity: true,
          }
        },
        proposedAsset: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }
}
