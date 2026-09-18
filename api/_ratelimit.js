// Security audit fix (2026-09-18): /api/book had no limit at all — anyone
// could POST repeatedly to spam arbitrary email addresses. No external
// store (Redis/KV) is wired up for this project, so this is a best-effort,
// in-memory limiter: it resets on cold start and isn't shared across
// serverless instances, but it still closes off the trivial "script a loop"
// abuse case for a warm instance.
const buckets = new Map(); // key -> { count, windowStart }

function getIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (typeof fwd === 'string' ? fwd.split(',')[0].trim() : null) || req.socket?.remoteAddress || 'unknown';
}

// Returns true (and records the hit) if the request is within the allowed
// rate; false if it should be rejected with 429.
function allow(req, { keyPrefix, windowMs, max }) {
  const key = `${keyPrefix}:${getIp(req)}`;
  const entry = buckets.get(key);
  if (!entry || Date.now() - entry.windowStart > windowMs) {
    buckets.set(key, { count: 1, windowStart: Date.now() });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count += 1;
  return true;
}

module.exports = { allow };
