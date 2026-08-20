import type { RequestHandler } from 'express';
import type { AppConfig } from '../config';
import { AppError } from '../errors';

interface Bucket { count: number; resetAt: number }

export function createRateLimiter(config: AppConfig, max = config.rateLimitMax): RequestHandler {
  const buckets = new Map<string, Bucket>();
  let lastSweep = Date.now();

  function sweepExpired(now: number): void {
    if (now - lastSweep < config.rateLimitWindowMs) return;
    lastSweep = now;
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }

  return (req, _res, next) => {
    const now = Date.now();
    sweepExpired(now);
    const key = `${req.ip ?? req.socket.remoteAddress ?? 'unknown'}:${req.baseUrl}${req.path}`;
    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + config.rateLimitWindowMs });
      next();
      return;
    }
    current.count += 1;
    if (current.count > max) {
      next(new AppError(429, 'RATE_LIMITED', 'Muitas requisições. Tente novamente em instantes.'));
      return;
    }
    next();
  };
}
