const { query } = require('./_supabase');
const { cors, handleOptions } = require('./_cors');
const { escapeHtml } = require('./_html');
const { allow } = require('./_ratelimit');
const { zurichWallTimeToUtcMs } = require('./_timezone');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function sendEmails(booking, slot) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;

  // slot.date/slot.time are plain Europe/Zurich wall-clock values with no
  // timezone of their own — this server runs in UTC (Vercel's default), so
  // `new Date(...)` on the raw string would silently read "17:30" as UTC
  // and this confirmation would tell the member 19:30 instead (see
  // _timezone.js for how that was caught and how the fix works).
  const slotDate = new Date(zurichWallTimeToUtcMs(slot.date, slot.time));

  const dateStr = slotDate.toLocaleString('fr-CH', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich',
  });

  const from = process.env.EMAIL_FROM || 'Studio Gym 360 <noreply@studiogym360.ch>';

  // Every field below came straight from the public form — escape before
  // it ever lands in HTML sent from a verified domain.
  const safe = {
    first_name: escapeHtml(booking.first_name),
    last_name: escapeHtml(booking.last_name),
    email: escapeHtml(booking.email),
    phone: escapeHtml(booking.phone),
    objective: escapeHtml(booking.objective),
    level: escapeHtml(booking.level),
    weekly_time: escapeHtml(booking.weekly_time),
    injuries: booking.injuries ? escapeHtml(booking.injuries) : '',
    referral: booking.referral ? escapeHtml(booking.referral) : '',
  };

  // 1. Notification admin
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: process.env.ADMIN_EMAIL,
      subject: `🗓 Nouvelle résa — ${safe.first_name} ${safe.last_name}`,
      html: `
        <h2>Nouvelle réservation d'appel découverte</h2>
        <p><strong>Créneau :</strong> ${dateStr}</p>
        <hr>
        <h3>Contact</h3>
        <p><strong>Prénom :</strong> ${safe.first_name}</p>
        <p><strong>Nom :</strong> ${safe.last_name}</p>
        <p><strong>Email :</strong> <a href="mailto:${safe.email}">${safe.email}</a></p>
        <p><strong>Téléphone :</strong> ${safe.phone}</p>
        <hr>
        <h3>Profil sportif</h3>
        <p><strong>Objectif :</strong> ${safe.objective}</p>
        <p><strong>Niveau :</strong> ${safe.level}</p>
        <p><strong>Disponibilités :</strong> ${safe.weekly_time}</p>
        <p><strong>Blessures / contraintes :</strong> ${safe.injuries || '—'}</p>
        <p><strong>Comment il·elle a connu Studio Gym 360 :</strong> ${safe.referral || '—'}</p>
      `,
    }),
  });

  // 2. Confirmation immédiate au membre
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: booking.email,
      subject: `✅ Ton appel découverte est confirmé !`,
      html: `
        <h2>Bonjour ${safe.first_name} !</h2>
        <p>Ton appel découverte de 30 min est bien réservé pour le <strong>${dateStr}</strong>.</p>
        <p>Guillaume te contactera à l'heure convenue sur le numéro indiqué : <strong>${safe.phone}</strong>.</p>
        <p>Si tu as des questions, écris-nous à <a href="mailto:info@studiogym.ch">info@studiogym.ch</a> ou sur WhatsApp.</p>
        <br>
        <p>À bientôt,<br><strong>Guillaume — Studio Gym 360</strong></p>
      `,
    }),
  });

  // The "call in 1h" reminder used to be filed here too, via Resend's
  // scheduledAt — sending it up to weeks ahead of the actual call, with no
  // check that Resend even accepted scheduling that far out. It's now sent
  // by send-call-reminders.js, polled on a short interval by a Supabase
  // pg_cron job (see supabase/migrations), which sends it exactly when
  // it's actually due instead of trusting a single schedule() call weeks
  // in advance.
}

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;
  cors(res);

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // No auth on this public booking form by design — a per-IP limit is the
  // only thing standing between it and a scripted spam loop.
  if (!allow(req, { keyPrefix: 'book', windowMs: 10 * 60 * 1000, max: 5 })) {
    return res.status(429).json({ error: 'Trop de tentatives — réessaie dans quelques minutes.' });
  }

  const { slot_id, first_name, last_name, email, phone, objective, level, weekly_time, injuries, referral } = req.body;

  if (!slot_id || !first_name || !last_name || !email || !phone || !objective || !level || !weekly_time) {
    return res.status(400).json({ error: 'Champs obligatoires manquants' });
  }

  if (!UUID_RE.test(slot_id)) {
    return res.status(400).json({ error: 'Créneau invalide' });
  }

  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Email invalide' });
  }

  try {
    const slots = await query(`/slots?id=eq.${slot_id}&is_available=eq.true&select=id,date,time`);
    if (!slots.length) return res.status(409).json({ error: 'Créneau plus disponible' });
    const slot = slots[0];

    const [booking] = await query('/bookings', 'POST', {
      slot_id, first_name, last_name, email, phone, objective, level, weekly_time,
      injuries: injuries || null,
      referral: referral || null,
      status: 'confirmed',
    });

    await query(`/slots?id=eq.${slot_id}`, 'PATCH', { is_available: false }, { prefer: 'return=minimal' });

    await sendEmails(booking, slot).catch(console.error);

    res.status(201).json({ success: true, booking_id: booking.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
