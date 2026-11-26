import { describe, it, expect } from "vitest";
import { checkContactNumber } from "../src/modules/role-request/role-request.controller";

/**
 * The Venue Foxer contact number had no check at all. It now follows the
 * profile phone's rule (utils/phone): a valid number in one of the project's
 * countries, stored as E.164 — and in the Philippines a mobile number
 * (api#492). The web form sends E.164; the mobile app sends what was typed,
 * read in the application's tinCountry (else Philippine) when it has no +code.
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

  const PH_MOBILE =
    "Enter a valid Philippine mobile number, like +63 917 123 4567.";
  const ANY_COUNTRY =
    "Enter a valid contact number with its country code, like +63 917 123 4567.";

  it.each(["12345", "+63 12", "call me", "<b>09171234567</b>"])(
    "refuses %j",
    (input) => {
      expect(checkContactNumber({ contactNumber: input })).toBe(PH_MOBILE);
    },
  );

  // api#492: a Philippine contact number must be a mobile number.
  it.each(["+63 2 8123 4567", "(02) 8123 4567", "+63 32 234 5678"])(
    "refuses the Philippine landline %j",
    (input) => {
      const data: Record<string, unknown> = { contactNumber: input };
      expect(checkContactNumber(data)).toBe(PH_MOBILE);
      expect(data.contactNumber).toBe(input);
    },
  );

  it.each(["9171234567", "09171234567", "+63 917 123 4567", "+6309171234567"])(
    "stores the Philippine mobile %j as +639171234567",
    (input) => {
      const data: Record<string, unknown> = {
        contactNumber: input,
        tinCountry: "PH",
      };
      expect(checkContactNumber(data)).toBeNull();
      expect(data.contactNumber).toBe("+639171234567");
    },
  );

  it("reads a number with no +code in the application's country", () => {
    const data: Record<string, unknown> = {
      contactNumber: "415 555 0132",
      tinCountry: "US",
    };
    expect(checkContactNumber(data)).toBeNull();
    expect(data.contactNumber).toBe("+14155550132");
  });

  it("keeps the general message outside the Philippines", () => {
    expect(
      checkContactNumber({ contactNumber: "555 01", tinCountry: "US" }),
    ).toBe(ANY_COUNTRY);
  });

  it.each([undefined, "", "   ", 9171234567])("requires a number (%j)", (v) => {
    expect(checkContactNumber({ contactNumber: v })).toBe(
      "Contact number is required",
    );
  });
});
