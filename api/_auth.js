const crypto = require('crypto');

// Security audit fix (2026-09-18): the admin routes previously compared
// the Bearer token to ADMIN_PASSWORD with a plain `===`, with no limit on
// how many times an attacker could try. There's no external store (Redis/
// KV) wired up for this project, so this is a best-effort, in-memory
// slowdown: it resets on cold start and isn't shared across serverless
// instances, but combined with the per-attempt delay below it still raises
// the cost of guessing ADMIN_PASSWORD from "unlimited, instant" to a few
// attempts per IP every 5 minutes.
const attempts = new Map(); // ip -> { count, windowStart }
const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const FAILURE_DELAY_MS = 750;

function getIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (typeof fwd === 'string' ? fwd.split(',')[0].trim() : null) || req.socket?.remoteAddress || 'unknown';
}

function isLockedOut(ip) {
  const entry = attempts.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.windowStart > WINDOW_MS) {
    attempts.delete(ip);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(ip) {
  const entry = attempts.get(ip);
  if (!entry || Date.now() - entry.windowStart > WINDOW_MS) {
    attempts.set(ip, { count: 1, windowStart: Date.now() });
  } else {
    entry.count += 1;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Constant-time comparison — a plain `===` leaks how many leading
// characters matched via response timing.
function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

// Returns true and lets the caller proceed if authorized; otherwise writes
// the appropriate error response itself (401 or 429) and returns false.
async function checkAdminAuth(req, res) {
  const ip = getIp(req);

  if (isLockedOut(ip)) {
    res.status(429).json({ error: 'Trop de tentatives — réessaie dans quelques minutes.' });
    return false;
  }

  const header = req.headers.authorization || '';
  const provided = header.replace('Bearer ', '');
  const expected = process.env.ADMIN_PASSWORD || '';
  const ok = expected.length > 0 && timingSafeEqual(provided, expected);

  if (!ok) {
    recordFailure(ip);
    await sleep(FAILURE_DELAY_MS);
    res.status(401).json({ error: 'Non autorisé' });
    return false;
  }

  attempts.delete(ip);
  return true;
}

module.exports = { checkAdminAuth };
