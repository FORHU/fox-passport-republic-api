import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `GET /event-requests/:id` used to hand any Event's full record - its
 * bookings and every supplier transaction with its price - to anyone
 * signed in, regardless of that Event. `getRequestById` is the door now.
 */

const access = vi.hoisted(() => ({
  canOnEvent: vi.fn(async () => false),
}));
vi.mock("../src/modules/appointment/appointment.access", () => ({
  default: access,
}));

const repo = vi.hoisted(() => ({
  findById: vi.fn(),
}));
vi.mock("../src/modules/event-request/event-request.repository", () => ({
  default: repo,
}));

import EventRequestSvc from "../src/modules/event-request/event-request.service";

const REQUEST = {
  id: "e1",
  clientId: "client",
  organizerId: "owner",
  bookings: [],
};

beforeEach(() => {
  vi.restoreAllMocks();
  access.canOnEvent.mockResolvedValue(false);
  repo.findById.mockResolvedValue(structuredClone(REQUEST));
});

const view = (userId?: string, systemRole?: string) =>
  EventRequestSvc.getRequestById("e1", userId ? { userId, systemRole } : undefined);

describe("EventRequestSvc.getRequestById", () => {
  it("refuses a signed-out caller", async () => {
    await expect(view()).rejects.toThrow("Request not found");
  });

  it("refuses a stranger with the same message as a missing request", async () => {
    await expect(view("stranger", "user")).rejects.toThrow("Request not found");
  });

  it("lets in the client who booked it", async () => {
    await expect(view("client", "user")).resolves.toMatchObject({ id: "e1" });
  });

  it("lets in the Event's Owner", async () => {
    await expect(view("owner", "user")).resolves.toMatchObject({ id: "e1" });
  });

  it("lets in an admin", async () => {
    await expect(view("someone", "admin")).resolves.toMatchObject({ id: "e1" });
  });

  it("lets in an Organizer with event:view-sales", async () => {
    access.canOnEvent.mockImplementation(
      async (eventId: string, userId: string, permission: string) =>
        eventId === "e1" && userId === "organizer" && permission === "event:view-sales",
    );
    await expect(view("organizer", "user")).resolves.toMatchObject({ id: "e1" });
  });

  it("throws the same message for a missing request", async () => {
    repo.findById.mockResolvedValue(null);
    await expect(view("client", "user")).rejects.toThrow("Request not found");
  });
});
