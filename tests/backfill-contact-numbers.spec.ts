import { describe, it, expect } from "vitest";
import { planRow } from "../tools/backfill-contact-numbers";

describe("backfill-contact-numbers: planRow", () => {
  it.each(["09171234567", "9171234567", "0917 123 4567", "+63 917 123 4567"])(
    "normalizes the Philippine number %j",
    (value) => {
      expect(planRow({ id: "r", value })).toEqual({
        kind: "normalize",
        to: "+639171234567",
      });
    },
  );

  it("reads a number without its +code in the row's country", () => {
    expect(planRow({ id: "r", value: "415 555 0132", country: "US" })).toEqual({
      kind: "normalize",
      to: "+14155550132",
    });
  });

  it("keeps an old Philippine landline, normalized", () => {
    expect(planRow({ id: "r", value: "(02) 8123 4567" })).toEqual({
      kind: "normalize",
      to: "+63281234567",
    });
  });

  it.each([null, "", "  ", "+639171234567"])("leaves %j unchanged", (value) => {
    expect(planRow({ id: "r", value })).toEqual({ kind: "unchanged" });
  });

  it.each(["12345", "call me"])("sends %j to manual review", (value) => {
    expect(planRow({ id: "r", value })).toEqual({
      kind: "review",
      reason: "not a valid phone number",
    });
  });
});
