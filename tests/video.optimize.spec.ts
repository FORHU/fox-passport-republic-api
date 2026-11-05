import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertAcceptable,
  buildFfmpegArgs,
  optimizeVideo,
  probeVideo,
  VIDEO_FILTER,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
} from "../src/utils/video";
import { FFMPEG_PATH, FFPROBE_PATH } from "../src/config";

const hasFfmpeg =
  spawnSync(FFMPEG_PATH, ["-version"]).status === 0 &&
  spawnSync(FFPROBE_PATH, ["-version"]).status === 0;

const info = {
  durationSec: 20,
  width: 1920,
  height: 1080,
  fps: 30,
  hasAudio: true,
};

describe("video rules", () => {
  it("accepts a clip up to 30 seconds, with a little slack", () => {
    expect(() => assertAcceptable({ ...info, durationSec: 30 })).not.toThrow();
    expect(() =>
      assertAcceptable({ ...info, durationSec: 30.4 }),
    ).not.toThrow();
  });

  it("refuses a clip over 30 seconds and says how long it was", () => {
    expect(() => assertAcceptable({ ...info, durationSec: 47.2 })).toThrow(
      /at most 30 seconds.*48 seconds/,
    );
  });

  it("refuses a file with no length", () => {
    expect(() => assertAcceptable({ ...info, durationSec: 0 })).toThrow(
      /couldn't read/,
    );
  });
});

describe("ffmpeg arguments", () => {
  const args = buildFfmpegArgs({
    input: "in",
    output: "out.mp4",
    info,
    maxrateKbps: 800,
  });
  const after = (flag: string) => args[args.indexOf(flag) + 1];

  it("makes a 720x1280 picture, a blurred copy behind a fitted one", () => {
    expect(VIDEO_WIDTH).toBe(720);
    expect(VIDEO_HEIGHT).toBe(1280);
    expect(after("-filter_complex")).toBe(VIDEO_FILTER);
    expect(VIDEO_FILTER).toContain("720:1280");
    expect(VIDEO_FILTER).toContain("boxblur");
  });

  it("caps the length, the bitrate and the keyframe gap", () => {
    expect(after("-t")).toBe("30");
    expect(after("-maxrate")).toBe("800k");
    expect(after("-bufsize")).toBe("1600k");
    expect(after("-g")).toBe("60");
    expect(after("-movflags")).toBe("+faststart");
  });

  it("only lowers the frame rate, and only when it is over 30", () => {
    expect(args).not.toContain("-r");
    const fast = buildFfmpegArgs({
      input: "in",
      output: "out.mp4",
      info: { ...info, fps: 60 },
      maxrateKbps: 800,
    });
    expect(fast[fast.indexOf("-r") + 1]).toBe("30");
  });

  it("leaves the sound out when there is none", () => {
    const silent = buildFfmpegArgs({
      input: "in",
      output: "out.mp4",
      info: { ...info, hasAudio: false },
      maxrateKbps: 800,
    });
    expect(silent).toContain("-an");
    expect(silent).not.toContain("0:a:0");
    expect(args).toContain("0:a:0");
  });
});

describe.skipIf(!hasFfmpeg)("optimizing a real video", () => {
  let dir: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "video-spec-"));
  });
  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /** A synthetic clip: moving test picture, with or without a tone. */
  function makeClip(opts: {
    name: string;
    seconds: number;
    size: string;
    fps?: number;
    audio?: boolean;
    bitrate?: string;
  }) {
    const file = path.join(dir, opts.name);
    const fps = opts.fps ?? 30;
    execFileSync(
      FFMPEG_PATH,
      [
        "-y",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        `testsrc2=size=${opts.size}:rate=${fps}`,
        ...(opts.audio === false
          ? []
          : ["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000"]),
        "-t",
        String(opts.seconds),
        "-c:v",
        "libx264",
        "-b:v",
        opts.bitrate ?? "8M",
        ...(opts.audio === false ? [] : ["-c:a", "aac"]),
        file,
      ],
      { stdio: "pipe" },
    );
    return fs.readFileSync(file);
  }

  async function probeBuffer(buf: Buffer, name: string) {
    const file = path.join(dir, name);
    fs.writeFileSync(file, buf);
    return probeVideo(file);
  }

  /** Where in the file the index (moov) and the media (mdat) start. */
  function boxOffsets(buf: Buffer) {
    return {
      moov: buf.indexOf("moov"),
      mdat: buf.indexOf("mdat"),
    };
  }

  it("turns a landscape 1080p clip into a small vertical 720p one", async () => {
    const src = makeClip({ name: "land.mp4", seconds: 20, size: "1920x1080" });
    const out = await optimizeVideo(src);

    const probed = await probeBuffer(out.video, "land-out.mp4");
    expect(probed.width).toBe(720);
    expect(probed.height).toBe(1280);
    expect(probed.durationSec).toBeGreaterThan(19);
    expect(probed.durationSec).toBeLessThanOrEqual(30.5);
    expect(probed.hasAudio).toBe(true);
    // 20 seconds fits well inside the 3MB a 30 second clip is aimed at.
    expect(out.video.length).toBeLessThan(4 * 1024 * 1024);
    expect(out.video.length).toBeLessThan(src.length);

    // The index is ahead of the media, so it can start playing early.
    const { moov, mdat } = boxOffsets(out.video);
    expect(moov).toBeGreaterThan(0);
    expect(moov).toBeLessThan(mdat);

    // A JPEG poster to show while it loads.
    expect(out.poster.subarray(0, 3).toString("hex")).toBe("ffd8ff");
    expect(out.poster.length).toBeLessThan(200 * 1024);
  }, 120_000);

  it("keeps a 30 second vertical clip near 3MB", async () => {
    const src = makeClip({
      name: "vert.mp4",
      seconds: 30,
      size: "1080x1920",
      bitrate: "12M",
    });
    const out = await optimizeVideo(src);

    const probed = await probeBuffer(out.video, "vert-out.mp4");
    expect(probed.width).toBe(720);
    expect(probed.height).toBe(1280);
    expect(probed.durationSec).toBeLessThanOrEqual(30.5);
    expect(out.video.length).toBeLessThanOrEqual(4 * 1024 * 1024);
    expect(src.length).toBeGreaterThan(out.video.length);
  }, 120_000);

  it("brings a 60fps clip down to 30fps and handles no sound", async () => {
    const src = makeClip({
      name: "fast.mp4",
      seconds: 5,
      size: "1280x720",
      fps: 60,
      audio: false,
    });
    const out = await optimizeVideo(src);
    const probed = await probeBuffer(out.video, "fast-out.mp4");
    expect(probed.fps).toBeLessThanOrEqual(30.1);
    expect(probed.hasAudio).toBe(false);
  }, 120_000);

  it("refuses a clip over 30 seconds before encoding it", async () => {
    const src = makeClip({ name: "long.mp4", seconds: 45, size: "640x360" });
    await expect(optimizeVideo(src)).rejects.toMatchObject({
      code: "VIDEO_TOO_LONG",
      status: 400,
    });
  }, 120_000);

  it("refuses bytes that are not a video", async () => {
    await expect(
      optimizeVideo(Buffer.from("this is not a video at all")),
    ).rejects.toMatchObject({ code: "VIDEO_UNREADABLE", status: 400 });
  }, 60_000);
});
