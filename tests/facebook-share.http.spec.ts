import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import request from "supertest";

/**
 * Facebook Page sharing through the HTTP routes, against the test database.
 * Meta's Graph API, the video bucket and the Redis-held OAuth state are
 * replaced; everything between them (routes, validation, ownership, the share
 * rows and their uniqueness) is real. This proves FoxPassport's side only: a
 * real share to a test Page is the proof that Meta accepts it.
 */

const KEY = Buffer.alloc(32, 3).toString("base64");

vi.mock("../src/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/config")>()),
  FACEBOOK_APP_ID: "1234567890",
  FACEBOOK_APP_SECRET: "test-app-secret",
  // Sharing runs as its own Meta app when one is set (see sharingApp).
  FACEBOOK_PAGES_APP_ID: "5550001111",
  FACEBOOK_PAGES_APP_SECRET: "test-pages-secret",
  FACEBOOK_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString("base64"),
  FRONTEND_URL: "https://app.test",
  VIDEO_CDN_URL: "https://cdn.test",
  AWS_S3_VIDEO_BUCKET: "videos-test",
}));

const s3 = vi.hoisted(() => ({
  getVideoObject: vi.fn(),
}));
vi.mock("../src/utils/s3", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/utils/s3")>()),
  getVideoObject: s3.getVideoObject,
  isVideoStorageConfigured: () => true,
}));

const states = vi.hoisted(() => new Map<string, string>());
vi.mock("../src/modules/facebook/facebook-oauth-state.service", () => ({
  issueFacebookOAuthState: async (userId: string) => {
    const state = `${"a".repeat(60)}${String(states.size).padStart(4, "0")}`;
    states.set(state, userId);
    return state;
  },
  redeemFacebookOAuthState: async (state: string) => {
    const userId = states.get(state) ?? null;
    states.delete(state);
    return userId;
  },
}));

const graph = vi.hoisted(() => ({
  exchangeCode: vi.fn(),
  exchangeLongLived: vi.fn(),
  getGrantedScopes: vi.fn(),
  getMe: vi.fn(),
  listPages: vi.fn(),
  uploadPageVideo: vi.fn(),
  getVideoStatus: vi.fn(),
  revokePermissions: vi.fn(),
}));
vi.mock(
  "../src/modules/facebook/facebook-graph.service",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../src/modules/facebook/facebook-graph.service")
      >();
    return {
      ...actual,
      default: { buildDialogUrl: actual.default.buildDialogUrl, ...graph },
    };
  },
);

import app from "../src/app";
import { prisma } from "../src/utils/prisma";
import { signTestSession } from "./helpers/test-session";
import { decryptToken, encryptToken } from "../src/utils/token-crypto";
import { FacebookGraphError } from "../src/modules/facebook/facebook-graph.service";

const ALL_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
];
const PAGES = [
  {
    id: "111",
    name: "Fox Test Page",
    accessToken: "page-token-111",
    tasks: ["CREATE_CONTENT", "MODERATE"],
  },
  {
    id: "222",
    name: "Read Only Page",
    accessToken: "page-token-222",
    tasks: ["ANALYZE"],
  },
];
/** Where the API stores a video uploaded by `userId` (see s3.service.ts). */
const videoUrlFor = (userId: string) =>
  `https://cdn.test/users/${userId}/uploads/clip.mp4`;
const VIDEO_BYTES = Buffer.from("fake-mp4-bytes");

const unavailable = () =>
  new FacebookGraphError(
    "Facebook isn't responding right now. Try again in a few minutes.",
    503,
    "FACEBOOK_UNAVAILABLE",
    2,
    "Service temporarily unavailable",
  );

describe("Facebook Page sharing API", () => {
  const runId = Math.random().toString(36).slice(2, 8);
  let author: { id: string; token: string };
  let stranger: { id: string; token: string };
  let videoPostId: string;

  const as = (u: { token: string }) => ({
    Authorization: `Bearer ${u.token}`,
  });

  async function makeUser(tag: string) {
    const user = await prisma.user.create({
      data: {
        email: `fb_${tag}_${runId}@test.com`,
        username: `fb_${tag}_${runId}`,
        password: "pw",
        roleType: [],
        name: `FB ${tag}`,
      },
    });
    return {
      id: user.id,
      token: signTestSession({ userId: user.id, email: user.email }),
    };
  }

  const makePost = (
    authorId: string,
    over: Partial<{
      mediaUrls: string[];
      visibility: "public" | "followers";
    }> = {},
  ) =>
    prisma.post.create({
      data: {
        authorId,
        type: "citizen_experience",
        tab: "community",
        content: `Sunset at the venue #${runId}`,
        mediaUrls: [videoUrlFor(authorId)],
        visibility: "public",
        ...over,
      },
    });

  /** Runs the dialog round trip for `user` with Meta granting `scopes`. */
  async function connect(user: { token: string }, scopes = ALL_SCOPES) {
    graph.exchangeCode.mockResolvedValueOnce({ accessToken: "short-token" });
    graph.exchangeLongLived.mockResolvedValueOnce({
      accessToken: "long-user-token",
      expiresIn: 5_184_000,
    });
    graph.getGrantedScopes.mockResolvedValueOnce(scopes);
    graph.getMe.mockResolvedValueOnce({ id: "fb-user-1", name: "Fox Tester" });
    const urlRes = await request(app)
      .get("/api/v1/integrations/facebook/connect-url")
      .set(as(user));
    const state = new URL(urlRes.body.data.url).searchParams.get("state");
    return request(app).get(
      `/api/v1/integrations/facebook/callback?code=the-code&state=${state}`,
    );
  }

  async function connectWithPage(user: { token: string }) {
    await connect(user);
    graph.listPages.mockResolvedValueOnce(PAGES);
    return request(app)
      .put("/api/v1/integrations/facebook/page")
      .set(as(user))
      .send({ pageId: "111" });
  }

  beforeAll(async () => {
    author = await makeUser("author");
    stranger = await makeUser("stranger");
    videoPostId = (await makePost(author.id)).id;
  });

  afterAll(async () => {
    // Posts, connections and shares cascade from the users.
    await prisma.user.deleteMany({
      where: { id: { in: [author.id, stranger.id] } },
    });
  });

  beforeEach(() => {
    for (const fn of Object.values(graph)) fn.mockReset();
    s3.getVideoObject.mockReset();
    s3.getVideoObject.mockResolvedValue({
      body: VIDEO_BYTES,
      contentType: "video/mp4",
    });
  });

  it("refuses every route without a session, except Meta's callback", async () => {
    const res = await request(app).get("/api/v1/integrations/facebook");
    expect(res.status).toBe(401);
    const share = await request(app)
      .post("/api/v1/integrations/facebook/shares")
      .send({ postId: videoPostId });
    expect(share.status).toBe(401);
  });

  it("reports a Foxer who never connected as not connected", async () => {
    const res = await request(app)
      .get("/api/v1/integrations/facebook")
      .set(as(stranger));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      available: true,
      connected: false,
      page: null,
    });
  });

  it("builds the Meta dialog with the Page permissions and a state", async () => {
    const res = await request(app)
      .get("/api/v1/integrations/facebook/connect-url")
      .set(as(author));
    expect(res.status).toBe(200);
    const url = new URL(res.body.data.url);
    expect(url.hostname).toBe("www.facebook.com");
    expect(url.pathname).toMatch(/^\/v\d+\.\d+\/dialog\/oauth$/);
    // The Page-sharing app, not the sign-in app.
    expect(url.searchParams.get("client_id")).toBe("5550001111");
    expect(url.searchParams.get("scope")).toBe(ALL_SCOPES.join(","));
    expect(url.searchParams.get("state")).toBeTruthy();
  });

  it("sends an unknown or replayed state back to settings with an error", async () => {
    const res = await request(app).get(
      `/api/v1/integrations/facebook/callback?code=x&state=${"b".repeat(64)}`,
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(
      "https://app.test/user/settings?section=connections&facebook_error=invalid_state",
    );
    expect(graph.exchangeCode).not.toHaveBeenCalled();
  });

  it("does not connect when the Foxer unticks a Page permission", async () => {
    const res = await connect(stranger, ["pages_show_list"]);
    expect(res.headers.location).toContain(
      "facebook_error=permissions_declined",
    );
    expect(
      await prisma.facebookConnection.findUnique({
        where: { userId: stranger.id },
      }),
    ).toBeNull();
  });

  it("connects, storing the user token encrypted", async () => {
    const res = await connect(author);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(
      "https://app.test/user/settings?section=connections&facebook=connected",
    );
    const row = await prisma.facebookConnection.findUniqueOrThrow({
      where: { userId: author.id },
    });
    expect(row.userAccessTokenEnc).not.toContain("long-user-token");
    expect(decryptToken(row.userAccessTokenEnc, KEY)).toBe("long-user-token");
    expect(row.userTokenExpiresAt).toBeInstanceOf(Date);

    const status = await request(app)
      .get("/api/v1/integrations/facebook")
      .set(as(author));
    expect(status.body.data).toMatchObject({
      connected: true,
      status: "active",
      facebookUserName: "Fox Tester",
      page: null,
    });
    expect(JSON.stringify(status.body)).not.toMatch(/token-|Enc/);
  });

  it("lists Pages without their tokens, and an empty list when there are none", async () => {
    graph.listPages.mockResolvedValueOnce(PAGES);
    const res = await request(app)
      .get("/api/v1/integrations/facebook/pages")
      .set(as(author));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      { id: "111", name: "Fox Test Page", canPublish: true },
      { id: "222", name: "Read Only Page", canPublish: false },
    ]);
    expect(JSON.stringify(res.body)).not.toContain("page-token");

    graph.listPages.mockResolvedValueOnce([]);
    const none = await request(app)
      .get("/api/v1/integrations/facebook/pages")
      .set(as(author));
    expect(none.status).toBe(200);
    expect(none.body.data).toEqual([]);
  });

  it("refuses to share before a Page is chosen", async () => {
    const res = await request(app)
      .post("/api/v1/integrations/facebook/shares")
      .set(as(author))
      .send({ postId: videoPostId });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("FACEBOOK_PAGE_NOT_SELECTED");
  });

  it("refuses a Page the Foxer can't post to, and saves one they can", async () => {
    graph.listPages.mockResolvedValueOnce(PAGES);
    const refused = await request(app)
      .put("/api/v1/integrations/facebook/page")
      .set(as(author))
      .send({ pageId: "222" });
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe("FACEBOOK_PAGE_NO_PUBLISH_ACCESS");

    graph.listPages.mockResolvedValueOnce(PAGES);
    const saved = await request(app)
      .put("/api/v1/integrations/facebook/page")
      .set(as(author))
      .send({ pageId: "111" });
    expect(saved.status).toBe(200);
    expect(saved.body.data.page).toEqual({ id: "111", name: "Fox Test Page" });
    const row = await prisma.facebookConnection.findUniqueOrThrow({
      where: { userId: author.id },
    });
    expect(decryptToken(row.pageAccessTokenEnc!, KEY)).toBe("page-token-111");
  });

  it("refuses a Foxer who has not connected Facebook", async () => {
    const res = await request(app)
      .post("/api/v1/integrations/facebook/shares")
      .set(as(stranger))
      .send({ postId: videoPostId });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("FACEBOOK_NOT_CONNECTED");
  });

  it("refuses someone else's post, a non-public post and a post without video", async () => {
    const others = await makePost(stranger.id);
    const notMine = await request(app)
      .post("/api/v1/integrations/facebook/shares")
      .set(as(author))
      .send({ postId: others.id });
    expect(notMine.status).toBe(403);
    expect(notMine.body.code).toBe("NOT_POST_AUTHOR");

    const followers = await makePost(author.id, { visibility: "followers" });
    const hidden = await request(app)
      .post("/api/v1/integrations/facebook/shares")
      .set(as(author))
      .send({ postId: followers.id });
    expect(hidden.status).toBe(400);
    expect(hidden.body.code).toBe("POST_NOT_PUBLIC");

    const photo = await makePost(author.id, {
      mediaUrls: ["https://cdn.test/users/x/uploads/photo.jpg"],
    });
    const noVideo = await request(app)
      .post("/api/v1/integrations/facebook/shares")
      .set(as(author))
      .send({ postId: photo.id });
    expect(noVideo.status).toBe(400);
    expect(noVideo.body.code).toBe("POST_HAS_NO_VIDEO");

    // A video link on a host we don't store videos on is never fetched.
    const foreign = await makePost(author.id, {
      mediaUrls: ["https://elsewhere.example/clip.mp4"],
    });
    const foreignRes = await request(app)
      .post("/api/v1/integrations/facebook/shares")
      .set(as(author))
      .send({ postId: foreign.id });
    expect(foreignRes.body.code).toBe("POST_HAS_NO_VIDEO");

    // Nor is a video someone else uploaded, pasted into the author's post.
    const borrowed = await makePost(author.id, {
      mediaUrls: [videoUrlFor(stranger.id)],
    });
    const borrowedRes = await request(app)
      .post("/api/v1/integrations/facebook/shares")
      .set(as(author))
      .send({ postId: borrowed.id });
    expect(borrowedRes.body.code).toBe("POST_HAS_NO_VIDEO");
    expect(graph.uploadPageVideo).not.toHaveBeenCalled();
    expect(s3.getVideoObject).not.toHaveBeenCalled();
  });

  it("shares the stored video and caption, then reports it live", async () => {
    graph.uploadPageVideo.mockResolvedValueOnce({ videoId: "vid-1" });
    const res = await request(app)
      .post("/api/v1/integrations/facebook/shares")
      .set(as(author))
      .send({ postId: videoPostId });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      postId: videoPostId,
      pageId: "111",
      pageName: "Fox Test Page",
      status: "processing",
    });
    expect(s3.getVideoObject).toHaveBeenCalledWith(
      `users/${author.id}/uploads/clip.mp4`,
    );
    expect(graph.uploadPageVideo).toHaveBeenCalledTimes(1);
    expect(graph.uploadPageVideo).toHaveBeenCalledWith({
      pageId: "111",
      pageToken: "page-token-111",
      video: VIDEO_BYTES,
      contentType: "video/mp4",
      description: `Sunset at the venue #${runId}`,
    });

    graph.getVideoStatus.mockResolvedValueOnce({ videoStatus: "processing" });
    const still = await request(app)
      .get(`/api/v1/integrations/facebook/shares/${videoPostId}`)
      .set(as(author));
    expect(still.body.data.status).toBe("processing");

    graph.getVideoStatus.mockResolvedValueOnce({
      videoStatus: "ready",
      permalinkUrl: "https://www.facebook.com/111/videos/vid-1/",
    });
    const live = await request(app)
      .get(`/api/v1/integrations/facebook/shares/${videoPostId}`)
      .set(as(author));
    expect(live.body.data).toMatchObject({
      status: "published",
      permalinkUrl: "https://www.facebook.com/111/videos/vid-1/",
      canRetry: false,
    });
    expect(graph.getVideoStatus).toHaveBeenCalledWith(
      "vid-1",
      "page-token-111",
    );
  });

  it("never sends the same video twice to the same Page", async () => {
    const again = await request(app)
      .post("/api/v1/integrations/facebook/shares")
      .set(as(author))
      .send({ postId: videoPostId });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("ALREADY_SHARED");
    expect(again.body.data.permalinkUrl).toContain("vid-1");
    expect(graph.uploadPageVideo).not.toHaveBeenCalled();
  });

  it("sends a video once when the button is clicked twice at the same time", async () => {
    const post = await makePost(author.id);
    graph.uploadPageVideo.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 150));
      return { videoId: "vid-race" };
    });
    const send = () =>
      request(app)
        .post("/api/v1/integrations/facebook/shares")
        .set(as(author))
        .send({ postId: post.id });
    const results = await Promise.all([send(), send(), send()]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409, 409]);
    expect(
      results
        .filter((r) => r.status === 409)
        .every((r) =>
          ["SHARE_IN_PROGRESS", "ALREADY_SHARED"].includes(r.body.code),
        ),
    ).toBe(true);
    expect(graph.uploadPageVideo).toHaveBeenCalledTimes(1);
    expect(
      await prisma.facebookShare.count({ where: { postId: post.id } }),
    ).toBe(1);
  });

  it("records a failure when Facebook is down, and a retry then succeeds", async () => {
    const post = await makePost(author.id);
    graph.uploadPageVideo.mockRejectedValueOnce(unavailable());
    const failed = await request(app)
      .post("/api/v1/integrations/facebook/shares")
      .set(as(author))
      .send({ postId: post.id });
    expect(failed.status).toBe(200);
    expect(failed.body.data).toMatchObject({
      status: "failed",
      errorCode: "FACEBOOK_UNAVAILABLE",
      canRetry: true,
      attempts: 1,
    });

    graph.uploadPageVideo.mockResolvedValueOnce({ videoId: "vid-retry" });
    const retried = await request(app)
      .post("/api/v1/integrations/facebook/shares")
      .set(as(author))
      .send({ postId: post.id });
    expect(retried.body.data).toMatchObject({
      status: "processing",
      attempts: 2,
      errorCode: null,
    });
  });

  it("records a video Facebook rejects, and leaves the FoxPassport post alone", async () => {
    const post = await makePost(author.id);
    graph.uploadPageVideo.mockRejectedValueOnce(
      new FacebookGraphError(
        "Facebook didn't accept this video.",
        422,
        "FACEBOOK_VIDEO_REJECTED",
        6001,
        "Problem uploading video",
      ),
    );
    const res = await request(app)
      .post("/api/v1/integrations/facebook/shares")
      .set(as(author))
      .send({ postId: post.id });
    expect(res.body.data).toMatchObject({
      status: "failed",
      errorCode: "FACEBOOK_VIDEO_REJECTED",
      errorMessage: "Facebook didn't accept this video.",
    });
    const after = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
    });
    expect(after).toMatchObject({
      content: post.content,
      mediaUrls: post.mediaUrls,
      visibility: "public",
      isArchived: false,
      sharesCount: post.sharesCount,
    });
  });

  it("fails cleanly when the stored video file is gone", async () => {
    const post = await makePost(author.id);
    s3.getVideoObject.mockResolvedValueOnce(null);
    const res = await request(app)
      .post("/api/v1/integrations/facebook/shares")
      .set(as(author))
      .send({ postId: post.id });
    expect(res.body.data).toMatchObject({
      status: "failed",
      errorCode: "VIDEO_SOURCE_MISSING",
    });
    expect(graph.uploadPageVideo).not.toHaveBeenCalled();
  });

  it("asks the Foxer to reconnect when Meta revokes the token", async () => {
    const post = await makePost(author.id);
    graph.uploadPageVideo.mockRejectedValueOnce(
      new FacebookGraphError(
        "Your Facebook connection has expired. Reconnect Facebook and try again.",
        409,
        "FACEBOOK_TOKEN_INVALID",
        190,
        "Error validating access token",
      ),
    );
    const res = await request(app)
      .post("/api/v1/integrations/facebook/shares")
      .set(as(author))
      .send({ postId: post.id });
    expect(res.body.data).toMatchObject({
      status: "failed",
      errorCode: "FACEBOOK_TOKEN_INVALID",
    });

    const status = await request(app)
      .get("/api/v1/integrations/facebook")
      .set(as(author));
    expect(status.body.data.status).toBe("needs_reconnect");

    const blocked = await request(app)
      .post("/api/v1/integrations/facebook/shares")
      .set(as(author))
      .send({ postId: post.id });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe("FACEBOOK_TOKEN_INVALID");

    // Reconnecting restores the connection and keeps the chosen Page.
    graph.listPages.mockResolvedValueOnce(PAGES);
    await connect(author);
    const back = await request(app)
      .get("/api/v1/integrations/facebook")
      .set(as(author));
    expect(back.body.data).toMatchObject({
      status: "active",
      page: { id: "111", name: "Fox Test Page" },
    });
  });

  it("asks the Foxer to reconnect when their stored token can't be read", async () => {
    // As after FACEBOOK_TOKEN_ENCRYPTION_KEY is changed.
    const original = await prisma.facebookConnection.findUniqueOrThrow({
      where: { userId: author.id },
    });
    await prisma.facebookConnection.update({
      where: { userId: author.id },
      data: {
        userAccessTokenEnc: encryptToken(
          "long-user-token",
          Buffer.alloc(32, 8).toString("base64"),
        ),
      },
    });
    const res = await request(app)
      .post("/api/v1/integrations/facebook/shares")
      .set(as(author))
      .send({ postId: videoPostId });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("FACEBOOK_TOKEN_INVALID");
    const row = await prisma.facebookConnection.findUniqueOrThrow({
      where: { userId: author.id },
    });
    expect(row.status).toBe("needs_reconnect");
    await prisma.facebookConnection.update({
      where: { userId: author.id },
      data: {
        userAccessTokenEnc: original.userAccessTokenEnc,
        status: "active",
      },
    });
  });

  it("disconnects, keeping share history, and then refuses to share", async () => {
    graph.revokePermissions.mockResolvedValueOnce(undefined);
    const before = await prisma.facebookShare.count({
      where: { userId: author.id },
    });
    expect(before).toBeGreaterThan(0);

    const res = await request(app)
      .delete("/api/v1/integrations/facebook")
      .set(as(author));
    expect(res.status).toBe(200);
    expect(res.body.data.connected).toBe(false);
    expect(graph.revokePermissions).toHaveBeenCalledWith("long-user-token");
    expect(
      await prisma.facebookShare.count({ where: { userId: author.id } }),
    ).toBe(before);

    const share = await request(app)
      .post("/api/v1/integrations/facebook/shares")
      .set(as(author))
      .send({ postId: videoPostId });
    expect(share.status).toBe(409);
    expect(share.body.code).toBe("FACEBOOK_NOT_CONNECTED");
  });

  it("disconnects even when Meta can't be reached to revoke", async () => {
    await connectWithPage(author);
    graph.revokePermissions.mockRejectedValueOnce(unavailable());
    const res = await request(app)
      .delete("/api/v1/integrations/facebook")
      .set(as(author));
    expect(res.status).toBe(200);
    expect(
      await prisma.facebookConnection.findUnique({
        where: { userId: author.id },
      }),
    ).toBeNull();
  });

  it("publishing a FoxPassport video post never shares it to Facebook", async () => {
    await connectWithPage(author);
    const res = await request(app)
      .post("/api/v1/feed")
      .set(as(author))
      .send({
        type: "citizen_experience",
        content: "Just on FoxPassport",
        mediaUrls: [videoUrlFor(author.id)],
        visibility: "public",
      });
    expect(res.status).toBeLessThan(300);
    const postId = res.body.data?.id;
    expect(postId).toBeTruthy();
    expect(graph.uploadPageVideo).not.toHaveBeenCalled();
    expect(await prisma.facebookShare.count({ where: { postId } })).toBe(0);
  });
});
