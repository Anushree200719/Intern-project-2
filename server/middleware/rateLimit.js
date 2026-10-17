// TaskBoard Secure Rate Limiter Middleware

function getClientIp(req) {
  // Only trust proxy headers (like X-Forwarded-For) if TRUST_PROXY is explicitly enabled
  const trustProxy = process.env.TRUST_PROXY;
  const isTrustProxyEnabled = trustProxy === 'true' || trustProxy === '1' || (trustProxy && trustProxy.trim() !== 'false' && trustProxy.trim() !== '0');
  if (isTrustProxyEnabled) {
    if (req.ip) return req.ip;
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded && typeof forwarded === 'string') {
      const firstIp = forwarded.split(',')[0].trim();
      if (firstIp) return firstIp;
    }
  }
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : '127.0.0.1';
}

function createRateLimiter(options = {}) {
  const windowMs = options.windowMs || 15 * 60 * 1000; // 15 minutes
  const max = options.max || 10;
  const message = options.message || 'Too many requests from this IP, please try again later.';
  const keyPrefix = options.keyPrefix || 'rl';
  const hits = new Map();

  // Periodic cleanup of expired entries
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of hits.entries()) {
      if (now > record.resetTime) {
        hits.delete(key);
      }
    }
  }, Math.min(windowMs, 60000));

  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }

  const limiterMiddleware = (req, res, next) => {
    // In test environment, allow high threshold or bypass unless test specifically triggers rate limiting
    if (process.env.NODE_ENV === 'test' && !req.headers['x-test-rate-limit']) {
      return next();
    }

    const ip = getClientIp(req);
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();

    let record = hits.get(key);
    if (!record || now > record.resetTime) {
      record = {
        count: 0,
        resetTime: now + windowMs
      };
      hits.set(key, record);
    }

    record.count++;

    const remaining = Math.max(0, max - record.count);
    const resetSeconds = Math.ceil((record.resetTime - now) / 1000);

    res.setHeader('RateLimit-Limit', max);
    res.setHeader('RateLimit-Remaining', remaining);
    res.setHeader('RateLimit-Reset', Math.ceil(record.resetTime / 1000));

    if (record.count > max) {
      res.setHeader('Retry-After', resetSeconds);
      return res.status(429).json({
        error: message,
        retryAfter: resetSeconds
      });
    }

    next();
  };

  limiterMiddleware.reset = () => {
    hits.clear();
  };

  return limiterMiddleware;
}

// Configured limiters for sensitive endpoints
const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyPrefix: 'login',
  message: 'Too many login attempts. Please try again after 15 minutes.'
});

const registerLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  keyPrefix: 'register',
  message: 'Too many account registrations from this IP. Please try again later.'
});

module.exports = {
  createRateLimiter,
  loginLimiter,
  registerLimiter,
  getClientIp
};
