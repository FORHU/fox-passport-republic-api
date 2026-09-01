import { describe, it, expect } from "vitest";
import {
  requireSecret,
  MIN_SECRET_LENGTH,
} from "../src/utils/require-secret";

/**
 * `ACCESS_TOKEN_SECRET` was a bare `as string` cast. A deployment without it
 * booted fine and then 500'd every login; one carrying the committed dev value
 * booted fine and stayed exploitable. These pin both failures as boot failures.
 */

const dev = { isDev: true };
const prod = { isDev: false };
const strong = "x".repeat(MIN_SECRET_LENGTH);

describe("presence", () => {
  it("refuses to start when the secret is missing", () => {
    expect(() => requireSecret("ACCESS_TOKEN_SECRET", undefined, prod)).toThrow(
      /is not set/,
    );
  });

  it("refuses an empty or whitespace-only value", () => {
    expect(() => requireSecret("ACCESS_TOKEN_SECRET", "", dev)).toThrow(
      /is not set/,
    );
    expect(() => requireSecret("ACCESS_TOKEN_SECRET", "   ", dev)).toThrow(
      /is not set/,
    );
  });

  it("names the variable, so the failure is actionable", () => {
    expect(() => requireSecret("REFRESH_TOKEN_SECRET", undefined, dev)).toThrow(
      /REFRESH_TOKEN_SECRET/,
    );
  });

  it("enforces presence in development too", () => {
    expect(() => requireSecret("ACCESS_TOKEN_SECRET", undefined, dev)).toThrow();
  });
});

describe("strength, in production only", () => {
  it("rejects the committed development secret", () => {
    // This exact value lives in tests/setup.ts, so it is public.
    expect(() =>
      requireSecret("ACCESS_TOKEN_SECRET", "accesssecret123", prod),
    ).toThrow(/at least/);
  });

  it("rejects the docker placeholder", () => {
    expect(() =>
      requireSecret(
        "ACCESS_TOKEN_SECRET",
        "docker_access_secret_change_in_production",
        prod,
      ),
    ).toThrow(/placeholder/);
  });

  it("rejects bare placeholder words however they are cased", () => {
    for (const value of ["changeme", "CHANGE_ME", "placeholder", "secret"]) {
      expect(() =>
        requireSecret("ACCESS_TOKEN_SECRET", value, prod),
      ).toThrow();
    }
  });

  it("accepts a secret of sufficient length", () => {
    expect(requireSecret("ACCESS_TOKEN_SECRET", strong, prod)).toBe(strong);
  });

  it("leaves development alone — the dev values are the point there", () => {
    expect(requireSecret("ACCESS_TOKEN_SECRET", "accesssecret123", dev)).toBe(
      "accesssecret123",
    );
  });
});
