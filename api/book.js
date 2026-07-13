const { query } = require('./_supabase');
const { cors, handleOptions } = require('./_cors');

async function sendEmails(booking, slot) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;

  const slotDate = new Date(`${slot.date}T${slot.time}`);

  const dateStr = slotDate.toLocaleString('fr-CH', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich',
  });

  const from = process.env.EMAIL_FROM || 'Studio Gym 360 <noreply@studiogym360.ch>';

  // 1. Notification admin
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: process.env.ADMIN_EMAIL,
      subject: `🗓 Nouvelle résa — ${booking.first_name} ${booking.last_name}`,
      html: `
        <h2>Nouvelle réservation d'appel découverte</h2>
        <p><strong>Créneau :</strong> ${dateStr}</p>
        <hr>
        <h3>Contact</h3>
        <p><strong>Prénom :</strong> ${booking.first_name}</p>
        <p><strong>Nom :</strong> ${booking.last_name}</p>
        <p><strong>Email :</strong> <a href="mailto:${booking.email}">${booking.email}</a></p>
        <p><strong>Téléphone :</strong> ${booking.phone}</p>
        <hr>
        <h3>Profil sportif</h3>
        <p><strong>Objectif :</strong> ${booking.objective}</p>
        <p><strong>Niveau :</strong> ${booking.level}</p>
        <p><strong>Disponibilités :</strong> ${booking.weekly_time}</p>
        <p><strong>Blessures / contraintes :</strong> ${booking.injuries || '—'}</p>
        <p><strong>Comment il·elle a connu Studio Gym 360 :</strong> ${booking.referral || '—'}</p>
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
        <h2>Bonjour ${booking.first_name} !</h2>
        <p>Ton appel découverte de 30 min est bien réservé pour le <strong>${dateStr}</strong>.</p>
        <p>Guillaume te contactera à l'heure convenue sur le numéro indiqué : <strong>${booking.phone}</strong>.</p>
        <p>Si tu as des questions, réponds à cet email ou écris-nous sur WhatsApp.</p>
        <br>
        <p>À bientôt,<br><strong>Guillaume — Studio Gym 360</strong></p>
      `,
    }),
  });

  const now = new Date();
  const timeStr = slotDate.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' });

  // 3. Rappel Guillaume 1h avant
  const reminder1h = new Date(slotDate.getTime() - 60 * 60 * 1000);
  if (reminder1h > now) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: process.env.ADMIN_EMAIL,
        subject: `📞 Dans 1h — appel avec ${booking.first_name} ${booking.last_name}`,
        scheduledAt: reminder1h.toISOString(),
        html: `
          <h2>Appel découverte dans 1h ⏰</h2>
          <p><strong>${booking.first_name} ${booking.last_name}</strong> — ${timeStr}</p>
          <hr>
          <p>📱 <strong>${booking.phone}</strong></p>
          <p>🎯 ${booking.objective}</p>
          <p>📊 ${booking.level}</p>
          <p>⏱ ${booking.weekly_time}</p>
          ${booking.injuries ? `<p>⚠️ ${booking.injuries}</p>` : ''}
        `,
      }),
    });
  }
}

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;
  cors(res);

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { slot_id, first_name, last_name, email, phone, objective, level, weekly_time, injuries, referral } = req.body;

  if (!slot_id || !first_name || !last_name || !email || !phone || !objective || !level || !weekly_time) {
    return res.status(400).json({ error: 'Champs obligatoires manquants' });
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
