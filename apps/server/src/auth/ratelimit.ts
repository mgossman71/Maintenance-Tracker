/**
 * Login rate limiting + exponential lockout (§6.4), per IP.
 *
 * Two independent mechanisms:
 *  1. Sliding-window rate limit — caps attempts per window (defeats
 *     distributed slow brute force over time).
 *  2. Lockout — after `lockoutThreshold` consecutive failures, that IP is
 *     fully blocked; each further consecutive failure doubles the block
 *     (exponential backoff), capped. Success resets everything.
 *
 * In-memory by design: a container restart clearing lockouts is acceptable
 * for one master password (argons still cost the attacker ~130 ms/try ×
 * per-IP window), and it keeps zero external state. Clock is injectable so
 * tests pin the exact schedule.
 */

export interface LoginGuardOptions {
  windowMs?: number;
  maxAttempts?: number;
  lockoutThreshold?: number;
  lockoutBaseMs?: number;
  lockoutCapMs?: number;
  now?: () => number;
}

export type GuardDecision =
  | { allowed: true }
  | { allowed: false; retryAfterMs: number; code: "rate_limited" | "locked" };

interface IpState {
  attempts: number[]; // attempt timestamps inside the window
  consecutiveFailures: number;
  lockedUntil: number | null;
}

const DEFAULTS = {
  windowMs: 15 * 60_000, // 15 min
  maxAttempts: 10, // attempts per window before rate limiting
  lockoutThreshold: 5, // consecutive failures before a lockout
  lockoutBaseMs: 30_000, // first lockout: 30 s
  lockoutCapMs: 60 * 60_000, // never beyond 1 h per step
};

export class LoginGuard {
  private readonly opts: Required<Omit<LoginGuardOptions, "now">>;
  private readonly now: () => number;
  private readonly states = new Map<string, IpState>();

  constructor(options: LoginGuardOptions = {}) {
    const { now, ...rest } = options;
    this.opts = { ...DEFAULTS, ...rest };
    this.now = now ?? (() => Date.now());
  }

  /** Call BEFORE processing an attempt. */
  pre(ip: string): GuardDecision {
    const now = this.now();
    const s = this.state(ip);
    s.attempts = s.attempts.filter((t) => now - t < this.opts.windowMs);

    if (s.lockedUntil !== null && now < s.lockedUntil) {
      return { allowed: false, retryAfterMs: s.lockedUntil - now, code: "locked" };
    }
    if (s.attempts.length >= this.opts.maxAttempts) {
      const oldest = s.attempts[0] ?? now;
      return {
        allowed: false,
        retryAfterMs: this.opts.windowMs - (now - oldest),
        code: "rate_limited",
      };
    }
    return { allowed: true };
  }

  /** Call for every attempt that reaches credential verification. */
  recordAttempt(ip: string): void {
    this.state(ip).attempts.push(this.now());
  }

  /** Wrong password: increments the streak and may (re)arm a lockout.
   *  Returns the lockout duration (ms) if this failure armed one. */
  recordFailure(ip: string): number | null {
    const now = this.now();
    const s = this.state(ip);
    s.consecutiveFailures += 1;
    if (s.consecutiveFailures >= this.opts.lockoutThreshold) {
      const exponent = s.consecutiveFailures - this.opts.lockoutThreshold;
      const lockMs = Math.min(this.opts.lockoutBaseMs * 2 ** exponent, this.opts.lockoutCapMs);
      s.lockedUntil = now + lockMs;
      return lockMs;
    }
    return null;
  }

  /** Successful login clears all history for the IP. */
  recordSuccess(ip: string): void {
    this.states.delete(ip);
  }

  private state(ip: string): IpState {
    let s = this.states.get(ip);
    if (!s) {
      s = { attempts: [], consecutiveFailures: 0, lockedUntil: null };
      this.states.set(ip, s);
    }
    return s;
  }
}
