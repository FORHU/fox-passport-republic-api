import crypto from "crypto";
import axios, { AxiosError } from "axios";
import {
  FACEBOOK_APP_ID,
  FACEBOOK_APP_SECRET,
  FACEBOOK_PAGES_APP_ID,
  FACEBOOK_PAGES_APP_SECRET,
  FACEBOOK_GRAPH_VERSION,
  FACEBOOK_LOGIN_CONFIG_ID,
  FACEBOOK_PAGES_REDIRECT_URI,
} from "../../config";
import { AppError } from "../../utils/errors";

/**
 * The few Graph API calls Page sharing needs, and nothing else. Every call that
 * carries a token also sends `appsecret_proof`, so a leaked token is useless
 * without the app secret (and "Require App Secret" can be switched on in the
 * Meta app). Graph errors become AppErrors with stable codes; Meta's own text
 * is kept on `metaMessage` for the share record and the log, never sent as is.
 */

/**
 * The Meta app Page sharing runs as: its own app when FACEBOOK_PAGES_APP_ID is
 * set, otherwise the sign-in app. Read at call time, never cached.
 */
export function sharingApp(): { id?: string; secret?: string } {
  return FACEBOOK_PAGES_APP_ID
    ? { id: FACEBOOK_PAGES_APP_ID, secret: FACEBOOK_PAGES_APP_SECRET }
    : { id: FACEBOOK_APP_ID, secret: FACEBOOK_APP_SECRET };
}

/** What the Page permission dialog asks for: list Pages, read them, post to them. */
export const FACEBOOK_PAGE_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
] as const;

const graph = () => `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}`;
const graphVideo = () =>
  `https://graph-video.facebook.com/${FACEBOOK_GRAPH_VERSION}`;

const TIMEOUT_MS = 30_000;
// A pre-ADR-0007 video can be up to 100MB; give the upload room to finish.
const UPLOAD_TIMEOUT_MS = 120_000;

export class FacebookGraphError extends AppError {
  constructor(
    message: string,
    status: number,
    code: string,
    public readonly metaCode?: number,
    public readonly metaMessage?: string,
  ) {
    super(message, status, code);
  }
}

interface GraphErrorBody {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
    type?: string;
  };
}

const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);
const TRANSIENT_CODES = new Set([1, 2]);
const VIDEO_REJECTED_CODES = new Set([351, 352, 368, 382, 6000, 6001]);

export function toFacebookError(err: unknown): FacebookGraphError {
  if (err instanceof FacebookGraphError) return err;
  // Not a Graph call at all (reading the video, decrypting a token): a fault on
  // our side, worth another try, never blamed on Facebook.
  if (!axios.isAxiosError(err)) {
    return new FacebookGraphError(
      "Sharing to Facebook failed. Try again.",
      500,
      "FACEBOOK_SHARE_FAILED",
      undefined,
      (err as Error)?.message,
    );
  }
  const axiosErr = err as AxiosError<GraphErrorBody>;
  const body = axiosErr?.response?.data?.error;
  const metaCode = body?.code;
  const metaMessage = body?.message;
  const httpStatus = axiosErr?.response?.status;

  if (!axiosErr?.response || ((httpStatus ?? 0) >= 500 && !metaCode)) {
    return new FacebookGraphError(
      "Facebook isn't responding right now. Try again in a few minutes.",
      503,
      "FACEBOOK_UNAVAILABLE",
      metaCode,
      metaMessage ?? axiosErr?.message,
    );
  }
  if (metaCode === 190) {
    return new FacebookGraphError(
      "Your Facebook connection has expired. Reconnect Facebook and try again.",
      409,
      "FACEBOOK_TOKEN_INVALID",
      metaCode,
      metaMessage,
    );
  }
  if (metaCode === 10 || (metaCode && metaCode >= 200 && metaCode <= 299)) {
    return new FacebookGraphError(
      "FoxPassport doesn't have permission to post to this Page. Reconnect Facebook and allow posting.",
      403,
      "FACEBOOK_PERMISSION_MISSING",
      metaCode,
      metaMessage,
    );
  }
  if (metaCode && VIDEO_REJECTED_CODES.has(metaCode)) {
    return new FacebookGraphError(
      "Facebook didn't accept this video.",
      422,
      "FACEBOOK_VIDEO_REJECTED",
      metaCode,
      metaMessage,
    );
  }
  if (
    (metaCode &&
      (RATE_LIMIT_CODES.has(metaCode) || TRANSIENT_CODES.has(metaCode))) ||
    (httpStatus ?? 0) >= 500
  ) {
    return new FacebookGraphError(
      "Facebook isn't responding right now. Try again in a few minutes.",
      503,
      "FACEBOOK_UNAVAILABLE",
      metaCode,
      metaMessage,
    );
  }
  return new FacebookGraphError(
    "Facebook refused the request.",
    502,
    "FACEBOOK_ERROR",
    metaCode,
    metaMessage,
  );
}

function appSecretProof(token: string): string {
  return crypto
    .createHmac("sha256", sharingApp().secret ?? "")
    .update(token)
    .digest("hex");
}

const withToken = (token: string, params: Record<string, string> = {}) => ({
  ...params,
  access_token: token,
  appsecret_proof: appSecretProof(token),
});

async function call<T>(fn: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await fn()).data;
  } catch (err) {
    throw toFacebookError(err);
  }
}

export interface FacebookPage {
  id: string;
  name: string;
  accessToken: string;
  tasks: string[];
}

export default class FacebookGraphService {
  /** The Meta dialog a Foxer is sent to, to allow FoxPassport to post to their Pages. */
  static buildDialogUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: sharingApp().id ?? "",
      redirect_uri: FACEBOOK_PAGES_REDIRECT_URI,
      state,
      response_type: "code",
      // Ask again for anything declined last time, instead of silently
      // returning the same partial grant.
      auth_type: "rerequest",
    });
    if (FACEBOOK_LOGIN_CONFIG_ID) {
      params.set("config_id", FACEBOOK_LOGIN_CONFIG_ID);
    } else {
      params.set("scope", FACEBOOK_PAGE_SCOPES.join(","));
    }
    return `https://www.facebook.com/${FACEBOOK_GRAPH_VERSION}/dialog/oauth?${params}`;
  }

  /** The dialog's code, for a short-lived user token. */
  static async exchangeCode(code: string) {
    const data = await call(() =>
      axios.get<{ access_token: string; expires_in?: number }>(
        `${graph()}/oauth/access_token`,
        {
          timeout: TIMEOUT_MS,
          params: {
            client_id: sharingApp().id,
            client_secret: sharingApp().secret,
            redirect_uri: FACEBOOK_PAGES_REDIRECT_URI,
            code,
          },
        },
      ),
    );
    return { accessToken: data.access_token, expiresIn: data.expires_in };
  }

  /** A short-lived user token, for a long-lived one (about 60 days). */
  static async exchangeLongLived(shortLivedToken: string) {
    const data = await call(() =>
      axios.get<{ access_token: string; expires_in?: number }>(
        `${graph()}/oauth/access_token`,
        {
          timeout: TIMEOUT_MS,
          params: {
            grant_type: "fb_exchange_token",
            client_id: sharingApp().id,
            client_secret: sharingApp().secret,
            fb_exchange_token: shortLivedToken,
          },
        },
      ),
    );
    return { accessToken: data.access_token, expiresIn: data.expires_in };
  }

  static async getMe(userToken: string) {
    return call(() =>
      axios.get<{ id: string; name?: string }>(`${graph()}/me`, {
        timeout: TIMEOUT_MS,
        params: withToken(userToken, { fields: "id,name" }),
      }),
    );
  }

  /** The permissions the Foxer actually granted (they may untick some). */
  static async getGrantedScopes(userToken: string): Promise<string[]> {
    const data = await call(() =>
      axios.get<{ data: { permission: string; status: string }[] }>(
        `${graph()}/me/permissions`,
        { timeout: TIMEOUT_MS, params: withToken(userToken) },
      ),
    );
    return (data.data ?? [])
      .filter((p) => p.status === "granted")
      .map((p) => p.permission);
  }

  /** Every Page the Foxer has a role on, with its Page token and their tasks there. */
  static async listPages(userToken: string): Promise<FacebookPage[]> {
    type PageRow = {
      id: string;
      name: string;
      access_token?: string;
      tasks?: string[];
    };
    type PageList = {
      data: PageRow[];
      paging?: { next?: string; cursors?: { after?: string } };
    };

    // Every batch is asked for the same way, so each carries appsecret_proof;
    // Meta's ready-made `next` link doesn't, and "Require App Secret" refuses it.
    const fetchBatch = (after?: string) =>
      call(() =>
        axios.get<PageList>(`${graph()}/me/accounts`, {
          timeout: TIMEOUT_MS,
          params: withToken(userToken, {
            fields: "id,name,access_token,tasks",
            limit: "100",
            ...(after ? { after } : {}),
          }),
        }),
      );

    const pages: FacebookPage[] = [];
    let data = await fetchBatch();
    // Meta pages the list; ten pages of 100 is far past anyone's real count.
    for (let i = 0; i < 10; i++) {
      for (const row of data.data ?? []) {
        if (!row.access_token) continue;
        pages.push({
          id: row.id,
          name: row.name,
          accessToken: row.access_token,
          tasks: row.tasks ?? [],
        });
      }
      const after = data.paging?.cursors?.after;
      if (!data.paging?.next || !after) break;
      data = await fetchBatch(after);
    }
    return pages;
  }

  /**
   * Publishes a video to a Page, sending the bytes (`source`) rather than a
   * link: the video bucket is private, so Meta could not fetch it.
   */
  static async uploadPageVideo(params: {
    pageId: string;
    pageToken: string;
    video: Buffer;
    contentType: string;
    description: string;
  }): Promise<{ videoId: string }> {
    const form = new FormData();
    for (const [k, v] of Object.entries(withToken(params.pageToken))) {
      form.append(k, v);
    }
    form.append("description", params.description);
    form.append("published", "true");
    form.append(
      "source",
      new Blob([new Uint8Array(params.video)], { type: params.contentType }),
      "foxpassport-video.mp4",
    );

    const data = await call(() =>
      axios.post<{ id: string }>(
        `${graphVideo()}/${encodeURIComponent(params.pageId)}/videos`,
        form,
        {
          timeout: UPLOAD_TIMEOUT_MS,
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        },
      ),
    );
    return { videoId: data.id };
  }

  /** Where Facebook is with a video: `processing`, `ready` (live) or `error`. */
  static async getVideoStatus(videoId: string, pageToken: string) {
    const data = await call(() =>
      axios.get<{
        status?: { video_status?: string };
        permalink_url?: string;
      }>(`${graph()}/${encodeURIComponent(videoId)}`, {
        timeout: TIMEOUT_MS,
        params: withToken(pageToken, { fields: "status,permalink_url" }),
      }),
    );
    const permalink = data.permalink_url;
    return {
      videoStatus: data.status?.video_status,
      permalinkUrl: permalink
        ? new URL(permalink, "https://www.facebook.com").toString()
        : undefined,
    };
  }

  /** Withdraws everything the Foxer granted this app. */
  static async revokePermissions(userToken: string): Promise<void> {
    await call(() =>
      axios.delete(`${graph()}/me/permissions`, {
        timeout: TIMEOUT_MS,
        params: withToken(userToken),
      }),
    );
  }
}
