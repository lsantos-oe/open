-- ============================================================================
-- STAGING ONLY — dados fictícios para testes. NUNCA executar na produção.
-- Seed de teste: usuários fictícios + um cliente/projeto/fase/tarefas/incidente.
-- IDs fixos para os testes automatizados da API. Idempotente.
-- ============================================================================

-- Usuários (o trigger handle_new_user cria os profiles)
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-4000-8000-00000000a001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'ana.teste@ploomes.com', '{"full_name":"Ana Teste"}', now(), now(), now()),
  ('00000000-0000-4000-8000-00000000a002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'bruno.teste@ploomes.com', '{"full_name":"Bruno Teste"}', now(), now(), now()),
  ('00000000-0000-4000-8000-00000000a003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'carla.inativa@ploomes.com', '{"full_name":"Carla Inativa"}', now(), now(), now()),
  ('00000000-0000-4000-8000-00000000a004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'dani.limite@ploomes.com', '{"full_name":"Dani Limite"}', now(), now(), now())
on conflict (id) do nothing;

-- Campos que o Supabase Auth (GoTrue) espera como texto vazio (nulos quebram o login com "Database error querying
-- schema") + identidade do provedor de e-mail. Só os usuários fictícios de teste.
update auth.users set
  confirmation_token = coalesce(confirmation_token, ''), recovery_token = coalesce(recovery_token, ''),
  email_change_token_new = coalesce(email_change_token_new, ''), email_change = coalesce(email_change, ''),
  email_change_token_current = coalesce(email_change_token_current, ''), phone_change = coalesce(phone_change, ''),
  phone_change_token = coalesce(phone_change_token, ''), reauthentication_token = coalesce(reauthentication_token, ''),
  raw_app_meta_data = coalesce(raw_app_meta_data, '{"provider":"email","providers":["email"]}'::jsonb)
where email like '%.teste@ploomes.com' or email in ('carla.inativa@ploomes.com', 'dani.limite@ploomes.com');

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now()
from auth.users u
where (u.email like '%.teste@ploomes.com' or u.email in ('carla.inativa@ploomes.com', 'dani.limite@ploomes.com'))
  and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');

update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-00000000a001';
update public.profiles set active = false where id = '00000000-0000-4000-8000-00000000a003';
-- Bruno com Discord ligado (id fictício) para testar a fila do Discord
update public.profiles set discord_user_id = '100000000000000001', discord_username = 'bruno.teste'
where id = '00000000-0000-4000-8000-00000000a002';

-- Configurações (feriados etc.)
insert into public.settings (key, value) values
  ('config', '{"holidays":["2026-11-02","2026-11-15","2026-11-20","2026-12-25"],"defaultLanguage":"pt","workdays":"mon-fri"}')
on conflict (key) do nothing;

-- Cliente
insert into public.clients (id, name, country, status, owners, created_by) values
  ('00000000-0000-4000-8000-0000000c0001', 'ACME Teste', 'BR', 'implantacao',
   '[{"id":"o1","type":"member","memberId":"00000000-0000-4000-8000-00000000a001","name":"Ana Teste","kind":"executor"}]',
   '00000000-0000-4000-8000-00000000a001')
on conflict (id) do nothing;

-- Projeto + vínculo com cliente
insert into public.projects (id, name, type, status, language, pm, pm_member_id, created_by) values
  ('00000000-0000-4000-8000-0000000b0001', 'Implantação ACME (teste)', 'nova_conta', 'in_progress', 'pt',
   'Ana Teste', '00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000a001')
on conflict (id) do nothing;
insert into public.project_clients (project_id, client_id) values
  ('00000000-0000-4000-8000-0000000b0001', '00000000-0000-4000-8000-0000000c0001')
on conflict do nothing;

-- Fases
insert into public.phases (id, project_id, name, "order", is_unassigned) values
  ('00000000-0000-4000-8000-0000000f0001', '00000000-0000-4000-8000-0000000b0001', 'Kickoff', 0, false),
  ('00000000-0000-4000-8000-0000000f0002', '00000000-0000-4000-8000-0000000b0001', 'Configuração', 1, false)
on conflict (id) do nothing;

-- Tarefas (t2 depende de t1)
insert into public.entries (id, project_id, phase_id, type, name, status, planned_start, planned_end, duration_days,
                            owners, responsible, responsible_member_id, depends_on, "order", created_by) values
  ('00000000-0000-4000-8000-0000000e0001', '00000000-0000-4000-8000-0000000b0001', '00000000-0000-4000-8000-0000000f0001',
   'task', 'Reunião de kickoff', 'done', '2026-10-05', '2026-10-05', 1,
   '[{"id":"w1","type":"member","memberId":"00000000-0000-4000-8000-00000000a001","name":"Ana Teste","kind":"executor"}]',
   'Ana Teste', '00000000-0000-4000-8000-00000000a001', '[]', 0, '00000000-0000-4000-8000-00000000a001'),
  ('00000000-0000-4000-8000-0000000e0002', '00000000-0000-4000-8000-0000000b0001', '00000000-0000-4000-8000-0000000f0002',
   'task', 'Levantamento de requisitos', 'in_progress', '2026-10-06', '2026-10-16', 9,
   '[{"id":"w2","type":"member","memberId":"00000000-0000-4000-8000-00000000a002","name":"Bruno Teste","kind":"executor"}]',
   'Bruno Teste', '00000000-0000-4000-8000-00000000a002', '["00000000-0000-4000-8000-0000000e0001"]', 0,
   '00000000-0000-4000-8000-00000000a001')
on conflict (id) do nothing;

-- Incidente
insert into public.incidents (id, title, status, priority, impact, owner, created_by) values
  ('00000000-0000-4000-8000-0000000d0001', 'Integração parada (teste)', 'open', 'high', 'high',
   '{"id":"i1","type":"member","memberId":"00000000-0000-4000-8000-00000000a002","name":"Bruno Teste","kind":"executor"}',
   '00000000-0000-4000-8000-00000000a001')
on conflict (id) do nothing;
insert into public.incident_clients (incident_id, client_id) values
  ('00000000-0000-4000-8000-0000000d0001', '00000000-0000-4000-8000-0000000c0001')
on conflict do nothing;
