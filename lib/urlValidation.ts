import { ERROR_MESSAGES } from "@/lib/errors";
import {
  SUPPORTED_PLATFORMS,
  type AnalyzeError,
  type AnalyzeRequest,
  type AnalyzeSuccessData,
  type Platform,
} from "@/lib/types";

const HOST_MATCHERS: Record<Platform, (host: string) => boolean> = {
  naver: (host) => host === "blog.naver.com",
  tistory: (host) => host === "tistory.com" || host.endsWith(".tistory.com"),
  blogspot: (host) => host === "blogspot.com" || host.endsWith(".blogspot.com"),
};

function makeError(code: AnalyzeError["code"]): AnalyzeError {
  return { code, message: ERROR_MESSAGES[code] };
}

function isPlatform(value: string): value is Platform {
  return (SUPPORTED_PLATFORMS as readonly string[]).includes(value);
}

export function normalizeUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return null;
  }

  parsed.hash = "";

  let normalized = parsed.toString();
  if (normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

export function validateAnalyzeInput(
  req: AnalyzeRequest,
): { ok: true; data: AnalyzeSuccessData } | { ok: false; error: AnalyzeError } {
  const rawPlatform = req.platform.trim().toLowerCase();
  if (!isPlatform(rawPlatform)) {
    return { ok: false, error: makeError("UNSUPPORTED_PLATFORM") };
  }

  const normalizedUrl = normalizeUrl(req.url);
  if (!normalizedUrl) {
    return { ok: false, error: makeError("INVALID_URL") };
  }

  const host = new URL(normalizedUrl).hostname.toLowerCase();
  if (!HOST_MATCHERS[rawPlatform](host)) {
    return { ok: false, error: makeError("PLATFORM_MISMATCH") };
  }

  return {
    ok: true,
    data: {
      platform: rawPlatform,
      url: req.url,
      normalizedUrl,
    },
  };
}
