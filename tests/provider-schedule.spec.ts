import { describe, expect, it } from "vitest";
import {
  findScheduleConflict,
  providerBlockedDays,
  sameCity,
  type ProviderEngagement,
} from "../src/modules/availability/provider-schedule";

// Pure functions — no database. The provider is booked the evening of
// 10 Nov in Makati.
const d = (iso: string) => new Date(iso);
const makatiGig: ProviderEngagement = {
  start: d("2026-11-10T18:00:00Z"),
  end: d("2026-11-10T23:00:00Z"),
  eventId: null,
  place: { text: "12 Ayala Ave, Makati, Metro Manila" },
};
const on = (day: string) => ({
  start: d(`${day}T10:00:00Z`),
  end: d(`${day}T12:00:00Z`),
});

describe("sameCity", () => {
  it("matches a structured city against a free-text address", () => {
    expect(sameCity({ city: "Makati City" }, makatiGig.place)).toBe(true);
  });

  it("does not treat a shared region as the same city", () => {
    expect(
      sameCity({ text: "BGC, Taguig, Metro Manila" }, makatiGig.place),
    ).toBe(false);
  });

  it("treats an unknown place as a different city", () => {
    expect(sameCity({}, makatiGig.place)).toBe(false);
  });
});

describe("findScheduleConflict", () => {
  it("blocks the same day wherever it is", () => {
    expect(
      findScheduleConflict(on("2026-11-10"), { text: "Makati" }, [makatiGig]),
    ).toBe("booked");
  });

  it("blocks the next day in another city — a travel day", () => {
    expect(
      findScheduleConflict(on("2026-11-11"), { text: "Cebu City, Cebu" }, [
        makatiGig,
      ]),
    ).toBe("travel");
  });

  it("allows the next day in the same city", () => {
    expect(
      findScheduleConflict(
        on("2026-11-11"),
        { text: "Rockwell, Makati, Metro Manila" },
        [makatiGig],
      ),
    ).toBeNull();
  });

  it("allows two days later anywhere", () => {
    expect(
      findScheduleConflict(on("2026-11-12"), { text: "Cebu" }, [makatiGig]),
    ).toBeNull();
  });
});

describe("providerBlockedDays", () => {
  it("blocks every travel day while the event location is unknown", () => {
    expect(providerBlockedDays([makatiGig], null)).toEqual({
      booked: ["2026-11-10"],
      travel: ["2026-11-09", "2026-11-11"],
    });
  });

  it("drops travel days for an event in the same city", () => {
    expect(
      providerBlockedDays([makatiGig], {
        text: "Poblacion, Makati, Metro Manila",
      }).travel,
    ).toEqual([]);
  });
});
