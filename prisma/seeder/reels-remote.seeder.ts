import "dotenv/config";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

/**
 * Sample reels on a running environment (dev), through the API.
 *
 * `pnpm seed:reels` writes straight to the local database and MinIO, and Deploy
 * Dev never runs seeds, so dev has no reels to try on a phone. This seeds them
 * the way the app posts one: sign in as a seeded account, upload the clip to
 * `POST /api/v1/files/upload-direct` (which re-encodes it to 9:16 720x1280,
 * makes the poster and enforces the 30-second limit), then create the post with
 * `POST /api/v1/feed`. No database or S3 access is needed, only the URL.
 *
 *   SEED_API_URL=https://dev.foxpassport.com pnpm seed:reels:remote
 *   pnpm seed:reels:remote --check-limit   # also confirm a 31 s clip is refused
 *
 * Needs ffmpeg on the PATH and the main seed's accounts on the target. It
 * refuses any host other than localhost or dev.* unless --force is passed.
 * Running it again deletes its own earlier posts (those with #seedreel) first.
 */

const execFileAsync = promisify(execFile);

const MARKER = "#seedreel";
const SEED_PASSWORD = "Password123!";
const LIMIT_SECONDS = 30;

type Reel = {
  title: string;
  content: string;
  authorEmail: string;
  seconds: number;
  colors: [string, string, string];
  toneHz: number;
};

// One per length the app should handle, up to the 30-second limit.
const REELS: Reel[] = [
  {
    title: "SUNSET SET",
    content:
      "Golden hour on the rooftop, the whole crowd singing along. 🌅 #sunset",
    authorEmail: "jasmine.reyes@foxers.ph",
    seconds: 10,
    colors: ["0xff7e5f", "0xfeb47b", "0x6a3093"],
    toneHz: 440,
  },
  {
    title: "STUDIO TOUR",
    content:
      "A quick look around the studio before tonight's session. 🎧 #studio",
    authorEmail: "marco.santos@foxers.ph",
    seconds: 15,
    colors: ["0x0f2027", "0x2c5364", "0x00c9ff"],
    toneHz: 494,
  },
  {
    title: "OPEN MIC NIGHT",
    content: "Open mic night, every seat taken. 🎤 #openmic",
    authorEmail: "sarah.lim@foxers.ph",
    seconds: 20,
    colors: ["0x00c9ff", "0x92fe9d", "0x1d976c"],
    toneHz: 523,
  },
  {
    title: "BEACH BASH",
    content: "Boracay beach party, sunset to sunrise. 🏝️ #beach",
    authorEmail: "user@example.com",
    seconds: LIMIT_SECONDS,
    colors: ["0xf7971e", "0xffd200", "0xf12711"],
    toneHz: 659,
  },
];

const FONT_CANDIDATES = [
  "C:/Windows/Fonts/arialbd.ttf",
  "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
];

// A font path in a filter: backslashes forward, and the drive colon escaped.
const filterPath = (p: string) => p.replace(/\\/g, "/").replace(/:/g, "\\:");

async function ffmpegExists(): Promise<boolean> {
  try {
    await execFileAsync("ffmpeg", ["-version"]);
    return true;
  } catch {
    return false;
  }
}

async function makeClip(
  reel: Pick<Reel, "title" | "seconds" | "colors" | "toneHz">,
  file: string,
  font?: string,
) {
  const [c0, c1, c2] = reel.colors;
  const text = font
    ? `,drawtext=fontfile='${filterPath(font)}':text='${reel.title}':` +
      `fontsize=64:fontcolor=white:x=(w-text_w)/2:y=h*0.42:` +
      `shadowcolor=black@0.6:shadowx=3:shadowy=3,` +
      `drawtext=fontfile='${filterPath(font)}':text='%{eif\\:t\\:d}':` +
      `fontsize=140:fontcolor=white@0.85:x=(w-text_w)/2:y=h*0.52`
    : "";

  await execFileAsync("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `gradients=s=720x1280:r=30:d=${reel.seconds}:c0=${c0}:c1=${c1}:c2=${c2}:nb_colors=3:speed=0.04`,
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=${reel.toneHz}:duration=${reel.seconds}`,
    "-vf",
    `format=yuv420p${text}`,
    "-af",
    "volume=0.08",
    "-c:v",
    "libx264",
    "-profile:v",
    "main",
    "-preset",
    "veryfast",
    "-crf",
    "30",
    "-g",
    "60",
    "-r",
    "30",
    "-movflags",
    "+faststart",
    "-c:a",
    "aac",
    "-b:a",
    "64k",
    "-t",
    String(reel.seconds),
    file,
  ]);
}

/** Refuses anything but a local or dev.* API unless --force is given. */
export function assertSafeTarget(baseUrl: string, force: boolean): URL {
  const url = new URL(baseUrl);
  const host = url.hostname;
  const allowed =
    host === "localhost" || host === "127.0.0.1" || host.startsWith("dev.");
  if (!allowed && !force) {
    throw new Error(
      `${host} is not localhost or dev.*. Pass --force if you really mean to post sample reels there.`,
    );
  }
  return url;
}

type Session = { token: string; userId: string };

class Api {
  constructor(private readonly base: string) {}

  private async call(
    path: string,
    init: RequestInit & { token?: string } = {},
  ): Promise<{
    status: number;
    body: Record<string, unknown>;
    retryAfter: string | null;
  }> {
    const headers = new Headers(init.headers);
    headers.set("Origin", this.base);
    if (init.token) headers.set("Authorization", `Bearer ${init.token}`);
    const res = await fetch(`${this.base}${path}`, { ...init, headers });
    const body = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    return {
      status: res.status,
      body,
      retryAfter: res.headers.get("retry-after"),
    };
  }

  private signInOnce(email: string) {
    return this.call("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: SEED_PASSWORD }),
    });
  }

  async signIn(email: string): Promise<Session> {
    // Sign-in is rate limited; wait out a 429 rather than fail the whole run.
    let attempt = 0;
    let res = await this.signInOnce(email);
    while (res.status === 429 && attempt < 5) {
      attempt += 1;
      const wait = Math.max(Number(res.retryAfter) || 0, 10 * attempt);
      console.log(`${email}: sign-in rate limited, retrying in ${wait}s...`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      res = await this.signInOnce(email);
    }
    const { status, body } = res;
    const user = body.user as { id?: string } | undefined;
    if (status !== 200 || typeof body.token !== "string" || !user?.id) {
      throw new Error(
        `Sign-in failed for ${email} (${status}). Is the main seed on the target?`,
      );
    }
    return { token: body.token, userId: user.id };
  }

  /** Returns the uploaded video's URL, or the API's refusal message. */
  async upload(
    session: Session,
    file: string,
  ): Promise<{ url?: string; message?: string; status: number }> {
    const form = new FormData();
    const bytes = await readFile(file);
    form.append("file", new Blob([bytes], { type: "video/mp4" }), "reel.mp4");
    const { status, body } = await this.call("/api/v1/files/upload-direct", {
      method: "POST",
      body: form,
      token: session.token,
    });
    const uploaded = body.file as { url?: string } | undefined;
    return {
      status,
      url: uploaded?.url ?? (body.url as string | undefined),
      message: body.message as string | undefined,
    };
  }

  async createPost(
    session: Session,
    content: string,
    url: string,
  ): Promise<string> {
    const { status, body } = await this.call("/api/v1/feed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "citizen_experience",
        content,
        mediaUrls: [url],
      }),
      token: session.token,
    });
    const post = body.data as { id?: string } | undefined;
    if (status !== 201 || !post?.id) {
      throw new Error(
        `Creating the post failed (${status}): ${String(body.message ?? "")}`,
      );
    }
    return post.id;
  }

  /** Deletes this account's earlier sample reels; returns how many. */
  async removeOwnSeeded(session: Session): Promise<number> {
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const query = new URLSearchParams({
        authorId: session.userId,
        limit: "50",
      });
      if (cursor) query.set("cursor", cursor);
      const { status, body } = await this.call(`/api/v1/feed?${query}`, {
        token: session.token,
      });
      // Without the list, earlier reels can't be found and a second set would
      // be posted; stop instead.
      if (status !== 200 || !Array.isArray(body.data)) {
        throw new Error(`Listing earlier reels failed (${status})`);
      }
      for (const post of (body.data as { id: string; content?: string }[]) ??
        []) {
        if (post.content?.includes(MARKER)) ids.push(post.id);
      }
      cursor = (body.nextCursor as string | null) ?? undefined;
    } while (cursor);

    for (const id of ids) {
      const { status } = await this.call(`/api/v1/feed/${id}`, {
        method: "DELETE",
        token: session.token,
      });
      if (status >= 300)
        throw new Error(`Deleting earlier reel ${id} failed (${status})`);
    }
    return ids.length;
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const base = assertSafeTarget(
    process.env.SEED_API_URL ?? "http://localhost:6002",
    args.has("--force"),
  ).origin;

  if (!(await ffmpegExists())) {
    throw new Error(
      "ffmpeg is not on the PATH. Install it, then run this again.",
    );
  }
  const font = FONT_CANDIDATES.find((f) => existsSync(f));
  if (!font)
    console.warn("No bold font found: the clips will have no title text.");

  const api = new Api(base);
  const dir = await mkdtemp(join(tmpdir(), "seed-reels-remote-"));
  console.log(`Seeding sample reels on ${base}\n`);

  try {
    const sessions = new Map<string, Session>();
    for (const email of new Set(REELS.map((r) => r.authorEmail))) {
      const session = await api.signIn(email);
      sessions.set(email, session);
      const removed = await api.removeOwnSeeded(session);
      if (removed > 0)
        console.log(`${email}: removed ${removed} earlier reel(s).`);
    }

    for (const [i, reel] of REELS.entries()) {
      process.stdout.write(
        `${reel.title} (${reel.seconds}s, ${reel.authorEmail}): `,
      );
      const file = join(dir, `reel-${i}.mp4`);
      await makeClip(reel, file, font);
      const session = sessions.get(reel.authorEmail)!;
      const uploaded = await api.upload(session, file);
      if (!uploaded.url) {
        throw new Error(
          `upload refused (${uploaded.status}): ${uploaded.message ?? ""}`,
        );
      }
      const id = await api.createPost(
        session,
        `${reel.content} ${MARKER}`,
        uploaded.url,
      );
      console.log(`posted ${id}`);
    }

    if (args.has("--check-limit")) {
      // Over the limit: the API must refuse it, so nothing is posted.
      const file = join(dir, "too-long.mp4");
      await makeClip(
        {
          title: "TOO LONG",
          seconds: LIMIT_SECONDS + 1,
          colors: ["0x434343", "0x000000", "0x434343"],
          toneHz: 330,
        },
        file,
        font,
      );
      const session = sessions.get(REELS[0].authorEmail)!;
      const result = await api.upload(session, file);
      if (result.url) {
        throw new Error(
          `A ${LIMIT_SECONDS + 1}s clip was accepted; the 30-second limit is not enforced.`,
        );
      }
      console.log(
        `\n${LIMIT_SECONDS + 1}s clip refused as expected (${result.status}): ${result.message}`,
      );
    }

    console.log(
      `\nSeeded ${REELS.length} reels. Open the Republic and switch to Reels.`,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error("Seeding reels failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
