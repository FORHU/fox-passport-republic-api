import { describe, it, expect } from "vitest";
import { checkContactNumber } from "../src/modules/role-request/role-request.controller";

/**
 * The Venue Foxer contact number had no check at all. It now follows the
 * profile phone's rule (utils/phone): a valid number in one of the project's
 * countries, stored as E.164. The web form sends E.164; the mobile app sends
 * what was typed, read as Philippine when it has no +code.
 */
describe("checkContactNumber", () => {
  it.each([
    ["+639171234567", "+639171234567"],
    ["+1 415 555 0132", "+14155550132"],
    ["+44 20 7946 0958", "+442079460958"],
    ["0917 123 4567", "+639171234567"],
    ["917-123-4567", "+639171234567"],
  ])("stores %j as %j", (input, stored) => {
    const data: Record<string, unknown> = { contactNumber: input };
    expect(checkContactNumber(data)).toBeNull();
    expect(data.contactNumber).toBe(stored);
  });

  it.each(["12345", "+63 12", "call me", "<b>09171234567</b>"])(
    "refuses %j",
    (input) => {
      expect(checkContactNumber({ contactNumber: input })).toBe(
        "Enter a valid contact number with its country code, like +63 917 123 4567.",
      );
    },
  );

  it.each([undefined, "", "   ", 9171234567])("requires a number (%j)", (v) => {
    expect(checkContactNumber({ contactNumber: v })).toBe(
      "Contact number is required",
    );
  });
});
