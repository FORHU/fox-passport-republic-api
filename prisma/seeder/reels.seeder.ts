import "dotenv/config";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { FeedTab, PostType, PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { S3_ENDPOINT } from "../../src/config";
import { getGetObjectPresignedUrl, uploadToS3 } from "../../src/utils/s3";

/**
 * Sample reels for the Republic feed, to see the Reels view, the autoplay in
 * the feed and the Reels shelf without uploading by hand.
 *
 * Generates a few vertical clips with ffmpeg (720x1280, H.264 and AAC, ten
 * seconds, a few hundred KB each) with a poster beside each, as the upload
 * pipeline would leave them, puts them in the local MinIO bucket and adds a
 * feed post for each.
 *
 *   pnpm seed:reels
 *
 * Needs ffmpeg on the PATH. Writes to local MinIO only (S3_ENDPOINT): the API
 * keeps videos in real S3 on purpose, so this refuses to run anywhere else.
 * Running it again replaces its own reels (`seed-reel-*`) and nothing else.
 *
 * It only reads users and writes posts, so unlike the main seed it does not
 * need every migration applied, and it does not check for them.
 */

const execFileAsync = promisify(execFile);

const SECONDS = 10;
const KEY_PREFIX = "seed/reels";

type Reel = {
  id: string;
  title: string;
  content: string;
  tab: FeedTab;
  authorEmail: string;
  colors: [string, string, string];
  toneHz: number;
};

const REELS: Reel[] = [
  {
    id: "seed-reel-1",
    title: "SUNSET SET",
    content:
      "Golden hour on the rooftop, the whole crowd singing along. 🌅 #sunset #rooftop",
    tab: FeedTab.community,
    authorEmail: "jasmine.reyes@foxers.ph",
    colors: ["0xff7a18", "0xaf002d", "0x1d1b4b"],
    toneHz: 196,
  },
  {
    id: "seed-reel-2",
    title: "STUDIO TOUR",
    content:
      "A quick walk through our new recording room. Booking is open! 🎙️ #studio",
    tab: FeedTab.marketplace,
    authorEmail: "marco.santos@foxers.ph",
    colors: ["0x0b3d2e", "0xceff00", "0x111827"],
    toneHz: 220,
  },
  {
    id: "seed-reel-3",
    title: "OPEN MIC NIGHT",
    content:
      "Thursday open mic never disappoints. Come play with us. 🎸 #openmic",
    tab: FeedTab.community,
    authorEmail: "sarah.lim@foxers.ph",
    colors: ["0x3a0ca3", "0x7209b7", "0xf72585"],
    toneHz: 247,
  },
  {
    id: "seed-reel-4",
    title: "GEAR CHECK",
    content:
      "Fresh speakers just landed, ready to rent for your next event. 🔊 #gear",
    tab: FeedTab.marketplace,
    authorEmail: "user@example.com",
    colors: ["0x0f2027", "0x2c5364", "0x00b4d8"],
    toneHz: 262,
  },
  {
    id: "seed-reel-5",
    title: "PARTNER SPOTLIGHT",
    content: "Meet the venue behind last weekend's sold-out show. 🦊 #partners",
    tab: FeedTab.partners,
    authorEmail: "partner@example.com",
    colors: ["0x134e5e", "0x71b280", "0xfdfc47"],
    toneHz: 294,
  },
  {
    id: "seed-reel-6",
    title: "BACKSTAGE",
    content:
      "Five minutes before doors. The nerves, the laughs, the setlist. 🎤 #backstage",
    tab: FeedTab.community,
    authorEmail: "ef-01@foxers.ph",
    colors: ["0x232526", "0x414345", "0xe94560"],
    toneHz: 330,
  },
  {
    id: "seed-reel-7",
    title: "BEACH BASH",
    content: "Boracay beach party, sunset to sunrise. 🏝️ #boracay #beach",
    tab: FeedTab.community,
    authorEmail: "gf-01@foxers.ph",
    colors: ["0x00c6ff", "0x0072ff", "0xffe259"],
    toneHz: 349,
  },
  {
    id: "seed-reel-8",
    title: "LIGHTS AND SOUND",
    content: "Our crew rigging a full stage in under an hour. ⚡ #crew #stage",
    tab: FeedTab.partners,
    authorEmail: "sf-01@foxers.ph",
    colors: ["0x1f1c2c", "0x928dab", "0xff9966"],
    toneHz: 392,
  },
];

// Where each system keeps a bold font, for the title on the clip. Without one
// the clips still render, just without the words.
const FONT_CANDIDATES = [
  "C:/Windows/Fonts/arialbd.ttf",
  "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
];

async function ffmpegExists(): Promise<boolean> {
  try {
    await execFileAsync("ffmpeg", ["-version"]);
    return true;
  } catch {
    return false;
  }
}

// A font path in a filter: backslashes forward, and the drive colon escaped.
const filterPath = (p: string) => p.replace(/\\/g, "/").replace(/:/g, "\\:");

async function makeClip(reel: Reel, dir: string, font?: string) {
  const video = join(dir, `${reel.id}.mp4`);
  const poster = join(dir, `${reel.id}.jpg`);
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
    `gradients=s=720x1280:r=30:d=${SECONDS}:c0=${c0}:c1=${c1}:c2=${c2}:nb_colors=3:speed=0.04`,
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=${reel.toneHz}:duration=${SECONDS}`,
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
    String(SECONDS),
    video,
  ]);

  // The poster is a frame from the clip, one second in, so it carries the title.
  await execFileAsync("ffmpeg", [
    "-y",
    "-ss",
    "1",
    "-i",
    video,
    "-frames:v",
    "1",
    "-q:v",
    "4",
    poster,
  ]);

  return { video, poster };
}

async function main() {
  if (!S3_ENDPOINT) {
    throw new Error(
      "seed:reels writes to the local MinIO only, and S3_ENDPOINT is not set. " +
        "The API keeps videos in real S3 on purpose, so this will not run against it.",
    );
  }
  if (!(await ffmpegExists())) {
    throw new Error(
      "ffmpeg is not on the PATH. Install it, then run this again.",
    );
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const dir = await mkdtemp(join(tmpdir(), "seed-reels-"));

  try {
    const users = await prisma.user.findMany({
      where: { email: { in: REELS.map((r) => r.authorEmail) } },
      select: { id: true, email: true },
    });
    const byEmail = new Map(users.map((u) => [u.email, u.id]));
    const fallback = await prisma.user.findFirst({
      where: { email: "user@example.com" },
      select: { id: true },
    });
    if (!fallback) {
      throw new Error(
        "No seeded users found. Run the main seed first (pnpm seed).",
      );
    }

    const font = FONT_CANDIDATES.find((f) => existsSync(f));
    if (!font) {
      console.warn("No bold font found: the clips will have no title text.");
    }

    // The previous run's reels go first; their likes and comments go with them.
    const removed = await prisma.post.deleteMany({
      where: { id: { startsWith: "seed-reel-" } },
    });
    if (removed.count > 0) {
      console.log(`Replacing ${removed.count} earlier reels.`);
    }

    const now = Date.now();
    for (const [i, reel] of REELS.entries()) {
      process.stdout.write(`${reel.id}: making the clip... `);
      const files = await makeClip(reel, dir, font);

      const videoKey = `${KEY_PREFIX}/${reel.id}.mp4`;
      const posterKey = `${KEY_PREFIX}/${reel.id}.jpg`;
      await uploadToS3({
        key: videoKey,
        body: await readFile(files.video),
        contentType: "video/mp4",
      });
      await uploadToS3({
        key: posterKey,
        body: await readFile(files.poster),
        contentType: "image/jpeg",
      });
      const url = await getGetObjectPresignedUrl({ key: videoKey });

      await prisma.post.create({
        data: {
          id: reel.id,
          authorId: byEmail.get(reel.authorEmail) ?? fallback.id,
          type: PostType.citizen_experience,
          tab: reel.tab,
          content: reel.content,
          mediaUrls: [url],
          likesCount: 0,
          commentsCount: 0,
          // Newest first in the order listed, a few minutes apart, so they sit
          // together near the top of the feed.
          createdAt: new Date(now - i * 5 * 60_000),
        },
      });
      console.log("posted.");
    }

    console.log(
      `\nSeeded ${REELS.length} reels. Open the Republic and switch to Reels.\n` +
        "On a phone over USB, make local storage reachable: adb reverse tcp:9000 tcp:9000",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("Seeding reels failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
