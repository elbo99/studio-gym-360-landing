// The public endpoints are only called by our own pages (same origin), so
// cross-origin access is limited to our domains instead of "*". Requests with
// no Origin header (same-origin fetches, curl) are unaffected.
const ALLOWED_ORIGINS = new Set([
  'https://studiogym.ch',
  'https://www.studiogym.ch',
  'https://studiogym360.ch',
  'https://www.studiogym360.ch',
  'https://studiogym360.com',
  'https://www.studiogym360.com',
]);

function cors(res, req) {
  const origin = req && req.headers && req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function handleOptions(req, res) {
  if (req.method === 'OPTIONS') {
    cors(res, req);
    res.status(204).end();
    return true;
  }
  return false;
}

module.exports = { cors, handleOptions };
