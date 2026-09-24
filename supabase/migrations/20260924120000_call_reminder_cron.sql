-- Polls api/send-call-reminders every 15 minutes so the "appel découverte
-- dans 1h" reminder fires close to the actual call time, instead of the
-- previous single Resend scheduledAt call filed weeks ahead of time with no
-- guarantee Resend would honour scheduling that far out (see book.js and
-- send-call-reminders.js for the full story).
--
-- The shared secret the job sends is looked up from Supabase Vault at run
-- time rather than written into this file, so it never ends up in git.
-- It must be seeded once, outside of any migration:
--   select vault.create_secret('<value>', 'call_reminder_cron_secret');
-- and that same <value> set as the CRON_SECRET environment variable on the
-- Vercel project — send-call-reminders.js refuses every request without a
-- match. Rotate both together if it's ever regenerated (update the secret
-- with vault.update_secret, not by creating a second one under the same
-- name).
begin;

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'send-call-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://studiogym360.com/api/send-call-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'call_reminder_cron_secret'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);

commit;
