import { describe, it, expect } from "vitest";
import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  passwordJoi,
  passwordPolicyError,
} from "../src/utils/password-policy";

/**
 * BUG-27: one password policy, 12–128 characters with an uppercase letter, a
 * lowercase letter, a digit and a special character, enforced on every route
 * that sets a password. Same rules as the web's shared/lib/passwordPolicy.ts.
 */

/** A valid password of exactly `n` characters (n >= 4). */
const ofLength = (n: number) => "Aa1!" + "x".repeat(n - 4);

describe("password policy", () => {
  it.each([
    ["12 characters with every type", ofLength(PASSWORD_MIN)],
    ["128 characters", ofLength(PASSWORD_MAX)],
    ["any special character", "Correct-Horse9"],
  ])("accepts %s", (_label, pw) => {
    expect(passwordPolicyError(pw)).toBeNull();
    expect(passwordJoi().validate(pw).error).toBeUndefined();
  });

  it.each([
    ["11 characters", ofLength(PASSWORD_MIN - 1), /at least 12/],
    // Over 128 could be set through the old Joi rule but never signed in with.
    ["129 characters", ofLength(PASSWORD_MAX + 1), /at most 128/],
    ["no uppercase", "aa1!xxxxxxxxxx", /uppercase/],
    ["no lowercase", "AA1!XXXXXXXXXX", /lowercase/],
    ["no digit", "Aa!!xxxxxxxxxx", /digit/],
    ["no special (a space does not count)", "Aa1 xxxxxxxxxx", /special/],
    // What the old `Joi.string().min(6)` on change-password and admin allowed.
    ["the old 6-character minimum", "Ab1!xy", /at least 12/],
  ])("rejects %s", (_label, pw, message) => {
    expect(passwordPolicyError(pw)).toMatch(message);
    const { error } = passwordJoi().validate(pw);
    expect(error?.message).toMatch(message);
  });

  it("rejects an empty password with the policy message", () => {
    expect(passwordJoi().validate("").error?.message).toMatch(/at least 12/);
  });
});

describe("Better Auth enforces the policy before anything is written", () => {
  // The hook throws before the handler runs, so a refused password creates or
  // changes nothing. Sign-in is deliberately not checked: existing accounts
  // with older, shorter passwords can still log in.
  const cases: Array<[string, string, Record<string, string>, RegExp]> = [
    [
      "sign-up without a special character",
      "/api/auth/sign-up/email",
      {
        email: "policy.signup@example.com",
        name: "Policy Test",
        password: "NoSpecialChars123",
      },
      /special character/,
    ],
    [
      "sign-up with 11 characters",
      "/api/auth/sign-up/email",
      {
        email: "policy.short@example.com",
        name: "Policy Test",
        password: ofLength(PASSWORD_MIN - 1),
      },
      /at least 12/,
    ],
    [
      "an OTP reset without an uppercase letter",
      "/api/auth/email-otp/reset-password",
      {
        email: "policy.reset@example.com",
        otp: "123456",
        password: "lowercase-only-123",
      },
      /uppercase/,
    ],
  ];

  it.each(cases)("refuses %s", async (_label, path, body, message) => {
    const { default: request } = await import("supertest");
    const { default: app } = await import("../src/app");
    const res = await request(app).post(path).send(body);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(message);
  });
});
