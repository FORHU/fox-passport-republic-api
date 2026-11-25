import { describe, it, expect } from "vitest";
import { declineReasonText } from "../src/modules/event-transaction/event-transaction.service";

// What the Event Foxer reads in "A Supplier declined your event" (api#476).
describe("declineReasonText", () => {
  it("words each reason", () => {
    expect(declineReasonText("venue", "already_booked")).toBe(
      "already booked that day",
    );
    expect(declineReasonText("venue", "not_suitable")).toBe(
      "the event doesn't suit them",
    );
    expect(declineReasonText("service", "other")).toBe("another reason");
  });

  it("says closed for a venue and not available for gear or a service", () => {
    expect(declineReasonText("venue", "closed")).toBe("closed that day");
    expect(declineReasonText("asset", "closed")).toBe("not available that day");
    expect(declineReasonText("service", "closed")).toBe(
      "not available that day",
    );
  });
});
