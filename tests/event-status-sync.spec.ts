import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * An Event's status follows its bookings (EventRequestSvc.syncStatusFromBookings).
 * It used to change only through an endpoint nothing called, so every Event
 * stayed `pending` and Organizers never got their completion XP.
 */

const repo = vi.hoisted(() => ({
  bookingStatuses: vi.fn(),
  advanceStatus: vi.fn(async () => true),
  findById: vi.fn(async () => ({ id: "e1", organizerId: "foxer" })),
}));
vi.mock("../src/modules/event-request/event-request.repository", () => ({
  default: repo,
}));

const organizerXp = vi.hoisted(() => ({ onEventCompleted: vi.fn() }));
vi.mock("../src/modules/appointment/organizer-xp.service", () => ({
  default: organizerXp,
}));

const passport = vi.hoisted(() => ({ awardXP: vi.fn(async () => undefined) }));
vi.mock("../src/modules/passport/passport.service", () => ({
  default: passport,
  XP_REWARDS: { completeEvent: 200 },
  UserPath: { eventFoxer: "eventFoxer" },
}));

import EventRequestSvc from "../src/modules/event-request/event-request.service";

const bookings = (...rows: [string, boolean?][]) =>
  repo.bookingStatuses.mockResolvedValue(
    rows.map(([status, checkedIn = false]) => ({ status, checkedIn })),
  );

const sync = () => EventRequestSvc.syncStatusFromBookings("e1");

beforeEach(() => {
  vi.clearAllMocks();
  repo.advanceStatus.mockResolvedValue(true);
});

describe("syncStatusFromBookings", () => {
  it("completes the Event once its booking is checked in and settled", async () => {
    bookings(["completed", true]);
    await sync();
    expect(repo.advanceStatus).toHaveBeenCalledWith(
      "e1",
      ["draft", "pending", "ongoing"],
      "completed",
    );
    expect(organizerXp.onEventCompleted).toHaveBeenCalledWith("e1");
    await vi.waitFor(() =>
      expect(passport.awardXP).toHaveBeenCalledWith("foxer", "eventFoxer", 200),
    );
  });

  it("completes when every booking is completed or cancelled", async () => {
    bookings(["completed", true], ["cancelled"]);
    await sync();
    expect(repo.advanceStatus).toHaveBeenCalledWith(
      "e1",
      expect.any(Array),
      "completed",
    );
  });

  it("cancels the Event when every booking is cancelled, with no XP", async () => {
    bookings(["cancelled"], ["cancelled"]);
    await sync();
    expect(repo.advanceStatus).toHaveBeenCalledWith(
      "e1",
      ["draft", "pending", "ongoing"],
      "cancelled",
    );
    expect(organizerXp.onEventCompleted).not.toHaveBeenCalled();
  });

  it("is ongoing while a checked-in booking sits beside an open one", async () => {
    bookings(["completed", true], ["active"]);
    await sync();
    expect(repo.advanceStatus).toHaveBeenCalledWith(
      "e1",
      ["draft", "pending"],
      "ongoing",
    );
  });

  it("leaves a booked, not-yet-held Event alone", async () => {
    bookings(["active"]);
    await sync();
    expect(repo.advanceStatus).not.toHaveBeenCalled();
  });

  it("pays no XP when the Event was already completed", async () => {
    bookings(["completed", true]);
    repo.advanceStatus.mockResolvedValue(false);
    await sync();
    expect(organizerXp.onEventCompleted).not.toHaveBeenCalled();
    expect(passport.awardXP).not.toHaveBeenCalled();
  });

  it("never throws, so it can't fail the booking change that called it", async () => {
    repo.bookingStatuses.mockRejectedValue(new Error("db down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(sync()).resolves.toBeUndefined();
    err.mockRestore();
  });
});
