const { query } = require('../_supabase');
const { cors, handleOptions } = require('../_cors');

function auth(req) {
  const header = req.headers.authorization || '';
  return header.replace('Bearer ', '') === process.env.ADMIN_PASSWORD;
}

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;
  cors(res);

  if (!auth(req)) return res.status(401).json({ error: 'Non autorisé' });

  if (req.method === 'GET') {
    try {
      const today = new Date().toISOString().split('T')[0];
      const slots = await query(
        `/slots?date=gte.${today}&order=date.asc,time.asc&select=id,date,time,is_available`
      );
      res.status(200).json(slots);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  } else if (req.method === 'POST') {
    const { date, time } = req.body;
    if (!date || !time) return res.status(400).json({ error: 'date et time requis' });
    try {
      const [slot] = await query('/slots', 'POST', { date, time, is_available: true });
      res.status(201).json(slot);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  } else if (req.method === 'PATCH') {
    const { id, is_available } = req.body;
    if (!id) return res.status(400).json({ error: 'ID manquant' });
    try {
      await query(`/slots?id=eq.${id}`, 'PATCH', { is_available }, { prefer: 'return=minimal' });
      res.status(200).json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  } else if (req.method === 'DELETE') {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'ID manquant' });
    try {
      await query(`/slots?id=eq.${id}`, 'DELETE', undefined, { prefer: 'return=minimal' });
      res.status(200).json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};
