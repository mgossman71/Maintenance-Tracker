/** In-memory login failure backoff. Single-process app by design. */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const LOCKOUT_MS = 15 * 60 * 1000;

interface Bucket {
	failures: number[];
	blockedUntil: number;
}

const buckets = new Map<string, Bucket>();

export function clientKey(ip: string): string {
	return ip;
}

export function isBlocked(key: string): { blocked: boolean; retryAfterSeconds: number } {
	const bucket = buckets.get(key);
	if (!bucket) return { blocked: false, retryAfterSeconds: 0 };
	const now = Date.now();
	if (bucket.blockedUntil > now) {
		return { blocked: true, retryAfterSeconds: Math.ceil((bucket.blockedUntil - now) / 1000) };
	}
	return { blocked: false, retryAfterSeconds: 0 };
}

export function recordFailure(key: string): void {
	const now = Date.now();
	const bucket = buckets.get(key) ?? { failures: [], blockedUntil: 0 };
	bucket.failures = bucket.failures.filter((t) => now - t < WINDOW_MS);
	bucket.failures.push(now);
	if (bucket.failures.length >= MAX_FAILURES) {
		bucket.blockedUntil = now + LOCKOUT_MS;
		bucket.failures = [];
	}
	buckets.set(key, bucket);
}

export function recordSuccess(key: string): void {
	buckets.delete(key);
}

/** Test helper. */
export function resetRateLimits(): void {
	buckets.clear();
}
