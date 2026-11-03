import { describe, expect, it } from "vitest";
import { normalizeUsername, usernameJoi } from "../src/utils/username";

const invalid = [
  ["a space", "bad name"],
  ["an emoji", "fox😀"],
  ["symbols", "a@b!"],
  ["two characters", "ab"],
  ["100 characters", "a".repeat(100)],
  ["empty", ""],
];

describe("username rules", () => {
  it.each(invalid)("rejects %s", (_label, value) => {
    expect(normalizeUsername(value)).toBeNull();
    expect(usernameJoi().validate(value).error).toBeDefined();
  });

  it("rejects a non-string", () => {
    expect(normalizeUsername(42)).toBeNull();
  });

  it("trims and lowercases a valid username", () => {
    expect(normalizeUsername("  Fox.Pass_1 ")).toBe("fox.pass_1");
    expect(usernameJoi().validate("Fox.Pass_1").value).toBe("fox.pass_1");
  });

  it("accepts the 3 and 30 character limits", () => {
    expect(normalizeUsername("abc")).toBe("abc");
    expect(normalizeUsername("a".repeat(30))).not.toBeNull();
    expect(normalizeUsername("a".repeat(31))).toBeNull();
  });
});
