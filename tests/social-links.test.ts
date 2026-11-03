import { describe, expect, it } from "vitest";
import {
  normalizeSocialLink,
  normalizeSocialLinks,
} from "../src/utils/social-links";

// Pure: no database, no Prisma.
describe("normalizeSocialLink", () => {
  it("turns a handle into that platform's address", () => {
    expect(normalizeSocialLink("instagram", "@rex")).toBe(
      "https://instagram.com/rex",
    );
    expect(normalizeSocialLink("tiktok", "rex.sings")).toBe(
      "https://tiktok.com/@rex.sings",
    );
    expect(normalizeSocialLink("x", "rex_x")).toBe("https://x.com/rex_x");
  });

  it("keeps a full address on the right domain", () => {
    expect(
      normalizeSocialLink("instagram", "https://www.instagram.com/rex/"),
    ).toBe("https://www.instagram.com/rex/");
    expect(normalizeSocialLink("facebook", "facebook.com/rex")).toBe(
      "https://facebook.com/rex",
    );
    expect(normalizeSocialLink("x", "https://twitter.com/rex")).toBe(
      "https://twitter.com/rex",
    );
  });

  it("refuses another site on a named platform", () => {
    expect(normalizeSocialLink("instagram", "https://evil.example/rex")).toBe(
      null,
    );
    expect(
      normalizeSocialLink("instagram", "https://instagram.com.evil.example/x"),
    ).toBe(null);
  });

  it("refuses anything that is not an http(s) address", () => {
    expect(normalizeSocialLink("website", "javascript:alert(1)")).toBe(null);
    expect(normalizeSocialLink("website", "ftp://example.com")).toBe(null);
    expect(normalizeSocialLink("website", "https://localhost")).toBe(null);
    expect(normalizeSocialLink("website", "https://a:b@example.com")).toBe(
      null,
    );
  });

  it("accepts any site as a website, adding https when it is missing", () => {
    expect(normalizeSocialLink("website", "rex.example.com")).toBe(
      "https://rex.example.com/",
    );
  });

  it("treats empty as cleared, and refuses a very long link", () => {
    expect(normalizeSocialLink("instagram", "   ")).toBe("");
    expect(
      normalizeSocialLink("website", `https://example.com/${"a".repeat(400)}`),
    ).toBe(null);
  });
});

describe("normalizeSocialLinks", () => {
  it("keeps the platforms given and leaves out empty ones", () => {
    expect(
      normalizeSocialLinks({ instagram: "@rex", tiktok: "", website: "" }),
    ).toEqual({ instagram: "https://instagram.com/rex" });
  });

  it("ignores platforms it does not know", () => {
    expect(normalizeSocialLinks({ myspace: "rex" })).toEqual({});
  });

  it("says which link is wrong", () => {
    expect(() =>
      normalizeSocialLinks({ youtube: "https://example.com/x" }),
    ).toThrow("That youtube link is not valid");
  });
});
