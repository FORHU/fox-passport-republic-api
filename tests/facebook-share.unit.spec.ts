import { describe, it, expect, vi, beforeEach } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";

/**
 * Pure pieces of Facebook Page sharing: token encryption, the OAuth state, how
 * Graph errors are classified, and which stored links count as our videos.
 * No database, no network.
 */

const store = vi.hoisted(() => new Map<string, string>());
vi.mock("../src/utils/redis.util", () => ({
  default: {
    getClient: () => ({
      set: async (k: string, v: string) => {
        store.set(k, v);
      },
      getDel: async (k: string) => {
        const v = store.get(k) ?? null;
        store.delete(k);
        return v;
      },
    }),
  },
}));

import { encryptToken, decryptToken } from "../src/utils/token-crypto";
import {
  issueFacebookOAuthState,
  redeemFacebookOAuthState,
} from "../src/modules/facebook/facebook-oauth-state.service";
import { toFacebookError } from "../src/modules/facebook/facebook-graph.service";

const KEY = Buffer.alloc(32, 7).toString("base64");
const OTHER_KEY = Buffer.alloc(32, 9).toString("base64");

describe("token-crypto", () => {
  it("round-trips a token and never stores it in the clear", () => {
    const stored = encryptToken("EAAB-page-token", KEY);
    expect(stored.startsWith("v1:")).toBe(true);
    expect(stored).not.toContain("EAAB-page-token");
    expect(decryptToken(stored, KEY)).toBe("EAAB-page-token");
  });

  it("uses a fresh IV each time", () => {
    expect(encryptToken("same", KEY)).not.toBe(encryptToken("same", KEY));
  });

  it("refuses a tampered ciphertext or the wrong key", () => {
    const stored = encryptToken("secret", KEY);
    const [v, iv, tag, ct] = stored.split(":");
    const flipped = Buffer.from(ct, "base64");
    flipped[0] ^= 1;
    expect(() =>
      decryptToken([v, iv, tag, flipped.toString("base64")].join(":"), KEY),
    ).toThrow();
    expect(() => decryptToken(stored, OTHER_KEY)).toThrow();
    expect(() => decryptToken("plain-token", KEY)).toThrow();
  });

  it("refuses a key that is not 32 bytes", () => {
    expect(() =>
      encryptToken("x", Buffer.alloc(16).toString("base64")),
    ).toThrow();
  });
});

describe("Facebook OAuth state", () => {
  beforeEach(() => store.clear());

  it("names the user it was issued to, exactly once", async () => {
    const state = await issueFacebookOAuthState("user-1");
    expect(state).toMatch(/^[0-9a-f]{64}$/);
    expect(await redeemFacebookOAuthState(state)).toBe("user-1");
    expect(await redeemFacebookOAuthState(state)).toBeNull();
  });

  it("knows nothing of a state it never issued", async () => {
    expect(await redeemFacebookOAuthState("f".repeat(64))).toBeNull();
    expect(await redeemFacebookOAuthState("not-hex")).toBeNull();
  });
});

function graphError(status: number, body: unknown) {
  const err = new AxiosError("Request failed", "ERR_BAD_RESPONSE");
  err.response = {
    status,
    statusText: "",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: body,
  };
  return err;
}

describe("toFacebookError", () => {
  it.each([
    [400, 190, "FACEBOOK_TOKEN_INVALID", 409],
    [403, 200, "FACEBOOK_PERMISSION_MISSING", 403],
    [400, 10, "FACEBOOK_PERMISSION_MISSING", 403],
    [400, 6001, "FACEBOOK_VIDEO_REJECTED", 422],
    [400, 382, "FACEBOOK_VIDEO_REJECTED", 422],
    [400, 368, "FACEBOOK_VIDEO_REJECTED", 422],
    [400, 4, "FACEBOOK_UNAVAILABLE", 503],
    [400, 32, "FACEBOOK_UNAVAILABLE", 503],
    [500, 2, "FACEBOOK_UNAVAILABLE", 503],
    [400, 100, "FACEBOOK_ERROR", 502],
  ])(
    "HTTP %i with Meta code %i is %s",
    (status, code, expected, httpStatus) => {
      const err = toFacebookError(
        graphError(status, { error: { code, message: "meta says no" } }),
      );
      expect(err.code).toBe(expected);
      expect(err.status).toBe(httpStatus);
      expect(err.metaCode).toBe(code);
      // Meta's text is kept for the log, never used as the client's message.
      expect(err.metaMessage).toBe("meta says no");
      expect(err.message).not.toContain("meta says no");
    },
  );

  it("treats no response at all as Facebook being unavailable", () => {
    const err = new AxiosError("timeout", "ECONNABORTED");
    expect(toFacebookError(err).code).toBe("FACEBOOK_UNAVAILABLE");
  });

  it("does not blame Facebook for a fault on our side", () => {
    expect(toFacebookError(new Error("S3 exploded")).code).toBe(
      "FACEBOOK_SHARE_FAILED",
    );
  });
});

describe("videoKeyFromUrl", () => {
  async function load(env: Record<string, string | undefined>) {
    vi.resetModules();
    vi.doMock("../src/config", async (importOriginal) => ({
      ...(await importOriginal<typeof import("../src/config")>()),
      AWS_REGION: "ap-southeast-1",
      AWS_S3_BUCKET: "fox-media",
      AWS_S3_VIDEO_BUCKET: "fox-videos",
      AWS_VIDEO_REGION: undefined,
      S3_ENDPOINT: undefined,
      VIDEO_CDN_URL: "https://cdn.example.net",
      ...env,
    }));
    return import("../src/utils/s3");
  }

  it("reads the key from a CDN link and from an old bucket link", async () => {
    const { videoKeyFromUrl } = await load({});
    expect(
      videoKeyFromUrl("https://cdn.example.net/users/u1/uploads/a.mp4"),
    ).toBe("users/u1/uploads/a.mp4");
    expect(
      videoKeyFromUrl(
        "https://fox-videos.s3.ap-southeast-1.amazonaws.com/users/u1/uploads/b.mp4",
      ),
    ).toBe("users/u1/uploads/b.mp4");
  });

  it("refuses any other host, so a typed-in link is never fetched", async () => {
    const { videoKeyFromUrl } = await load({});
    expect(videoKeyFromUrl("https://evil.example/users/u1/a.mp4")).toBeNull();
    expect(
      videoKeyFromUrl("https://cdn.example.net.evil.example/users/a.mp4"),
    ).toBeNull();
    expect(videoKeyFromUrl("http://169.254.169.254/latest")).toBeNull();
    expect(videoKeyFromUrl("not a url")).toBeNull();
  });

  it("keeps a dot-dot link inside the bucket", async () => {
    const { videoKeyFromUrl } = await load({});
    // URL parsing resolves the segments before the key is read.
    expect(
      videoKeyFromUrl("https://cdn.example.net/users/%2e%2e/secret.mp4"),
    ).toBe("secret.mp4");
  });

  it("answers null for a malformed %-escape instead of throwing", async () => {
    const { videoKeyFromUrl } = await load({});
    expect(
      videoKeyFromUrl("https://cdn.example.net/users/u1/uploads/%E0%A4%A.mp4"),
    ).toBeNull();
  });
});

describe("sharingApp", () => {
  async function load(env: Record<string, string | undefined>) {
    vi.resetModules();
    vi.doMock("../src/config", async (importOriginal) => ({
      ...(await importOriginal<typeof import("../src/config")>()),
      FACEBOOK_APP_ID: "signin-app",
      FACEBOOK_APP_SECRET: "signin-secret",
      FACEBOOK_PAGES_APP_ID: undefined,
      FACEBOOK_PAGES_APP_SECRET: undefined,
      ...env,
    }));
    return import("../src/modules/facebook/facebook-graph.service");
  }

  it("uses the Page-sharing app when one is configured", async () => {
    const { sharingApp } = await load({
      FACEBOOK_PAGES_APP_ID: "pages-app",
      FACEBOOK_PAGES_APP_SECRET: "pages-secret",
    });
    expect(sharingApp()).toEqual({ id: "pages-app", secret: "pages-secret" });
  });

  it("falls back to the sign-in app", async () => {
    const { sharingApp } = await load({});
    expect(sharingApp()).toEqual({ id: "signin-app", secret: "signin-secret" });
  });
});
