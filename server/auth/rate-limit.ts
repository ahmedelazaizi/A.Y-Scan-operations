type Bucket = { failures: number; windowStartedAt: number; lockedUntil: number }

export type LoginThrottleOptions = {
  maxFailuresPerAccount: number
  maxFailuresPerAddress: number
  windowMs: number
  lockoutMs: number
  now?: () => number
}

export const DEFAULT_LOGIN_THROTTLE: LoginThrottleOptions = {
  maxFailuresPerAccount: 5,
  maxFailuresPerAddress: 20,
  windowMs: 15 * 60 * 1000,
  lockoutMs: 15 * 60 * 1000,
}

const MAX_TRACKED_KEYS = 10_000

/**
 * In-process login throttle keyed by account and by client address.
 * The server runs as a single process on the clinic machine, so in-memory state is sufficient.
 */
export class LoginThrottle {
  private readonly buckets = new Map<string, Bucket>()
  private readonly now: () => number

  constructor(private readonly options: LoginThrottleOptions = DEFAULT_LOGIN_THROTTLE) {
    this.now = options.now ?? Date.now
  }

  /** Milliseconds until another attempt is allowed, or 0 when the attempt may proceed. */
  retryAfterMs(username: string, address: string): number {
    const now = this.now()
    return Math.max(this.lockRemaining(this.accountKey(username), now), this.lockRemaining(this.addressKey(address), now))
  }

  recordFailure(username: string, address: string): void {
    this.bump(this.accountKey(username), this.options.maxFailuresPerAccount)
    this.bump(this.addressKey(address), this.options.maxFailuresPerAddress)
  }

  recordSuccess(username: string): void {
    this.buckets.delete(this.accountKey(username))
  }

  private accountKey(username: string): string {
    return `account:${username.trim().toLowerCase()}`
  }

  private addressKey(address: string): string {
    return `address:${address}`
  }

  private lockRemaining(key: string, now: number): number {
    const bucket = this.buckets.get(key)
    return bucket && bucket.lockedUntil > now ? bucket.lockedUntil - now : 0
  }

  private bump(key: string, limit: number): void {
    const now = this.now()
    const current = this.buckets.get(key)
    const bucket = current && now - current.windowStartedAt < this.options.windowMs
      ? current
      : { failures: 0, windowStartedAt: now, lockedUntil: 0 }
    bucket.failures += 1
    if (bucket.failures >= limit) bucket.lockedUntil = now + this.options.lockoutMs
    this.buckets.set(key, bucket)
    if (this.buckets.size > MAX_TRACKED_KEYS) this.prune(now)
  }

  private prune(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.lockedUntil <= now && now - bucket.windowStartedAt >= this.options.windowMs) this.buckets.delete(key)
    }
  }
}
