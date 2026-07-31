-- ═══════════════════════════════════════════════════════════════════════════
-- Fecha a brecha do modelo anterior: qualquer usuário autenticado conseguia
-- chamar supabase.rpc('ai_get_key') direto do console do navegador e pegar a
-- chave da Anthropic em texto puro — a Edge Function nova (supabase/functions/
-- ai-chat) passa a ser a ÚNICA chamadora legítima de ai_get_key(), usando a
-- service role (que ignora RLS e grants de "authenticated", mas ainda respeita
-- grants explícitos por role). A partir daqui, a chave nunca mais trafega pro
-- navegador de ninguém, nem em texto puro nem criptografada.
--
-- ai_has_key() continua liberada pra "authenticated" — é só um booleano
-- ("existe uma chave configurada?"), usado pelo botão flutuante do chat pra
-- decidir se aparece ou não; não expõe segredo nenhum.
-- ═══════════════════════════════════════════════════════════════════════════

revoke execute on function ai_get_key() from authenticated;
grant execute on function ai_get_key() to service_role;
