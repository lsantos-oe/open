-- Agendamentos dos alertas do Discord. Rode UMA vez no SQL editor do Supabase, depois de:
--   1) aplicar a migration 20261016_discord_alerts.sql;
--   2) fazer o deploy das funções discord-link e discord-dispatch e configurar os secrets
--      (veja supabase/functions/discord-dispatch/README.md).
-- Troque <PROJECT_REF> (o código do projeto, na URL do Supabase) e <SEGREDO> (o mesmo valor de DISCORD_CRON_SECRET).
-- Se preferir, habilite as extensões pg_cron e pg_net em Database → Extensions antes.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Vencimentos: todo dia às 08:00 (Brasília = 11:00 UTC) enfileira "vence amanhã" e "vence hoje".
select cron.schedule('discord-due', '0 11 * * *', $$select public.discord_enqueue_due()$$);

-- Limpeza: apaga da fila o que foi enviado há mais de 14 dias.
select cron.schedule('discord-purge', '30 11 * * *', $$delete from public.discord_outbox where created_at < now() - interval '14 days'$$);

-- Envio: a cada minuto chama a função que esvazia a fila.
select cron.schedule('discord-dispatch', '* * * * *', $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/discord-dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<SEGREDO>'),
    body := '{}'::jsonb
  )
$$);

-- Para desligar tudo: select cron.unschedule('discord-due'); select cron.unschedule('discord-purge'); select cron.unschedule('discord-dispatch');
