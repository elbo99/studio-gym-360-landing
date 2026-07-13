const { query } = require('./_supabase');
const { cors, handleOptions } = require('./_cors');

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;
  cors(res);

  try {
    const today = new Date().toISOString().split('T')[0];
    const slots = await query(
      `/slots?is_available=eq.true&date=gte.${today}&order=date.asc,time.asc&select=id,date,time`
    );
    res.status(200).json(slots);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
