const { query } = require('../_supabase');
const { cors, handleOptions } = require('../_cors');

function auth(req) {
  const header = req.headers.authorization || '';
  const password = header.replace('Bearer ', '');
  return password === process.env.ADMIN_PASSWORD;
}

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;
  cors(res);

  if (!auth(req)) return res.status(401).json({ error: 'Non autorisé' });

  if (req.method === 'GET') {
    try {
      const bookings = await query(
        '/bookings?select=*,slots(date,time)&order=created_at.desc'
      );
      res.status(200).json(bookings);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  } else if (req.method === 'PATCH') {
    const { id, status, notes } = req.body;
    if (!id) return res.status(400).json({ error: 'ID manquant' });
    try {
      const update = {};
      if (status) update.status = status;
      if (notes !== undefined) update.notes = notes;
      await query(`/bookings?id=eq.${id}`, 'PATCH', update, { prefer: 'return=minimal' });
      res.status(200).json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};
