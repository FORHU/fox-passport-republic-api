import { describe, it, expect, vi, beforeEach } from "vitest";

// The identity review reads these; stand-ins keep it to the one behavior under
// test: which badge goes out, and that it can never fail the review.
const mocks = vi.hoisted(() => ({
  tx: {
    identityVerification: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    user: { update: vi.fn() },
  },
  awardBadgeByName: vi.fn(),
  sync: vi.fn(),
  notify: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("../src/utils/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(mocks.tx)),
  },
}));
vi.mock("../src/utils/cache-namespaces", () => ({
  userCache: { invalidateAll: mocks.invalidate },
}));
vi.mock("../src/modules/notifications/user-notification.service", () => ({
  default: { create: mocks.notify },
}));
vi.mock("../src/modules/onboarding/onboarding.service", () => ({
  default: { syncDetectedSteps: mocks.sync },
}));
vi.mock("../src/modules/passport/passport.service", async () => {
  const actual = await vi.importActual<
    typeof import("../src/modules/passport/passport.service")
  >("../src/modules/passport/passport.service");
  // Patch the class itself: awardFirstBookingBadge reaches awardBadgeByName
  // through it, so replacing only the exported object would not be seen.
  actual.default.awardBadgeByName = mocks.awardBadgeByName;
  return actual;
});

import IdentityVerificationSvc from "../src/modules/identity-verification/identity-verification.service";
import PassportSvc, {
  FIRST_BOOKING_BADGE,
  VERIFIED_BADGE,
} from "../src/modules/passport/passport.service";
import PassportRepo from "../src/modules/passport/passport.repository";

describe("the badge names", () => {
  it("are the ones the migration inserts", () => {
    expect(FIRST_BOOKING_BADGE).toBe("First Booking");
    expect(VERIFIED_BADGE).toBe("Verified");
  });
});

describe("PassportSvc.awardFirstBookingBadge", () => {
  const owner = vi.spyOn(PassportRepo, "findBookingOwnerId");

  beforeEach(() => {
    owner.mockReset();
    mocks.awardBadgeByName.mockReset();
    mocks.awardBadgeByName.mockResolvedValue(undefined);
  });

  it("gives the booking's owner the First Booking badge", async () => {
    owner.mockResolvedValue("user-1");
    await PassportSvc.awardFirstBookingBadge("b1");
    expect(owner).toHaveBeenCalledWith("b1");
    expect(mocks.awardBadgeByName).toHaveBeenCalledWith(
      "user-1",
      "First Booking",
    );
  });

  it("does nothing for a booking that is not there", async () => {
    owner.mockResolvedValue(null);
    await PassportSvc.awardFirstBookingBadge("missing");
    expect(mocks.awardBadgeByName).not.toHaveBeenCalled();
  });

  it("never throws, so it cannot undo a payment", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    owner.mockRejectedValue(new Error("db down"));
    await expect(
      PassportSvc.awardFirstBookingBadge("b1"),
    ).resolves.toBeUndefined();

    owner.mockResolvedValue("user-1");
    mocks.awardBadgeByName.mockRejectedValue(new Error("no badge row"));
    await expect(
      PassportSvc.awardFirstBookingBadge("b1"),
    ).resolves.toBeUndefined();
  });
});

describe("IdentityVerificationSvc.review and the Verified badge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tx.identityVerification.findUnique.mockResolvedValue({
      userId: "user-1",
    });
    mocks.tx.identityVerification.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.user.update.mockResolvedValue({});
    mocks.sync.mockResolvedValue(undefined);
    mocks.notify.mockResolvedValue(undefined);
    mocks.awardBadgeByName.mockResolvedValue(undefined);
  });

  it("an approval gives the Verified badge", async () => {
    await IdentityVerificationSvc.review("v1", "admin-1", "approved");
    expect(mocks.awardBadgeByName).toHaveBeenCalledWith("user-1", "Verified");
  });

  it("a rejection gives no badge", async () => {
    await IdentityVerificationSvc.review(
      "v1",
      "admin-1",
      "rejected",
      "Blurry photo",
    );
    expect(mocks.awardBadgeByName).not.toHaveBeenCalled();
  });

  it("a badge that fails to award does not fail the approval", async () => {
    mocks.awardBadgeByName.mockRejectedValue(new Error("no badge row"));
    await expect(
      IdentityVerificationSvc.review("v1", "admin-1", "approved"),
    ).resolves.toEqual({ userId: "user-1" });
    expect(mocks.notify).toHaveBeenCalledTimes(1);
  });

  it("a review that was already decided gives no badge", async () => {
    mocks.tx.identityVerification.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      IdentityVerificationSvc.review("v1", "admin-1", "approved"),
    ).rejects.toMatchObject({ status: 409 });
    expect(mocks.awardBadgeByName).not.toHaveBeenCalled();
  });
});
