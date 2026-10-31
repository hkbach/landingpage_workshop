// YouTube helpers for the `video` section (FR-SITE-02). Pure and dependency-free so the API can reuse them.
// Only the 11-character video ID is ever stored; the raw URL is discarded after parsing.

export const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

const MAX_URL_LENGTH = 2048;
const WATCH_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);

export function isYoutubeId(value: unknown): value is string {
  return typeof value === "string" && YOUTUBE_ID_RE.test(value);
}

/**
 * Extract the video ID from a YouTube link, or null when the value is not an accepted link.
 * Accepted: youtube.com/watch?v=, youtu.be/, youtube.com/shorts/, youtube.com/embed/ (also www. and m.),
 * over http(s) only, with any extra query params. Every other host is rejected, including lookalikes
 * (youtube.com.evil.com) and userinfo tricks (https://youtube.com@evil.com).
 */
export function parseYoutubeId(input: string): string | null {
  if (typeof input !== "string") return null;
  const raw = input.trim();
  if (!raw || raw.length > MAX_URL_LENGTH) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || url.port) return null;

  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);

  let candidate: string | null | undefined;
  if (host === "youtu.be") {
    if (segments.length !== 1) return null;
    candidate = segments[0];
  } else if (WATCH_HOSTS.has(host)) {
    if (segments.length === 1 && segments[0] === "watch") candidate = url.searchParams.get("v");
    else if (segments.length === 2 && (segments[0] === "shorts" || segments[0] === "embed")) candidate = segments[1];
    else return null;
  } else {
    return null;
  }
  return isYoutubeId(candidate) ? candidate : null;
}

export function youtubeThumbnailUrl(id: string): string {
  if (!isYoutubeId(id)) throw new Error("Invalid YouTube video id");
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/** Privacy-enhanced embed URL (youtube-nocookie.com). Autoplay is used only after the visitor clicks Play. */
export function youtubeEmbedUrl(id: string): string {
  if (!isYoutubeId(id)) throw new Error("Invalid YouTube video id");
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
}

/** A video section holds at most this many YouTube videos (v1.2). */
export const MAX_SECTION_VIDEOS = 5;

/**
 * Props of a `video` section after the single-video -> list change (section schema v2).
 * v1 stored `videoId: string`; v2 stores `videos: string[]` (validated IDs, "" = an empty slot while editing).
 * Idempotent: v2 props pass through unchanged apart from being clamped to the maximum.
 */
export function migrateVideoProps(props: Record<string, unknown>): Record<string, unknown> {
  const { videoId, videos, ...rest } = props;
  let list: unknown[];
  if (Array.isArray(videos)) list = videos;
  else if (typeof videoId === "string" && videoId !== "") list = [videoId];
  else list = [];
  return { ...rest, videos: list.filter((v): v is string => typeof v === "string").slice(0, MAX_SECTION_VIDEOS) };
}
