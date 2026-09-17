import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../src/utils/prisma", () => ({
  prisma: {
    venue: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    venueEventFoxerAffiliation: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

// venue-affiliation.service.ts notifies both parties on every state change —
// stub that out so these stay unit tests against the mocked prisma above,
// not integration tests hitting NotificationRepository's real DB client.
vi.mock("../src/modules/notifications/user-notification.service", () => ({
  default: { create: vi.fn().mockResolvedValue({}) },
}));

import VenueAffiliationSvc from "../src/modules/venue-affiliation/venue-affiliation.service";
import { prisma } from "../src/utils/prisma";

describe("VenueAffiliationSvc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("apply", () => {
    it("rejects applying to a venue you already own", async () => {
      (prisma.venue.findUnique as any).mockResolvedValue({
        id: "v1",
        mayorId: "mayor1",
      });

      await expect(VenueAffiliationSvc.apply("v1", "mayor1")).rejects.toThrow(
        "You already own this venue",
      );
    });

    it("creates a pending application initiated by the event foxer", async () => {
      (prisma.venue.findUnique as any).mockResolvedValue({
        id: "v1",
        mayorId: "mayor1",
      });
      (prisma.venueEventFoxerAffiliation.findUnique as any).mockResolvedValue(
        null,
      );
      (prisma.venueEventFoxerAffiliation.create as any).mockResolvedValue({
        id: "aff1",
        status: "pending",
        initiatedBy: "eventFoxer",
        eventFoxer: { id: "organizer1", name: "Organizer One" },
      });

      const result = await VenueAffiliationSvc.apply("v1", "organizer1");

      expect(prisma.venueEventFoxerAffiliation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            venueId: "v1",
            eventFoxerId: "organizer1",
            initiatedBy: "eventFoxer",
            // Always the fixed Phase A allow-list — never client input, and
            // never a partial/custom subset (see permissions.ts's doc
            // comment on VENUE_AFFILIATION_PERMISSIONS).
            permissions: ["template:attach", "calendar:block"],
          },
        }),
      );
      expect(result.status).toBe("pending");
    });

    it("rejects a second application while one is already pending", async () => {
      (prisma.venue.findUnique as any).mockResolvedValue({
        id: "v1",
        mayorId: "mayor1",
      });
      (prisma.venueEventFoxerAffiliation.findUnique as any).mockResolvedValue({
        id: "aff1",
        status: "pending",
      });

      await expect(
        VenueAffiliationSvc.apply("v1", "organizer1"),
      ).rejects.toThrow("already pending");
    });

    it("rejects re-applying once already approved", async () => {
      (prisma.venue.findUnique as any).mockResolvedValue({
        id: "v1",
        mayorId: "mayor1",
      });
      (prisma.venueEventFoxerAffiliation.findUnique as any).mockResolvedValue({
        id: "aff1",
        status: "approved",
      });

      await expect(
        VenueAffiliationSvc.apply("v1", "organizer1"),
      ).rejects.toThrow("already affiliated");
    });

    it("reopens (not duplicates) a previously rejected application", async () => {
      (prisma.venue.findUnique as any).mockResolvedValue({
        id: "v1",
        mayorId: "mayor1",
      });
      (prisma.venueEventFoxerAffiliation.findUnique as any).mockResolvedValue({
        id: "aff1",
        status: "rejected",
      });
      (prisma.venueEventFoxerAffiliation.update as any).mockResolvedValue({
        id: "aff1",
        status: "pending",
        eventFoxer: { id: "organizer1", name: "Organizer One" },
      });

      const result = await VenueAffiliationSvc.apply("v1", "organizer1");

      expect(prisma.venueEventFoxerAffiliation.create).not.toHaveBeenCalled();
      expect(prisma.venueEventFoxerAffiliation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "aff1" },
          data: expect.objectContaining({
            status: "pending",
            initiatedBy: "eventFoxer",
            reviewedById: null,
            rejectionReason: null,
          }),
        }),
      );
      expect(result.status).toBe("pending");
    });
  });

  describe("invite", () => {
    it("rejects an invite from someone who doesn't own the venue", async () => {
      (prisma.venue.findUnique as any).mockResolvedValue({
        id: "v1",
        mayorId: "mayor1",
      });

      await expect(
        VenueAffiliationSvc.invite("v1", "organizer1", "not-the-mayor"),
      ).rejects.toThrow("Unauthorized: you do not own this venue");
    });

    it("rejects inviting a user without the eventFoxer capability", async () => {
      (prisma.venue.findUnique as any).mockResolvedValue({
        id: "v1",
        mayorId: "mayor1",
      });
      (prisma.user.findUnique as any).mockResolvedValue({
        id: "notorganizer",
        roleType: ["serviceFoxer"],
      });

      await expect(
        VenueAffiliationSvc.invite("v1", "notorganizer", "mayor1"),
      ).rejects.toThrow("does not hold the Event Foxer capability");
    });

    it("creates a pending invite initiated by the venue foxer", async () => {
      (prisma.venue.findUnique as any).mockResolvedValue({
        id: "v1",
        mayorId: "mayor1",
      });
      (prisma.user.findUnique as any).mockResolvedValue({
        id: "organizer1",
        roleType: ["eventFoxer"],
      });
      (prisma.venueEventFoxerAffiliation.findUnique as any).mockResolvedValue(
        null,
      );
      (prisma.venueEventFoxerAffiliation.create as any).mockResolvedValue({
        id: "aff1",
        status: "pending",
        initiatedBy: "venueFoxer",
      });

      await VenueAffiliationSvc.invite("v1", "organizer1", "mayor1");

      expect(prisma.venueEventFoxerAffiliation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            venueId: "v1",
            eventFoxerId: "organizer1",
            initiatedBy: "venueFoxer",
            permissions: ["template:attach", "calendar:block"],
          },
        }),
      );
    });
  });

  describe("approve / reject", () => {
    const applicationRow = {
      id: "aff1",
      status: "pending",
      initiatedBy: "eventFoxer",
      venue: { id: "v1", mayorId: "mayor1" },
      eventFoxerId: "organizer1",
    };
    const inviteRow = {
      id: "aff2",
      status: "pending",
      initiatedBy: "venueFoxer",
      venue: { id: "v1", mayorId: "mayor1" },
      eventFoxerId: "organizer1",
      eventFoxer: { id: "organizer1", name: "Organizer One" },
    };

    it("lets the venue mayor approve an application", async () => {
      (prisma.venueEventFoxerAffiliation.findUnique as any).mockResolvedValue(
        applicationRow,
      );
      (prisma.venueEventFoxerAffiliation.update as any).mockResolvedValue({
        ...applicationRow,
        status: "approved",
      });

      const result = await VenueAffiliationSvc.approve("aff1", "mayor1");
      expect(result.status).toBe("approved");
    });

    it("refuses the invited event foxer approving their own application (only the mayor may)", async () => {
      (prisma.venueEventFoxerAffiliation.findUnique as any).mockResolvedValue(
        applicationRow,
      );

      await expect(
        VenueAffiliationSvc.approve("aff1", "organizer1"),
      ).rejects.toThrow("only the venue owner can decide");
    });

    it("lets the invited event foxer approve an invite", async () => {
      (prisma.venueEventFoxerAffiliation.findUnique as any).mockResolvedValue(
        inviteRow,
      );
      (prisma.venueEventFoxerAffiliation.update as any).mockResolvedValue({
        ...inviteRow,
        status: "approved",
      });

      const result = await VenueAffiliationSvc.approve("aff2", "organizer1");
      expect(result.status).toBe("approved");
    });

    it("refuses the inviting mayor approving their own invite (only the invitee may)", async () => {
      (prisma.venueEventFoxerAffiliation.findUnique as any).mockResolvedValue(
        inviteRow,
      );

      await expect(
        VenueAffiliationSvc.approve("aff2", "mayor1"),
      ).rejects.toThrow("only the invited Event Foxer can decide");
    });

    it("refuses a stranger approving or rejecting either direction", async () => {
      (prisma.venueEventFoxerAffiliation.findUnique as any).mockResolvedValue(
        applicationRow,
      );
      await expect(
        VenueAffiliationSvc.approve("aff1", "stranger"),
      ).rejects.toThrow("Unauthorized");

      (prisma.venueEventFoxerAffiliation.findUnique as any).mockResolvedValue(
        inviteRow,
      );
      await expect(
        VenueAffiliationSvc.reject("aff2", "stranger"),
      ).rejects.toThrow("Unauthorized");
    });

    it("refuses to decide an affiliation that isn't pending", async () => {
      (prisma.venueEventFoxerAffiliation.findUnique as any).mockResolvedValue({
        ...applicationRow,
        status: "approved",
      });

      await expect(
        VenueAffiliationSvc.approve("aff1", "mayor1"),
      ).rejects.toThrow("not pending");
    });
  });

  // cancel = withdraw a still-pending affiliation (either party).
  // revoke = end an already-approved one (venue owner only).
  // Full actor x status matrix for both operations.
  describe("cancel (pending only, either party)", () => {
    const pendingRow = {
      id: "aff1",
      status: "pending",
      venue: { id: "v1", mayorId: "mayor1" },
      eventFoxerId: "organizer1",
    };

    it("lets the applicant (event foxer) cancel their own pending application", async () => {
      (prisma.venueEventFoxerAffiliation.findUnique as any).mockResolvedValue(pendingRow);
      (prisma.venueEventFoxerAffiliation.update as any).mockResolvedValue({
        ...pendingRow,
        status: "revoked",
      });

      const result = await VenueAffiliationSvc.cancel("aff1", "organizer1");
      expect(result.status).toBe("revoked");
    });

    it("lets the inviter (venue mayor) cancel a pending invite/application", async () => {
      (prisma.venueEventFoxerAffiliation.findUnique as any).mockResolvedValue(pendingRow);
      (prisma.venueEventFoxerAffiliation.update as any).mockResolvedValue({
        ...pendingRow,
        status: "revoked",
      });

      const result = await VenueAffiliationSvc.cancel("aff1", "mayor1");
      expect(result.status).toBe("revoked");
    });

    it("refuses a stranger (neither party) cancelling a pending affiliation", async () => {
      (prisma.venueEventFoxerAffiliation.findUnique as any).mockResolvedValue(pendingRow);

      await expect(
        VenueAffiliationSvc.cancel("aff1", "stranger"),
      ).rejects.toThrow("Unauthorized: you are not part of this affiliation");
    });

    it("refuses to cancel an approved affiliation — must use revoke instead", async () => {
      (prisma.venueEventFoxerAffiliation.findUnique as any).mockResolvedValue({
        ...pendingRow,
        status: "approved",
      });

      await expect(
        VenueAffiliationSvc.cancel("aff1", "mayor1"),
      ).rejects.toThrow("Only a pending affiliation can be cancelled");
      await expect(
        VenueAffiliationSvc.cancel("aff1", "organizer1"),
      ).rejects.toThrow("Only a pending affiliation can be cancelled");
    });

    it("refuses to cancel a rejected affiliation — it's already terminal, no operation needed", async () => {
      (prisma.venueEventFoxerAffiliation.findUnique as any).mockResolvedValue({
        ...pendingRow,
        status: "rejected",
      });

      await expect(
        VenueAffiliationSvc.cancel("aff1", "mayor1"),
      ).rejects.toThrow("Only a pending affiliation can be cancelled");
    });

    it("refuses to cancel an already-revoked affiliation", async () => {
      (prisma.venueEventFoxerAffiliation.findUnique as any).mockResolvedValue({
        ...pendingRow,
        status: "revoked",
      });

      await expect(
        VenueAffiliationSvc.cancel("aff1", "organizer1"),
      ).rejects.toThrow("Only a pending affiliation can be cancelled");
    });
  });

  describe("revoke (approved only, venue owner only)", () => {
    const approvedRow = {
      id: "aff1",
      status: "approved",
      venue: { id: "v1", mayorId: "mayor1" },
      eventFoxerId: "organizer1",
    };

    it("lets the venue owner revoke an approved affiliation", async () => {
      (prisma.venueEventFoxerAffiliation.findUnique as any).mockResolvedValue(approvedRow);
      (prisma.venueEventFoxerAffiliation.update as any).mockResolvedValue({
        ...approvedRow,
        status: "revoked",
      });

      const result = await VenueAffiliationSvc.revoke("aff1", "mayor1");
      expect(result.status).toBe("revoked");
    });

    it("refuses the affiliated event foxer revoking their own approved affiliation", async () => {
      (prisma.venueEventFoxerAffiliation.findUnique as any).mockResolvedValue(approvedRow);

      await expect(
        VenueAffiliationSvc.revoke("aff1", "organizer1"),
      ).rejects.toThrow(
        "Unauthorized: only the venue owner can revoke an approved affiliation",
      );
    });

    it("refuses a stranger revoking someone else's approved affiliation", async () => {
      (prisma.venueEventFoxerAffiliation.findUnique as any).mockResolvedValue(approvedRow);

      await expect(
        VenueAffiliationSvc.revoke("aff1", "stranger"),
      ).rejects.toThrow(
        "Unauthorized: only the venue owner can revoke an approved affiliation",
      );
    });

    it("refuses to revoke a pending affiliation — must use cancel instead", async () => {
      (prisma.venueEventFoxerAffiliation.findUnique as any).mockResolvedValue({
        ...approvedRow,
        status: "pending",
      });

      await expect(
        VenueAffiliationSvc.revoke("aff1", "mayor1"),
      ).rejects.toThrow("Only an approved affiliation can be revoked");
    });

    it("refuses to revoke a rejected affiliation — no revoke operation needed for a rejected row", async () => {
      (prisma.venueEventFoxerAffiliation.findUnique as any).mockResolvedValue({
        ...approvedRow,
        status: "rejected",
      });

      await expect(
        VenueAffiliationSvc.revoke("aff1", "mayor1"),
      ).rejects.toThrow("Only an approved affiliation can be revoked");
    });

    it("refuses to revoke an already-revoked affiliation", async () => {
      (prisma.venueEventFoxerAffiliation.findUnique as any).mockResolvedValue({
        ...approvedRow,
        status: "revoked",
      });

      await expect(
        VenueAffiliationSvc.revoke("aff1", "mayor1"),
      ).rejects.toThrow("Only an approved affiliation can be revoked");
    });
  });

  describe("a revoked affiliation cannot regain access without a new application/invitation", () => {
    it("getApprovedAffiliationWithPermission returns null for a revoked row, even with a matching permission", async () => {
      (prisma.venueEventFoxerAffiliation.findUnique as any).mockResolvedValue({
        status: "revoked",
        permissions: ["template:attach", "calendar:block"],
      });

      const result = await VenueAffiliationSvc.getApprovedAffiliationWithPermission(
        "v1",
        "organizer1",
        "template:attach",
      );
      expect(result).toBeNull();
    });

    it("re-applying to a revoked affiliation reopens it to pending, never directly to approved", async () => {
      (prisma.venue.findUnique as any).mockResolvedValue({ id: "v1", mayorId: "mayor1" });
      (prisma.venueEventFoxerAffiliation.findUnique as any).mockResolvedValue({
        id: "aff1",
        status: "revoked",
      });
      (prisma.venueEventFoxerAffiliation.update as any).mockResolvedValue({
        id: "aff1",
        status: "pending",
        initiatedBy: "eventFoxer",
        eventFoxer: { id: "organizer1", name: "Organizer One" },
      });

      const result = await VenueAffiliationSvc.apply("v1", "organizer1");
      expect(result.status).toBe("pending");
      expect(prisma.venueEventFoxerAffiliation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "aff1" },
          data: expect.objectContaining({ status: "pending" }),
        }),
      );
    });

    it("re-inviting to a revoked affiliation reopens it to pending, never directly to approved", async () => {
      (prisma.venue.findUnique as any).mockResolvedValue({ id: "v1", mayorId: "mayor1" });
      (prisma.user.findUnique as any).mockResolvedValue({
        id: "organizer1",
        roleType: ["eventFoxer"],
      });
      (prisma.venueEventFoxerAffiliation.findUnique as any).mockResolvedValue({
        id: "aff1",
        status: "revoked",
      });
      (prisma.venueEventFoxerAffiliation.update as any).mockResolvedValue({
        id: "aff1",
        status: "pending",
        initiatedBy: "venueFoxer",
      });

      const result = await VenueAffiliationSvc.invite("v1", "organizer1", "mayor1");
      expect(result.status).toBe("pending");
    });
  });

  describe("getApprovedAffiliationWithPermission", () => {
    it("returns null when there is no affiliation", async () => {
      (prisma.venueEventFoxerAffiliation.findUnique as any).mockResolvedValue(
        null,
      );
      const result = await VenueAffiliationSvc.getApprovedAffiliationWithPermission(
        "v1",
        "organizer1",
        "template:attach",
      );
      expect(result).toBeNull();
    });

    it("returns null when the affiliation is not approved", async () => {
      (prisma.venueEventFoxerAffiliation.findUnique as any).mockResolvedValue({
        status: "pending",
        permissions: ["template:attach"],
      });
      const result = await VenueAffiliationSvc.getApprovedAffiliationWithPermission(
        "v1",
        "organizer1",
        "template:attach",
      );
      expect(result).toBeNull();
    });

    it("returns null when approved but lacking the specific permission", async () => {
      (prisma.venueEventFoxerAffiliation.findUnique as any).mockResolvedValue({
        status: "approved",
        permissions: ["calendar:block"],
      });
      const result = await VenueAffiliationSvc.getApprovedAffiliationWithPermission(
        "v1",
        "organizer1",
        "template:attach",
      );
      expect(result).toBeNull();
    });

    it("returns the affiliation when approved and holding the permission", async () => {
      const row = { status: "approved", permissions: ["template:attach"] };
      (prisma.venueEventFoxerAffiliation.findUnique as any).mockResolvedValue(
        row,
      );
      const result = await VenueAffiliationSvc.getApprovedAffiliationWithPermission(
        "v1",
        "organizer1",
        "template:attach",
      );
      expect(result).toBe(row);
    });
  });
});
