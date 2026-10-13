import "server-only";

/**
 * In-memory sliding-window rate limiter for sign-in and other sensitive
 * admin operations. Suitable for a single-instance admin portal; swap for a
 * shared store if the portal is ever run multi-instance.
 */

type Bucket = { attempts: number[] };

// globalThis survives Next.js dev HMR module reloads.
const globalStore = globalThis as typeof globalThis & {
  __adminRateLimitStore?: Map<string, Bucket>;
};
const store: Map<string, Bucket> = (globalStore.__adminRateLimitStore ??= new Map());

// Bound memory even under a flood of distinct keys (e.g. spoofed IPs).
const MAX_BUCKETS = 10_000;

export type RateLimitPolicy = {
  maxAttempts: number;
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export function checkRateLimit(key: string, policy: RateLimitPolicy): RateLimitResult {
  const now = Date.now();

  if (store.size >= MAX_BUCKETS) {
    store.clear();
  }

  const bucket = store.get(key) ?? { attempts: [] };
  const windowStart = now - policy.windowMs;
  bucket.attempts = bucket.attempts.filter((timestamp) => timestamp > windowStart);

  if (bucket.attempts.length >= policy.maxAttempts) {
    const oldest = bucket.attempts[0];
    const retryAfterMs = oldest + policy.windowMs - now;
    store.set(key, bucket);
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }

  bucket.attempts.push(now);
  store.set(key, bucket);
  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetRateLimitsForTests(): void {
  store.clear();
}
