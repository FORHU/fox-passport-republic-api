import { describe, it, expect } from "vitest";
import { assertSafeTarget } from "../prisma/seeder/reels-remote.seeder";

// seed:reels:remote posts sample reels over HTTP; it must not hit a real
// environment by accident.
describe("seed:reels:remote target guard", () => {
  it.each([
    "http://localhost:6002",
    "http://127.0.0.1:6002",
    "https://dev.foxpassport.com",
  ])("allows %s", (url) => {
    expect(assertSafeTarget(url, false).href).toContain(new URL(url).hostname);
  });

  it.each([
    "https://foxpassport.com",
    "https://api.foxpassport.com",
    "https://staging.example.com",
  ])("refuses %s without --force", (url) => {
    expect(() => assertSafeTarget(url, false)).toThrow(/--force/);
  });

  it("allows any host with --force", () => {
    expect(assertSafeTarget("https://foxpassport.com", true).hostname).toBe(
      "foxpassport.com",
    );
  });

  it("rejects a value that is not a URL", () => {
    expect(() => assertSafeTarget("dev.foxpassport.com", false)).toThrow();
  });
});
