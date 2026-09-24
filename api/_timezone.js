// `slots.date` / `slots.time` have no timezone of their own — they're
// always meant as Europe/Zurich wall-clock time. Vercel functions run in
// UTC, so `new Date(\`${date}T${time}\`)` silently reads "17:30" as
// 17:30 UTC instead of 17:30 Zurich — off by 1h (CET) or 2h (CEST). That
// wrong instant then gets re-displayed in Zurich time for the member's
// confirmation email, showing 19:30 for a 17:30 booking. Converts the
// wall-clock date+time to the real UTC instant instead: standard
// "guess UTC, see how far off Zurich reads it, correct by that offset"
// trick — no timezone library needed for one fixed zone.
function zurichWallTimeToUtcMs(dateStr, timeStr) {
  const guessUtc = new Date(`${dateStr}T${timeStr}Z`);
  const zurichStr = guessUtc.toLocaleString('sv-SE', { timeZone: 'Europe/Zurich' });
  const zurichAsUtc = new Date(`${zurichStr.replace(' ', 'T')}Z`);
  const offsetMs = guessUtc.getTime() - zurichAsUtc.getTime();
  return guessUtc.getTime() + offsetMs;
}

module.exports = { zurichWallTimeToUtcMs };
