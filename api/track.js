const { query } = require('./_supabase');
const { cors, handleOptions } = require('./_cors');

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;
  cors(res);

  if (req.method !== 'POST') return res.status(405).end();

  const { name, page, referrer } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name requis' });

  try {
    await query('/events', 'POST', {
      name,
      page: page || null,
      referrer: referrer || null,
    }, { prefer: 'return=minimal' });
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
