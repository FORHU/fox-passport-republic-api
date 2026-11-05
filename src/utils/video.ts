import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  FFMPEG_PATH,
  FFPROBE_PATH,
  VIDEO_MAX_OUTPUT_BYTES,
  VIDEO_MAX_SECONDS,
  VIDEO_TRANSCODE_CONCURRENCY,
  VIDEO_TRANSCODE_TIMEOUT_MS,
} from "../config";
import { AppError } from "./errors";

/**
 * Every video that is uploaded is re-encoded here, so nobody has to compress
 * one by hand and what is streamed is small:
 *
 *  - 9:16, 720x1280 (a landscape clip sits on a blurred copy of itself, a
 *    vertical one fills the frame), H.264 main profile, AAC 64k.
 *  - About 3MB for 30 seconds: constant quality, capped by a bitrate ceiling.
 *    If a busy clip still comes out over the limit it is encoded again with a
 *    lower ceiling.
 *  - The index (moov) at the front, so playback starts before the download
 *    ends, and a keyframe every two seconds, so a seek or a slow start costs
 *    little.
 *  - A poster frame, shown while the video loads.
 */

export const VIDEO_WIDTH = 720;
export const VIDEO_HEIGHT = 1280;
/** Video bitrate ceilings, in kbit/s, tried in turn until the file fits. */
export const VIDEO_MAXRATE_STEPS_KBPS = [800, 600, 450] as const;
const MAX_FPS = 30;
/** A clip trimmed by a phone is rarely exactly 30.000s. */
const DURATION_TOLERANCE_SEC = 0.5;

export interface VideoInfo {
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
}

export interface OptimizedVideo {
  video: Buffer;
  poster: Buffer;
  durationSec: number;
  width: number;
  height: number;
  /** The video bitrate ceiling the stored file was encoded with. */
  maxrateKbps: number;
}

// --- Running ffmpeg ---------------------------------------------------------

/** Lets only so many encodes run at once, so a burst of uploads queues. */
class Limiter {
  private active = 0;
  private waiting: (() => void)[] = [];

  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      this.waiting.shift()?.();
    }
  }
}

const limiter = new Limiter(Math.max(1, VIDEO_TRANSCODE_CONCURRENCY));

function exec(
  bin: string,
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${bin} took longer than ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on("data", (d) => (stdout += d));
    // ffmpeg is chatty; the end of its log is what explains a failure.
    child.stderr.on("data", (d) => {
      stderr = (stderr + d).slice(-4000);
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${bin} exited with ${code}: ${stderr.trim()}`));
    });
  });
}

// --- Reading a video --------------------------------------------------------

function parseRate(rate: unknown): number {
  if (typeof rate !== "string") return 0;
  const [n, d] = rate.split("/").map(Number);
  if (!n || !d) return 0;
  return n / d;
}

export async function probeVideo(file: string): Promise<VideoInfo> {
  const { stdout } = await exec(
    FFPROBE_PATH,
    [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      file,
    ],
    30_000,
  );
  const json = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: {
      codec_type?: string;
      width?: number;
      height?: number;
      avg_frame_rate?: string;
      duration?: string;
      tags?: { rotate?: string };
      side_data_list?: { rotation?: number }[];
    }[];
  };
  const streams = json.streams ?? [];
  const v = streams.find((s) => s.codec_type === "video");
  if (!v?.width || !v.height) {
    throw new AppError(
      "We couldn't read that video. Try another file.",
      400,
      "VIDEO_UNREADABLE",
    );
  }
  // A phone clip is often stored sideways with a rotation flag; ffmpeg turns
  // it upright when it encodes, so the sizes are swapped to match.
  const rotation = Math.abs(
    Number(v.side_data_list?.find((d) => d.rotation !== undefined)?.rotation) ||
      Number(v.tags?.rotate) ||
      0,
  );
  const sideways = rotation === 90 || rotation === 270;
  const duration = Number(json.format?.duration ?? v.duration);
  return {
    durationSec: Number.isFinite(duration) ? duration : 0,
    width: sideways ? v.height : v.width,
    height: sideways ? v.width : v.height,
    fps: parseRate(v.avg_frame_rate),
    hasAudio: streams.some((s) => s.codec_type === "audio"),
  };
}

/** Throws the message the uploader sees when a video is not acceptable. */
export function assertAcceptable(info: VideoInfo): void {
  if (!(info.durationSec > 0)) {
    throw new AppError(
      "We couldn't read that video. Try another file.",
      400,
      "VIDEO_UNREADABLE",
    );
  }
  if (info.durationSec > VIDEO_MAX_SECONDS + DURATION_TOLERANCE_SEC) {
    throw new AppError(
      `Videos can be at most ${VIDEO_MAX_SECONDS} seconds. This one is ${Math.ceil(
        info.durationSec,
      )} seconds.`,
      400,
      "VIDEO_TOO_LONG",
    );
  }
}

// --- Encoding ---------------------------------------------------------------

/**
 * The picture is made 720x1280 two ways at once and laid over each other: a
 * blurred copy that fills the frame, and the clip itself fitted inside it. A
 * vertical clip covers the blur completely; a landscape one sits in the middle
 * of it.
 */
export const VIDEO_FILTER =
  `[0:v]split[a][b];` +
  `[a]scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=increase,` +
  `crop=${VIDEO_WIDTH}:${VIDEO_HEIGHT},boxblur=24:6[bg];` +
  `[b]scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=decrease[fg];` +
  `[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p[v]`;

export function buildFfmpegArgs(params: {
  input: string;
  output: string;
  info: VideoInfo;
  maxrateKbps: number;
}): string[] {
  const { input, output, info, maxrateKbps } = params;
  return [
    "-y",
    "-v",
    "error",
    "-i",
    input,
    // Never let a clip run past the limit, whatever the container claims.
    "-t",
    String(VIDEO_MAX_SECONDS),
    "-filter_complex",
    VIDEO_FILTER,
    "-map",
    "[v]",
    ...(info.hasAudio ? ["-map", "0:a:0"] : []),
    "-c:v",
    "libx264",
    "-profile:v",
    "main",
    "-level",
    "3.1",
    "-preset",
    "medium",
    // Constant quality, with a ceiling so a busy clip cannot balloon.
    "-crf",
    "27",
    "-maxrate",
    `${maxrateKbps}k`,
    "-bufsize",
    `${maxrateKbps * 2}k`,
    ...(info.fps > MAX_FPS ? ["-r", String(MAX_FPS)] : []),
    // A keyframe every two seconds at 30fps.
    "-g",
    "60",
    "-keyint_min",
    "60",
    "-sc_threshold",
    "0",
    ...(info.hasAudio
      ? ["-c:a", "aac", "-b:a", "64k", "-ac", "2", "-ar", "44100"]
      : ["-an"]),
    // The index first, so it plays before it has finished downloading.
    "-movflags",
    "+faststart",
    output,
  ];
}

/** Checks, re-encodes and takes a poster, from the uploaded bytes. */
export async function optimizeVideo(input: Buffer): Promise<OptimizedVideo> {
  return limiter.run(async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fox-video-"));
    try {
      const source = path.join(dir, "source");
      await fs.writeFile(source, input);

      let info: VideoInfo;
      try {
        info = await probeVideo(source);
      } catch (e) {
        if (e instanceof AppError) throw e;
        throw new AppError(
          "We couldn't read that video. Try another file.",
          400,
          "VIDEO_UNREADABLE",
        );
      }
      assertAcceptable(info);

      const output = path.join(dir, "out.mp4");
      let maxrateKbps: number = VIDEO_MAXRATE_STEPS_KBPS[0];
      for (const step of VIDEO_MAXRATE_STEPS_KBPS) {
        maxrateKbps = step;
        try {
          await exec(
            FFMPEG_PATH,
            buildFfmpegArgs({ input: source, output, info, maxrateKbps: step }),
            VIDEO_TRANSCODE_TIMEOUT_MS,
          );
        } catch (e) {
          console.error("[video] encode failed:", (e as Error).message);
          throw new AppError(
            "We couldn't process that video. Try another file.",
            422,
            "VIDEO_PROCESSING_FAILED",
          );
        }
        if ((await fs.stat(output)).size <= VIDEO_MAX_OUTPUT_BYTES) break;
      }

      // The poster: a frame a little way in, so it is not a black first frame.
      const posterPath = path.join(dir, "poster.jpg");
      const at = Math.min(0.5, Math.max(0, info.durationSec / 2));
      await exec(
        FFMPEG_PATH,
        [
          "-y",
          "-v",
          "error",
          "-ss",
          String(at),
          "-i",
          output,
          "-frames:v",
          "1",
          "-q:v",
          "5",
          posterPath,
        ],
        30_000,
      ).catch((e) => {
        console.error("[video] poster failed:", (e as Error).message);
        throw new AppError(
          "We couldn't process that video. Try another file.",
          422,
          "VIDEO_PROCESSING_FAILED",
        );
      });

      return {
        video: await fs.readFile(output),
        poster: await fs.readFile(posterPath),
        durationSec: Math.min(info.durationSec, VIDEO_MAX_SECONDS),
        width: VIDEO_WIDTH,
        height: VIDEO_HEIGHT,
        maxrateKbps,
      };
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
}
