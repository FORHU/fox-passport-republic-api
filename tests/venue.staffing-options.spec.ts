import { describe, it, expect, vi } from "vitest";
import type { Request, Response } from "express";
import VenueController from "../src/modules/venue/venue.controller";
import { sanitizeVenueStaffing } from "../src/modules/venue/venue.service";

describe("Venue Staffing Options — Remove Event Coordinator (app#397)", () => {
  it("excludes Event Coordinator from GET /venues/catalog staff options", async () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const req = {} as Request;
    const res = { status, json } as unknown as Response;

    await VenueController.getCatalog(req, res);

    expect(status).toHaveBeenCalledWith(200);
    const payload = json.mock.calls[0]?.[0];
    expect(Array.isArray(payload?.staff)).toBe(true);
    expect(payload.staff).not.toContain("Event Coordinator");
    expect(
      payload.staff.some(
        (s: string) => s.toLowerCase() === "event coordinator",
      ),
    ).toBe(false);
    expect(payload.staff).toContain("Security Guard");
    expect(payload.staff).toContain("Concierge");
  });

  it("strips Event Coordinator (case-insensitive) from venue staffing arrays while preserving other staff", () => {
    expect(
      sanitizeVenueStaffing([
        "Security Guard",
        "Event Coordinator",
        "event coordinator",
        "  EVENT COORDINATOR ",
        "Concierge",
        "Sound Technician",
      ]),
    ).toEqual(["Security Guard", "Concierge", "Sound Technician"]);

    expect(sanitizeVenueStaffing(undefined)).toEqual([]);
  });
});
