import type { FacebookConnection, FacebookShare } from "@prisma/client";
import { FACEBOOK_TOKEN_ENCRYPTION_KEY, FRONTEND_URL } from "../../config";
import {
  AppError,
  badRequest,
  conflict,
  forbidden,
  notFound,
} from "../../utils/errors";
import { decryptToken, encryptToken } from "../../utils/token-crypto";
import {
  getVideoObject,
  isVideoStorageConfigured,
  videoKeyFromUrl,
} from "../../utils/s3";
import FacebookRepository from "./facebook.repository";
import FacebookGraphService, {
  FACEBOOK_PAGE_SCOPES,
  FacebookGraphError,
  sharingApp,
  toFacebookError,
} from "./facebook-graph.service";
import {
  issueFacebookOAuthState,
  redeemFacebookOAuthState,
} from "./facebook-oauth-state.service";

/**
 * Sharing a FoxPassport video post to a Facebook Page the Foxer manages.
 *
 * FoxPassport stays the source: the video is the one already stored for the
 * post, sent to Facebook only when its author asks. Nothing here changes the
 * post itself, so a share that fails leaves the post exactly as it was.
 */

// A `publishing` row older than this was cut off (a restart mid-upload) and may
// be tried again.
const STALE_PUBLISHING_MS = 10 * 60 * 1000;
const VIDEO_KEY = /\.(mp4|mov|webm|m4v)$/i;
// Facebook's limit on a video description is far above any FoxPassport post;
// this only guards against sending something absurd.
const MAX_DESCRIPTION = 5000;

export const isFacebookSharingConfigured = () =>
  Boolean(
    sharingApp().id && sharingApp().secret && FACEBOOK_TOKEN_ENCRYPTION_KEY,
  );

function requireConfigured(): string {
  if (!isFacebookSharingConfigured() || !FACEBOOK_TOKEN_ENCRYPTION_KEY) {
    throw new AppError(
      "Sharing to Facebook isn't available right now.",
      503,
      "FACEBOOK_NOT_CONFIGURED",
    );
  }
  return FACEBOOK_TOKEN_ENCRYPTION_KEY;
}

const settingsUrl = (params: Record<string, string>) =>
  `${FRONTEND_URL.replace(/\/+$/, "")}/user/settings?${new URLSearchParams({
    section: "connections",
    ...params,
  })}`;

export interface FacebookShareView {
  id: string;
  postId: string;
  pageId: string;
  pageName: string | null;
  status: FacebookShare["status"];
  permalinkUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  attempts: number;
  publishedAt: Date | null;
  updatedAt: Date;
  /** The Foxer may click again (the last attempt failed or was cut off). */
  canRetry: boolean;
}

const isStale = (share: FacebookShare) =>
  share.status === "publishing" &&
  Date.now() - share.updatedAt.getTime() > STALE_PUBLISHING_MS;

/** A share as the client sees it. Never carries a token. */
export function toShareView(share: FacebookShare): FacebookShareView {
  return {
    id: share.id,
    postId: share.postId,
    pageId: share.pageId,
    pageName: share.pageName,
    status: isStale(share) ? "failed" : share.status,
    permalinkUrl: share.permalinkUrl,
    errorCode: isStale(share) ? "FACEBOOK_SHARE_INTERRUPTED" : share.errorCode,
    errorMessage: isStale(share)
      ? "Sharing was interrupted. Try again."
      : share.errorMessage,
    attempts: share.attempts,
    publishedAt: share.publishedAt,
    updatedAt: share.updatedAt,
    canRetry: share.status === "failed" || isStale(share),
  };
}

function connectionView(connection: FacebookConnection | null) {
  return {
    available: isFacebookSharingConfigured(),
    connected: Boolean(connection),
    status: connection?.status ?? null,
    facebookUserName: connection?.facebookUserName ?? null,
    page:
      connection?.pageId && connection.pageAccessTokenEnc
        ? { id: connection.pageId, name: connection.pageName }
        : null,
    userTokenExpiresAt: connection?.userTokenExpiresAt ?? null,
  };
}

export default class FacebookService {
  /** Where the callback sends the browser when something unexpected broke. */
  static callbackFailedUrl() {
    return settingsUrl({ facebook_error: "connect_failed" });
  }

  static async getConnection(userId: string) {
    if (!isFacebookSharingConfigured()) return connectionView(null);
    return connectionView(await FacebookRepository.findConnection(userId));
  }

  static async getConnectUrl(userId: string) {
    requireConfigured();
    const state = await issueFacebookOAuthState(userId);
    return { url: FacebookGraphService.buildDialogUrl(state) };
  }

  /**
   * Meta's redirect after the permission dialog. Always answers with where to
   * send the browser next: the settings page, with the outcome in the query.
   * The state, not a session, says whose connection this is.
   */
  static async handleCallback(query: {
    code?: string;
    state?: string;
    error?: string;
  }): Promise<string> {
    const userId = query.state
      ? await redeemFacebookOAuthState(query.state)
      : null;
    if (!userId) return settingsUrl({ facebook_error: "invalid_state" });
    // The Foxer pressed Cancel, or Meta refused the request.
    if (query.error || !query.code) {
      return settingsUrl({ facebook_error: "cancelled" });
    }

    let key: string;
    try {
      key = requireConfigured();
    } catch {
      return settingsUrl({ facebook_error: "not_configured" });
    }

    try {
      const shortLived = await FacebookGraphService.exchangeCode(query.code);
      const longLived = await FacebookGraphService.exchangeLongLived(
        shortLived.accessToken,
      );
      const token = longLived.accessToken;
      const granted = await FacebookGraphService.getGrantedScopes(token);
      if (!FACEBOOK_PAGE_SCOPES.every((s) => granted.includes(s))) {
        return settingsUrl({ facebook_error: "permissions_declined" });
      }
      const me = await FacebookGraphService.getMe(token);

      const previous = await FacebookRepository.findConnection(userId);
      await FacebookRepository.upsertConnection(userId, {
        facebookUserId: me.id,
        facebookUserName: me.name ?? null,
        userAccessTokenEnc: encryptToken(token, key),
        userTokenExpiresAt: longLived.expiresIn
          ? new Date(Date.now() + longLived.expiresIn * 1000)
          : null,
        grantedScopes: granted,
      });

      // Reconnecting keeps the chosen Page when it is still one of theirs,
      // with a fresh Page token from the new grant; otherwise it is cleared.
      if (previous?.pageId) {
        const pages = await FacebookGraphService.listPages(token);
        const page = pages.find((p) => p.id === previous.pageId);
        await FacebookRepository.updateConnection(userId, {
          pageId: page ? page.id : null,
          pageName: page ? page.name : null,
          pageAccessTokenEnc: page ? encryptToken(page.accessToken, key) : null,
        });
      }
      return settingsUrl({ facebook: "connected" });
    } catch (err) {
      const fbErr = toFacebookError(err);
      console.error("[facebook] connect failed", {
        userId,
        code: fbErr.code,
        metaCode: fbErr.metaCode,
        metaMessage: fbErr.metaMessage,
      });
      return settingsUrl({ facebook_error: "connect_failed" });
    }
  }

  private static async requireConnection(userId: string, key: string) {
    const connection = await FacebookRepository.findConnection(userId);
    if (!connection) {
      throw conflict("Connect Facebook first.", "FACEBOOK_NOT_CONNECTED");
    }
    const expired = () =>
      conflict(
        "Your Facebook connection has expired. Reconnect Facebook and try again.",
        "FACEBOOK_TOKEN_INVALID",
      );
    if (connection.status === "needs_reconnect") throw expired();
    let userToken: string;
    try {
      userToken = decryptToken(connection.userAccessTokenEnc, key);
    } catch {
      // Stored under a different key (FACEBOOK_TOKEN_ENCRYPTION_KEY changed):
      // unreadable for good, so the Foxer connects again.
      await FacebookRepository.setConnectionStatus(userId, "needs_reconnect");
      throw expired();
    }
    return { connection, userToken };
  }

  /** A Graph call failed on a revoked token: the Foxer has to connect again. */
  private static async noteTokenFailure(userId: string, err: unknown) {
    if (
      err instanceof FacebookGraphError &&
      err.code === "FACEBOOK_TOKEN_INVALID"
    ) {
      await FacebookRepository.setConnectionStatus(userId, "needs_reconnect");
    }
  }

  /** The Pages the Foxer manages, and whether they may post to each. No tokens. */
  static async listPages(userId: string) {
    const key = requireConfigured();
    const { userToken } = await this.requireConnection(userId, key);
    try {
      const pages = await FacebookGraphService.listPages(userToken);
      return pages.map((p) => ({
        id: p.id,
        name: p.name,
        canPublish: p.tasks.includes("CREATE_CONTENT"),
      }));
    } catch (err) {
      await this.noteTokenFailure(userId, err);
      throw err;
    }
  }

  static async selectPage(userId: string, pageId: string) {
    const key = requireConfigured();
    const { userToken } = await this.requireConnection(userId, key);
    let pages;
    try {
      pages = await FacebookGraphService.listPages(userToken);
    } catch (err) {
      await this.noteTokenFailure(userId, err);
      throw err;
    }
    const page = pages.find((p) => p.id === pageId);
    if (!page) throw notFound("Facebook Page", "FACEBOOK_PAGE_NOT_FOUND");
    if (!page.tasks.includes("CREATE_CONTENT")) {
      throw forbidden(
        "You can't post to this Page. Ask a Page admin to give you content access.",
        "FACEBOOK_PAGE_NO_PUBLISH_ACCESS",
      );
    }
    const updated = await FacebookRepository.updateConnection(userId, {
      pageId: page.id,
      pageName: page.name,
      pageAccessTokenEnc: encryptToken(page.accessToken, key),
    });
    return connectionView(updated);
  }

  /**
   * Removes the connection. Meta is asked to withdraw the grant too, but that
   * is best effort: a token that is already dead is no reason to keep the row.
   * Share history is kept; videos already on Facebook stay there.
   */
  static async disconnect(userId: string) {
    const connection = await FacebookRepository.findConnection(userId);
    if (connection && FACEBOOK_TOKEN_ENCRYPTION_KEY && sharingApp().secret) {
      try {
        await FacebookGraphService.revokePermissions(
          decryptToken(
            connection.userAccessTokenEnc,
            FACEBOOK_TOKEN_ENCRYPTION_KEY,
          ),
        );
      } catch (err) {
        console.warn("[facebook] revoke on disconnect failed", {
          userId,
          code: (err as AppError)?.code,
        });
      }
    }
    await FacebookRepository.deleteConnection(userId);
    return connectionView(null);
  }

  /**
   * The video a post would share: the first of its media this API stored for
   * the author (keys are `users/<uploader>/uploads/...`). A post can hold any
   * link, so someone else's video pasted into it is never sent to Facebook.
   */
  private static videoKeyOf(
    mediaUrls: string[],
    authorId: string,
  ): string | null {
    for (const url of mediaUrls) {
      const key = videoKeyFromUrl(url);
      if (key && VIDEO_KEY.test(key) && key.startsWith(`users/${authorId}/`)) {
        return key;
      }
    }
    return null;
  }

  /**
   * Shares a post's video to the Foxer's selected Page and answers with the
   * share: `processing` once Facebook has it, or `failed` with the reason. A
   * share already live or in progress is a 409 instead of being sent again.
   */
  static async share(userId: string, postId: string) {
    const key = requireConfigured();
    const { connection } = await this.requireConnection(userId, key);
    if (!connection.pageId || !connection.pageAccessTokenEnc) {
      throw conflict(
        "Choose a Facebook Page first.",
        "FACEBOOK_PAGE_NOT_SELECTED",
      );
    }

    const post = await FacebookRepository.findPostForShare(postId);
    if (!post || post.isArchived) throw notFound("Post");
    if (post.authorId !== userId) {
      throw forbidden("You can only share your own posts.", "NOT_POST_AUTHOR");
    }
    if (post.visibility !== "public") {
      throw badRequest(
        "Only public posts can be shared to Facebook.",
        "POST_NOT_PUBLIC",
      );
    }
    const videoKey = this.videoKeyOf(post.mediaUrls, post.authorId);
    if (!videoKey) {
      throw badRequest("This post has no video to share.", "POST_HAS_NO_VIDEO");
    }
    if (!isVideoStorageConfigured()) {
      throw new AppError(
        "Video storage isn't available right now.",
        503,
        "VIDEO_STORAGE_NOT_CONFIGURED",
      );
    }

    const share = await this.claim(userId, post.id, connection);

    try {
      const video = await getVideoObject(videoKey);
      if (!video) {
        throw new AppError(
          "This post's video file couldn't be found.",
          422,
          "VIDEO_SOURCE_MISSING",
        );
      }
      const { videoId } = await FacebookGraphService.uploadPageVideo({
        pageId: connection.pageId,
        pageToken: decryptToken(connection.pageAccessTokenEnc, key),
        video: video.body,
        contentType: video.contentType,
        description: post.content.slice(0, MAX_DESCRIPTION),
      });
      const updated = await FacebookRepository.updateShare(share.id, {
        status: "processing",
        facebookVideoId: videoId,
      });
      return toShareView(updated);
    } catch (err) {
      const appErr =
        err instanceof AppError && !(err instanceof FacebookGraphError)
          ? err
          : toFacebookError(err);
      await this.noteTokenFailure(userId, appErr);
      const meta = appErr instanceof FacebookGraphError ? appErr : undefined;
      console.error("[facebook] share failed", {
        userId,
        postId,
        shareId: share.id,
        code: appErr.code,
        metaCode: meta?.metaCode,
        metaMessage: meta?.metaMessage,
      });
      const failed = await FacebookRepository.updateShare(share.id, {
        status: "failed",
        errorCode: appErr.code,
        errorMessage: appErr.message,
      });
      return toShareView(failed);
    }
  }

  /** Starts an attempt: a new row, or a failed/stuck one taken back. */
  private static async claim(
    userId: string,
    postId: string,
    connection: FacebookConnection,
  ): Promise<FacebookShare> {
    const pageId = connection.pageId as string;
    const existing = await FacebookRepository.findShare(postId, pageId);
    if (!existing) {
      try {
        return await FacebookRepository.createShare({
          postId,
          userId,
          pageId,
          pageName: connection.pageName,
        });
      } catch (err) {
        // A second click got here first and is sending the video now.
        if ((err as { code?: string })?.code === "P2002") {
          const raced = await FacebookRepository.findShare(postId, pageId);
          throw alreadyShared(raced);
        }
        throw err;
      }
    }
    const staleBefore = new Date(Date.now() - STALE_PUBLISHING_MS);
    if (await FacebookRepository.claimShareForRetry(existing.id, staleBefore)) {
      const retried = await FacebookRepository.updateShare(existing.id, {
        pageName: connection.pageName,
      });
      return retried;
    }
    throw alreadyShared(await FacebookRepository.findShare(postId, pageId));
  }

  /**
   * The Foxer's latest share of a post. While Facebook is still processing the
   * video, asks Meta where it is and records the answer.
   */
  static async getShare(userId: string, postId: string) {
    const share = await FacebookRepository.findLatestShare(postId, userId);
    if (!share) return null;
    if (
      share.status !== "processing" ||
      !share.facebookVideoId ||
      !FACEBOOK_TOKEN_ENCRYPTION_KEY
    ) {
      return toShareView(share);
    }
    const connection = await FacebookRepository.findConnection(userId);
    if (!connection?.pageAccessTokenEnc || connection.pageId !== share.pageId) {
      return toShareView(share);
    }
    try {
      const status = await FacebookGraphService.getVideoStatus(
        share.facebookVideoId,
        decryptToken(
          connection.pageAccessTokenEnc,
          FACEBOOK_TOKEN_ENCRYPTION_KEY,
        ),
      );
      if (status.videoStatus === "ready") {
        return toShareView(
          await FacebookRepository.updateShare(share.id, {
            status: "published",
            permalinkUrl: status.permalinkUrl ?? null,
            publishedAt: new Date(),
          }),
        );
      }
      if (status.videoStatus === "error") {
        return toShareView(
          await FacebookRepository.updateShare(share.id, {
            status: "failed",
            errorCode: "FACEBOOK_VIDEO_REJECTED",
            errorMessage: "Facebook couldn't process this video.",
          }),
        );
      }
      return toShareView(share);
    } catch (err) {
      // A status check that fails says nothing about the video; keep waiting.
      await this.noteTokenFailure(userId, err);
      return toShareView(share);
    }
  }
}

function alreadyShared(share: FacebookShare | null): AppError {
  const live = share?.status === "published" || share?.status === "processing";
  const err = conflict(
    live
      ? "This video is already shared to your Facebook Page."
      : "This video is being shared to Facebook right now.",
    live ? "ALREADY_SHARED" : "SHARE_IN_PROGRESS",
  );
  return Object.assign(err, { share: share ? toShareView(share) : null });
}
