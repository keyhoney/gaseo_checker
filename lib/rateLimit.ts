interface Counter {
  count: number;
  windowStart: number;
}

const counters = new Map<string, Counter>();
const cooldownUntil = new Map<string, number>();

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const WINDOW_MS = intFromEnv("RATE_LIMIT_WINDOW_MS", 60_000);
const MAX_REQUESTS_PER_WINDOW = intFromEnv("RATE_LIMIT_MAX_REQUESTS", 8);
const COOLDOWN_MS = intFromEnv("RATE_LIMIT_COOLDOWN_MS", 30_000);

export function evaluateRateLimit(key: string, now: number = Date.now()) {
  const blockedUntil = cooldownUntil.get(key);
  if (blockedUntil && blockedUntil > now) {
    return {
      allowed: false as const,
      retryAfterSec: Math.ceil((blockedUntil - now) / 1000),
      policyStop: true,
    };
  }

  const item = counters.get(key);
  if (!item || now - item.windowStart >= WINDOW_MS) {
    counters.set(key, { count: 1, windowStart: now });
    return { allowed: true as const, retryAfterSec: 0, policyStop: false };
  }

  item.count += 1;
  if (item.count > MAX_REQUESTS_PER_WINDOW) {
    const until = now + COOLDOWN_MS;
    cooldownUntil.set(key, until);
    return {
      allowed: false as const,
      retryAfterSec: Math.ceil(COOLDOWN_MS / 1000),
      policyStop: true,
    };
  }

  return { allowed: true as const, retryAfterSec: 0, policyStop: false };
}

export function getRateLimitConfig() {
  return {
    windowMs: WINDOW_MS,
    maxRequestsPerWindow: MAX_REQUESTS_PER_WINDOW,
    cooldownMs: COOLDOWN_MS,
  };
}

export function __resetRateLimitForTest() {
  counters.clear();
  cooldownUntil.clear();
}
