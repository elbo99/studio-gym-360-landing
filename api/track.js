const { query } = require('./_supabase');
const { cors, handleOptions } = require('./_cors');
const { allow } = require('./_ratelimit');

// Page-view / click events from our own landing page. Public by design, so:
// a per-IP limit, a strict event-name format and capped field lengths keep it
// from being used to fill the table with junk.
const NAME_RE = /^[a-z0-9][a-z0-9_:.\- ]{0,59}$/i;
const cap = (v, n) => (typeof v === 'string' ? v.slice(0, n) : null);

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;
  cors(res, req);

  if (req.method !== 'POST') return res.status(405).end();

  if (!allow(req, { keyPrefix: 'track', windowMs: 10 * 60 * 1000, max: 60 })) {
    return res.status(429).json({ error: 'Trop de requêtes' });
  }

  const { name, page, referrer } = req.body || {};
  if (typeof name !== 'string' || !NAME_RE.test(name)) {
    return res.status(400).json({ error: 'name invalide' });
  }

  try {
    await query('/events', 'POST', {
      name,
      page: cap(page, 200),
      referrer: cap(referrer, 300),
    }, { prefer: 'return=minimal' });
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error('track error:', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
};
