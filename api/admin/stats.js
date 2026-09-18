const { query } = require('../_supabase');
const { cors, handleOptions } = require('../_cors');
const { checkAdminAuth } = require('../_auth');

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;
  cors(res);
  if (!(await checkAdminAuth(req, res))) return;
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const days = parseInt(req.query && req.query.days) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const [events, bookings] = await Promise.all([
      query(`/events?created_at=gte.${since}&select=name,created_at&order=created_at.desc`),
      query(`/bookings?created_at=gte.${since}&select=created_at,status`),
    ]);

    const count = (name) => events.filter(e => e.name === name).length;

    // Group page_view by day for the chart
    const byDay = {};
    events.filter(e => e.name === 'page_view').forEach(e => {
      const day = e.created_at.split('T')[0];
      byDay[day] = (byDay[day] || 0) + 1;
    });

    res.status(200).json({
      period_days: days,
      page_views: count('page_view'),
      cta_clicks: count('cta_click'),
      form_step2: count('form_step2'),
      form_step3: count('form_step3'),
      bookings_total: bookings.length,
      bookings_confirmed: bookings.filter(b => b.status === 'confirmed').length,
      by_day: byDay,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
