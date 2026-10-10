-- À exécuter dans Supabase SQL Editor après avoir défini PUSH_CRON_SECRET
-- dans Edge Function Secrets. Remplacez seulement le texte de secret ci-dessous
-- par la même valeur, puis gardez cette requête privée.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

select vault.create_secret(
  'REMPLACER_PAR_LA_VALEUR_DE_PUSH_CRON_SECRET',
  'slm_push_cron_secret',
  'Secret utilisé par le cron Supabase pour appeler les rappels push SLM.'
);
select vault.create_secret(
  'sb_publishable_Fc6ZGyUSjuHkdqCgAUtKiQ_qa9uWSQK',
  'slm_push_publishable_key',
  'Clé publique Supabase utilisée par pg_net pour appeler la fonction.'
);

select cron.unschedule(jobid)
from cron.job
where jobname = 'slm-push-reminders';

select cron.schedule(
  'slm-push-reminders',
  '* * * * *',
  $$
    select net.http_post(
      url := 'https://ucmwtebwlbrmybxdjxlg.supabase.co/functions/v1/push-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'slm_push_publishable_key'
          limit 1
        ),
        'x-push-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'slm_push_cron_secret'
          limit 1
        )
      ),
      body := '{"action":"dispatch"}'::jsonb,
      timeout_milliseconds := 10000
    );
  $$
);
