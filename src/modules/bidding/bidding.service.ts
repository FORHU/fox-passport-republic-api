import BiddingRepo from "./bidding.repository";
import { prisma } from "../../utils/prisma";

export default class BiddingSvc {
  static async getServiceBidsForEvent(eventId: string) {
    return BiddingRepo.findServiceBidsByEventId(eventId);
  }

  static async getAssetBidsForEvent(eventId: string) {
    return BiddingRepo.findAssetBidsByEventId(eventId);
  }

  static async getOpenSlots(categoryId?: string) {
    // Basic implementation: find events that are pending or ongoing.
    const events = await prisma.event.findMany({
      where: {
        eventStatus: {
          in: ["pending", "ongoing"],
        }
      },
      include: {
        template: {
          include: {
            templateServices: true,
          }
        },
        host: {
          select: {
            id: true,
            name: true,
            imgId: true,
          }
        }
      },
      orderBy: { startAt: "asc" },
      take: 50,
    });
    
    return events;
  }

  // --- Service (Talent) Bids ---

  static async submitServiceBid(data: {
    eventId: string;
    eventTemplateServiceId: string;
    providerId: string;
    proposedServiceId: string;
    message?: string;
    proposedPrice: number;
  }) {
    // 0. Verify provider capability
    const provider = await prisma.user.findUnique({ where: { id: data.providerId } });
    if (!provider) throw new Error("Provider not found");
    if (!provider.roleType.includes("serviceFoxer")) {
      throw new Error("Unauthorized: you must have the Talent Foxer capability to submit a service bid");
    }

    // 1. Verify service belongs to provider
    const service = await prisma.service.findUnique({ where: { id: data.proposedServiceId } });
    if (!service) throw new Error("Service not found");
    if (service.ownerId !== data.providerId) throw new Error("Unauthorized: you do not own this service");

    // 2. Verify event is active and requirement exists
    const event = await prisma.event.findUnique({ where: { id: data.eventId } });
    if (!event) throw new Error("Event not found");
    if (["completed", "cancelled"].includes(event.eventStatus)) {
      throw new Error("Cannot bid on a completed or cancelled event");
    }

    const requirement = await prisma.eventTemplateService.findUnique({
      where: { id: data.eventTemplateServiceId }
    });
    if (!requirement) throw new Error("Event requirement not found");
    if (requirement.templateId !== event.templateId) {
      throw new Error("Requirement does not belong to this event's template");
    }

    // 3. Create Bid
    return BiddingRepo.createServiceBid(data);
  }

  static async acceptServiceBid(bidId: string, hostId: string) {
    return prisma.$transaction(async (tx) => {
      const bid = await tx.eventServiceBid.findUnique({
        where: { id: bidId },
        include: { event: true, proposedService: true }
      });
      if (!bid) throw new Error("Bid not found");

      if (bid.event.organizerId !== hostId) {
        throw new Error("Unauthorized: only the event host can accept bids");
      }
      if (bid.providerId === hostId) {
        throw new Error("Unauthorized: provider cannot accept their own bid");
      }

      if (bid.status !== "pending") {
        throw new Error("Bid is no longer pending");
      }

      // Verify Service is still active/available (basic check)
      if (bid.proposedService.ownerId !== bid.providerId) {
        throw new Error("Service is no longer owned by the provider");
      }
      if (bid.proposedService.status !== "available") {
        throw new Error("Service is no longer available");
      }

      // Verify requirement is not already fulfilled by another accepted bid
      const existingAccepted = await tx.eventServiceBid.findFirst({
        where: {
          eventTemplateServiceId: bid.eventTemplateServiceId,
          eventId: bid.eventId,
          status: "accepted"
        }
      });
      if (existingAccepted) {
        throw new Error("This requirement has already been fulfilled by another accepted bid");
      }

      // Accept this bid
      await tx.eventServiceBid.update({
        where: { id: bidId },
        data: { status: "accepted" }
      });

      // Reject all other pending bids for this same requirement
      await tx.eventServiceBid.updateMany({
        where: {
          eventTemplateServiceId: bid.eventTemplateServiceId,
          eventId: bid.eventId,
          status: "pending",
          id: { not: bidId }
        },
        data: { status: "rejected" }
      });

      // Automatically create EventServiceTransaction
      const transaction = await tx.eventServiceTransaction.create({
        data: {
          eventId: bid.eventId,
          serviceId: bid.proposedServiceId,
          providerId: bid.providerId,
          status: "pending", // Waiting for payment/checkout confirmation
          agreedPrice: bid.proposedPrice,
          currency: "PHP",
          included: false,
        }
      });

      return { bidId, transactionId: transaction.id };
    });
  }

  static async rejectServiceBid(bidId: string, hostId: string) {
    const bid = await BiddingRepo.findServiceBidById(bidId);
    if (!bid) throw new Error("Bid not found");

    if (bid.event.organizerId !== hostId) {
      throw new Error("Unauthorized: only the event host can reject bids");
    }
    if (bid.providerId === hostId) {
      throw new Error("Unauthorized: provider cannot reject their own bid");
    }

    if (bid.status !== "pending") {
      throw new Error("Bid is no longer pending");
    }

    return BiddingRepo.updateServiceBidStatus(bidId, "rejected");
  }


  // --- Asset (Gear) Bids ---

  static async submitAssetBid(data: {
    eventId: string;
    eventTemplateAssetId: string;
    providerId: string;
    proposedAssetId: string;
    message?: string;
    proposedPrice: number;
    proposedQuantity?: number;
  }) {
    // 0. Verify provider capability
    const provider = await prisma.user.findUnique({ where: { id: data.providerId } });
    if (!provider) throw new Error("Provider not found");
    if (!provider.roleType.includes("gearFoxer")) {
      throw new Error("Unauthorized: you must have the Gear Foxer capability to submit an asset bid");
    }

    // 1. Verify asset belongs to provider
    const asset = await prisma.asset.findUnique({ where: { id: data.proposedAssetId } });
    if (!asset) throw new Error("Asset not found");
    if (asset.ownerId !== data.providerId) throw new Error("Unauthorized: you do not own this gear/asset");

    // 2. Verify event is active and requirement exists
    const event = await prisma.event.findUnique({ where: { id: data.eventId } });
    if (!event) throw new Error("Event not found");
    if (["completed", "cancelled"].includes(event.eventStatus)) {
      throw new Error("Cannot bid on a completed or cancelled event");
    }

    const requirement = await prisma.eventTemplateAsset.findUnique({
      where: { id: data.eventTemplateAssetId }
    });
    if (!requirement) throw new Error("Event requirement not found");
    if (requirement.templateId !== event.templateId) {
      throw new Error("Requirement does not belong to this event's template");
    }

    // 3. Create Bid
    return BiddingRepo.createAssetBid(data);
  }

  static async acceptAssetBid(bidId: string, hostId: string) {
    return prisma.$transaction(async (tx) => {
      const bid = await tx.eventAssetBid.findUnique({
        where: { id: bidId },
        include: { event: true, proposedAsset: true, targetRequirement: true }
      });
      if (!bid) throw new Error("Bid not found");

      if (bid.event.organizerId !== hostId) {
        throw new Error("Unauthorized: only the event host can accept bids");
      }
      if (bid.providerId === hostId) {
        throw new Error("Unauthorized: provider cannot accept their own bid");
      }

      if (bid.status !== "pending") {
        throw new Error("Bid is no longer pending");
      }

      // Verify Asset is still active/available (basic check)
      if (bid.proposedAsset.ownerId !== bid.providerId) {
        throw new Error("Asset is no longer owned by the provider");
      }
      if (bid.proposedAsset.status !== "available") {
        throw new Error("Asset is no longer available");
      }
      if (bid.proposedQuantity < bid.targetRequirement.quantity) {
        throw new Error("Bid quantity does not fully satisfy the requirement");
      }

      // Verify requirement is not already fulfilled by another accepted bid
      const existingAccepted = await tx.eventAssetBid.findFirst({
        where: {
          eventTemplateAssetId: bid.eventTemplateAssetId,
          eventId: bid.eventId,
          status: "accepted"
        }
      });
      if (existingAccepted) {
        throw new Error("This requirement has already been fulfilled by another accepted bid");
      }

      // Accept this bid
      await tx.eventAssetBid.update({
        where: { id: bidId },
        data: { status: "accepted" }
      });

      // Reject all other pending bids for this same requirement
      await tx.eventAssetBid.updateMany({
        where: {
          eventTemplateAssetId: bid.eventTemplateAssetId,
          eventId: bid.eventId,
          status: "pending",
          id: { not: bidId }
        },
        data: { status: "rejected" }
      });

      // Automatically create EventAssetTransaction
      const transaction = await tx.eventAssetTransaction.create({
        data: {
          eventId: bid.eventId,
          assetId: bid.proposedAssetId,
          providerId: bid.providerId,
          status: "pending", // Waiting for payment/checkout confirmation
          agreedPrice: bid.proposedPrice,
          currency: "PHP",
          included: false,
        }
      });

      return { bidId, transactionId: transaction.id };
    });
  }

  static async rejectAssetBid(bidId: string, hostId: string) {
    const bid = await BiddingRepo.findAssetBidById(bidId);
    if (!bid) throw new Error("Bid not found");

    if (bid.event.organizerId !== hostId) {
      throw new Error("Unauthorized: only the event host can reject bids");
    }
    if (bid.providerId === hostId) {
      throw new Error("Unauthorized: provider cannot reject their own bid");
    }

    if (bid.status !== "pending") {
      throw new Error("Bid is no longer pending");
    }

    return BiddingRepo.updateAssetBidStatus(bidId, "rejected");
  }
}
