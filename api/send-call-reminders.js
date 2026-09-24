const crypto = require('crypto');
const { query } = require('./_supabase');
const { escapeHtml } = require('./_html');
const { zurichWallTimeToUtcMs } = require('./_timezone');

// Sends Guillaume a "call in ~1h" reminder for upcoming appel découverte
// bookings. Used to be a single Resend `scheduledAt` email fired at booking
// time — but scheduling an email weeks in advance depends on a delivery
// window Resend may not honour that far out, and book.js never checked
// whether the API even accepted it. Instead of guessing at that limit, this
// endpoint is polled on a short interval (see the pg_cron job in
// supabase/migrations) and sends the reminder itself, right when it's due.
//
// Not public: only Supabase's pg_cron job (via pg_net) is meant to call
// this, carrying the shared secret below. Fails closed if CRON_SECRET
// isn't configured, rather than leaving the endpoint open.
function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

const REMINDER_WINDOW_MS = 65 * 60 * 1000; // slightly over 1h to survive gaps between cron ticks

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers['x-cron-secret'];
  if (!secret || !provided || !timingSafeEqual(provided, secret)) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'Studio Gym 360 <noreply@studiogym360.ch>';
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!key || !adminEmail) return res.status(200).json({ skipped: true, reason: 'email not configured' });

  try {
    const due = await query(
      "/bookings?status=eq.confirmed&reminder_sent_at=is.null&select=id,slot_id,first_name,last_name,phone,objective,level,weekly_time,injuries"
    );
    if (due.length === 0) return res.status(200).json({ sent: 0 });

    const slotIds = [...new Set(due.map(b => b.slot_id).filter(Boolean))];
    const slots = slotIds.length
      ? await query(`/slots?id=in.(${slotIds.join(',')})&select=id,date,time`)
      : [];
    const slotById = new Map(slots.map(s => [s.id, s]));

    const now = Date.now();
    let sentCount = 0;

    for (const booking of due) {
      const slot = booking.slot_id ? slotById.get(booking.slot_id) : null;
      if (!slot) continue;

      const callAtMs = zurichWallTimeToUtcMs(slot.date, slot.time);
      const msUntilCall = callAtMs - now;
      // Not due yet, or already happened without ever being caught inside
      // the window (e.g. the cron job was briefly down) — either way,
      // nothing to send.
      if (msUntilCall <= 0 || msUntilCall > REMINDER_WINDOW_MS) continue;

      const timeStr = new Date(callAtMs).toLocaleTimeString('fr-CH', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Zurich',
      });
      const safe = {
        first_name: escapeHtml(booking.first_name),
        last_name: escapeHtml(booking.last_name),
        phone: escapeHtml(booking.phone),
        objective: escapeHtml(booking.objective),
        level: escapeHtml(booking.level),
        weekly_time: escapeHtml(booking.weekly_time),
        injuries: booking.injuries ? escapeHtml(booking.injuries) : '',
      };

      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: adminEmail,
          subject: `📞 Dans 1h — appel avec ${safe.first_name} ${safe.last_name}`,
          html: `
            <h2>Appel découverte dans 1h ⏰</h2>
            <p><strong>${safe.first_name} ${safe.last_name}</strong> — ${timeStr}</p>
            <hr>
            <p>📱 <strong>${safe.phone}</strong></p>
            <p>🎯 ${safe.objective}</p>
            <p>📊 ${safe.level}</p>
            <p>⏱ ${safe.weekly_time}</p>
            ${safe.injuries ? `<p>⚠️ ${safe.injuries}</p>` : ''}
          `,
        }),
      });
      if (!emailRes.ok) {
        console.error('send-call-reminders: Resend error', await emailRes.text().catch(() => ''));
        continue; // leave reminder_sent_at unset so the next tick retries
      }

      await query(`/bookings?id=eq.${booking.id}`, 'PATCH', { reminder_sent_at: new Date().toISOString() }, { prefer: 'return=minimal' });
      sentCount++;
    }

    res.status(200).json({ sent: sentCount, checked: due.length });
  } catch (e) {
    console.error('send-call-reminders error:', e);
    res.status(500).json({ error: e.message });
  }
};
