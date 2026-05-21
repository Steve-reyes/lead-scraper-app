/**
 * Token-bucket rate limiter to throttle outgoing requests
 * and avoid getting blocked by external sites.
 */

interface RateLimitConfig {
  tokensPerInterval: number;
  intervalMs: number;
  maxBurst: number;
}

interface Bucket {
  tokens: number;
  lastRefill: number;
}

export class RateLimiter {
  private buckets: Map<string, Bucket> = new Map();
  private config: RateLimitConfig;

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = {
      tokensPerInterval: config?.tokensPerInterval ?? 5,
      intervalMs: config?.intervalMs ?? 1000,
      maxBurst: config?.maxBurst ?? 10,
    };
  }

  private refillBucket(key: string): void {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: this.config.maxBurst, lastRefill: now };
      this.buckets.set(key, bucket);
      return;
    }

    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = Math.floor((elapsed / this.config.intervalMs) * this.config.tokensPerInterval);

    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(bucket.tokens + tokensToAdd, this.config.maxBurst);
      bucket.lastRefill = now;
    }
  }

  /**
   * Try to consume a token for the given key.
   * Returns true if allowed, false if rate limited.
   */
  tryConsume(key: string = 'default'): boolean {
    this.refillBucket(key);
    const bucket = this.buckets.get(key)!;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }

    return false;
  }

  /**
   * Wait until a token is available.
   */
  async consume(key: string = 'default'): Promise<void> {
    while (!this.tryConsume(key)) {
      await new Promise((resolve) => setTimeout(resolve, Math.max(100, this.config.intervalMs / this.config.tokensPerInterval)));
    }
  }

  /**
   * Create domain-specific rate limiter (e.g., for yelp.com, yellowpages.com).
   */
  static forDomain(domain: string): RateLimiter {
    return new RateLimiter({
      tokensPerInterval: 3,
      intervalMs: 2000,
      maxBurst: 5,
    });
  }
}

// Pre-configured limiters for known domains
export const domainLimiters = new Map<string, RateLimiter>();

export function getLimiterForDomain(domain: string): RateLimiter {
  if (!domainLimiters.has(domain)) {
    domainLimiters.set(domain, RateLimiter.forDomain(domain));
  }
  return domainLimiters.get(domain)!;
}
