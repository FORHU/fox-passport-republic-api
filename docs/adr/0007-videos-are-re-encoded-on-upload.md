# Every uploaded video is checked and re-encoded on the server

Videos used to be stored exactly as uploaded, up to 100MB, and streamed from the
video bucket as they came: a 4K phone clip of any length. At scale that is the
largest storage and CDN cost, and the slowest thing to start on a phone. We
decided the server makes every video small and vertical, once, at upload, and
keeps only that. Decided 4 Nov 2026; built in #232.

## Decisions

- **At most 30 seconds.** Longer is refused with a message that says how long
  the clip was (`VIDEO_TOO_LONG`, 400); half a second of slack covers a trimmed
  clip that is not exactly 30.000s. A file ffprobe cannot read is
  `VIDEO_UNREADABLE` (400). The encode itself also stops at 30 seconds.
- **9:16, 720x1280, H.264 main, AAC 64k.** A vertical clip fills the frame; a
  landscape one is fitted over a blurred copy of itself, never stretched or
  cropped away. Frame rate is lowered to 30 when higher, never raised. A clip
  with no sound has no audio track.
- **About 3MB for 30 seconds** (2 to 4MB): constant quality (CRF 27) under a
  bitrate ceiling of 800 kbit/s. If a busy clip still comes out over 4MB it is
  encoded again at 600, then 450 kbit/s. A synthetic 1080x1920, 30s, 43MB clip
  came out at 3.2MB.
- **Starts early and seeks cheaply.** The index is at the front of the file
  (`+faststart`) so playback begins before the download ends; a keyframe every
  two seconds keeps a seek, or a slow start, small.
- **Only the optimized file is stored,** with a small JPEG poster beside it
  (same key, `.jpg`) for the client to show while the video loads. Both are
  uploaded with `Cache-Control: public, max-age=31536000, immutable`: keys are
  fresh random names and the bytes never change, so the CDN and the phone keep
  them and the origin is asked once.
- **Done in the upload request, a few at a time.** `POST /files/upload-direct`
  answers when the encode is done, so a client keeps one simple call. At most
  `VIDEO_TRANSCODE_CONCURRENCY` (default 2) encodes run per server; the rest
  wait; each is killed after `VIDEO_TRANSCODE_TIMEOUT_MS` (default two
  minutes). The answer adds `posterUrl`, `durationSec`, `sizeBytes`, `width`
  and `height` for a video.
- **ffmpeg is in the Docker images** (`apk add ffmpeg`); `FFMPEG_PATH` and
  `FFPROBE_PATH` say where it is when it is not on the PATH.

## Not decided here

- **A lower rendition or HLS ladder** (for example 360p at about 1MB beside the
  720p file) would save more on slow connections, but only once the apps pick a
  rendition by network speed. Until then it would be storage nobody reads. The
  poster and the immutable caching are the part that helps now.
- **Encoding off the request** (a queue and a "processing" state) is the next
  step if encodes grow long or uploads burst; it needs a status on the stored
  file and a client that waits for it.
- **The 100MB upload ceiling** is unchanged. The apps should trim to 30 seconds
  before sending, which is also what saves the uploader's data.
