// Configuração da API, toda via variáveis de ambiente (secrets da Edge Function).
const env = (k: string) => Deno.env.get(k) ?? "";

export const config = {
  /** Conexão Postgres. Na Edge Function o Supabase injeta SUPABASE_DB_URL; local/testes usam API_DB_URL. */
  dbUrl: env("API_DB_URL") || env("SUPABASE_DB_URL"),
  /** Usados só para validar JWT de sessão do Supabase (login Google) via GoTrue. */
  supabaseUrl: env("SUPABASE_URL"),
  anonKey: env("SUPABASE_ANON_KEY"),
  /** Kill switch de escrita: com "false" a API vira somente leitura (rollout/rollback). */
  writeEnabled: (env("API_WRITE_ENABLED") || "true") === "true",
  /** URL pública do app, para devolver links das entidades criadas. */
  appUrl: (env("APP_URL") || "https://openploo.vercel.app").replace(/\/$/, ""),
  /** Origens permitidas no CORS (vírgula). Vazio = nenhuma origem de browser (agentes não precisam). */
  allowedOrigins: env("API_ALLOWED_ORIGINS").split(",").map((s) => s.trim()).filter(Boolean),
  /** Segredo extra misturado no hash dos tokens. Trocar invalida todos os tokens. */
  tokenPepper: env("API_TOKEN_PEPPER"),
  /** Requisições por minuto por token. */
  rateLimitPerMinute: Number(env("API_RATE_LIMIT") || "120"),
  /** Fuso usado para "hoje" (atraso, auto-status) — o mesmo do banco/app. */
  timeZone: "America/Sao_Paulo",
  version: "1.0.0",
};
