// Utilitários dos testes de integração (API + MCP). As variáveis são preenchidas por tools/test-local.ts.
// deno-lint-ignore-file no-explicit-any

export const env: Record<"url" | "write" | "read" | "inactive" | "old" | "fake" | "limit" | "external" | "sessionAna" | "sessionBruno", string> = {
  url: Deno.env.get("API_TEST_URL") ?? "",
  write: Deno.env.get("API_TEST_KEY_ANA") ?? "", // Ana: admin
  read: Deno.env.get("API_TEST_KEY_BRUNO") ?? "", // Bruno: membro (lê e grava, não é admin)
  inactive: Deno.env.get("API_TEST_KEY_INACTIVE") ?? "", // Carla (usuária desativada)
  old: Deno.env.get("API_TEST_KEY_OLD") ?? "", // chave que já foi trocada
  fake: Deno.env.get("API_TEST_KEY_FAKE") ?? "", // formato válido, nunca cadastrada
  limit: Deno.env.get("API_TEST_KEY_LIMIT") ?? "", // usuária só para estourar o rate limit
  external: Deno.env.get("API_TEST_KEY_EXTERNAL") ?? "", // conta de fora da empresa, ativa no app
  sessionAna: Deno.env.get("API_TEST_SESSION_ANA") ?? "", // JWT de login (página /minha-chave)
  sessionBruno: Deno.env.get("API_TEST_SESSION_BRUNO") ?? "",
};

/** Integração só roda com a API de teste no ar (tools/test-local.ts). */
export const ignore = !env.url || !env.write || !env.read;

export const IDS = {
  ana: "00000000-0000-4000-8000-00000000a001",
  bruno: "00000000-0000-4000-8000-00000000a002",
  client: "00000000-0000-4000-8000-0000000c0001",
  project: "00000000-0000-4000-8000-0000000b0001",
  phaseKickoff: "00000000-0000-4000-8000-0000000f0001",
  phaseConfig: "00000000-0000-4000-8000-0000000f0002",
  incident: "00000000-0000-4000-8000-0000000d0001",
};
export const EMAIL = { ana: "ana.teste@ploomes.com", bruno: "bruno.teste@ploomes.com" };

export const uniq = (prefix: string) => `${prefix} ${crypto.randomUUID().slice(0, 8)}`;

export interface Res {
  status: number;
  headers: Headers;
  body: any;
}

export async function api(
  path: string,
  init: { method?: string; body?: unknown; token?: string; headers?: Record<string, string> } = {},
): Promise<Res> {
  const res = await fetch(`${env.url}/odata/v1${path}`, {
    method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      ...(init.token !== "" ? { "User-Key": init.token ?? env.write } : {}),
      ...(init.headers ?? {}),
    },
    body: init.body === undefined ? undefined : typeof init.body === "string" ? init.body : JSON.stringify(init.body),
  });
  const text = await res.text();
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch { /* texto puro ($count, $metadata) */ }
  return { status: res.status, headers: res.headers, body };
}

/** Cria e devolve o corpo (falha o teste se não for 201). */
export async function create(set: string, body: unknown, token?: string): Promise<any> {
  const r = await api(`/${set}`, { body, token });
  if (r.status !== 201) throw new Error(`POST /${set} → ${r.status}: ${JSON.stringify(r.body)}`);
  return r.body;
}

let rpcId = 0;
export async function mcp(method: string, params: unknown = {}, token = env.write): Promise<any> {
  const res = await fetch(`${env.url}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-06-18",
      "User-Key": token,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  return await res.json();
}

/** Chama uma tool MCP e devolve { isError, data (JSON entre <open_data>), text }. */
export async function tool(name: string, args: Record<string, unknown> = {}, token = env.write) {
  const r = await mcp("tools/call", { name, arguments: args }, token);
  if (r.error) return { isError: true, data: null, text: JSON.stringify(r.error), rpcError: r.error };
  const text: string = r.result.content?.[0]?.text ?? "";
  const m = /<open_data>\n([\s\S]*)\n<\/open_data>/.exec(text);
  let data: any = null;
  if (m) data = JSON.parse(m[1]);
  return { isError: !!r.result.isError, data, text, structured: r.result.structuredContent };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
