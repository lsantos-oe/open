// Entrada da Edge Function `api` (Supabase) — também roda localmente com `deno task dev`.
// Deploy: supabase functions deploy api --no-verify-jwt --project-ref <ref>
// (o JWT do gateway fica desligado porque a função valida o header User-Key / token OAuth.)
import { app } from "./app.ts";

/**
 * Descoberta OAuth na raiz do domínio (RFC 8414/9728 inserem o caminho depois de /.well-known/, ex.:
 * /.well-known/oauth-authorization-server/api). Em produção a Vercel encaminha esses caminhos para cá; localmente
 * (ou num túnel) chegam direto. Tudo vai para as rotas sob /api.
 */
function handler(req: Request): Response | Promise<Response> {
  const url = new URL(req.url);
  if (url.pathname.startsWith("/.well-known/")) {
    url.pathname = "/api" + url.pathname;
    return app.fetch(new Request(url, req));
  }
  return app.fetch(req);
}

Deno.serve({ port: Number(Deno.env.get("PORT") ?? 8000) }, handler);
