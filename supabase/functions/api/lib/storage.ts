// Arquivos da documentação no Storage do Supabase (bucket privado project-files).
//
// A função não tem sessão Supabase do usuário (ele usa chave/OAuth do Open), então o Storage é acessado com a service
// role — por isso este módulo é a ÚNICA porta: quem chama já autorizou a operação na transação do usuário (RLS) e os
// caminhos só podem ficar em "documentation/…". Nos testes, troque a implementação com setStorage().
import { config } from "./config.ts";
import { ApiError } from "./errors.ts";

export const BUCKET = "project-files";
export const DOC_PREFIX = "documentation/";

export interface StorageApi {
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  remove(paths: string[]): Promise<void>;
  /** Link assinado (com domínio) válido por `expiresIn` segundos. */
  signedUrl(path: string, expiresIn: number): Promise<string>;
}

let override: StorageApi | undefined;
export function setStorage(s: StorageApi | undefined) {
  override = s;
}

const unavailable = (why: string) => new ApiError(503, "StorageUnavailable", `Arquivos indisponíveis: ${why}`);

const safePath = (path: string) => {
  if (path.startsWith("/") || path.split("/").some((s) => s === ".." || s === "" || s === ".")) throw new ApiError(400, "BadRequest", "Caminho de arquivo inválido.");
  return path.split("/").map(encodeURIComponent).join("/");
};

function supabaseStorage(): StorageApi {
  if (!config.supabaseUrl || !config.serviceRoleKey) {
    throw unavailable("a função não tem SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (o Supabase injeta as duas nas Edge Functions).");
  }
  const base = `${config.supabaseUrl.replace(/\/$/, "")}/storage/v1`;
  const auth = { Authorization: `Bearer ${config.serviceRoleKey}`, apikey: config.serviceRoleKey };
  const call = async (url: string, init: RequestInit) => {
    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
    } catch {
      throw unavailable("o Storage não respondeu.");
    }
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      console.error("storage", res.status, detail);
      throw unavailable(`o Storage recusou a operação (HTTP ${res.status}).`);
    }
    return res;
  };
  return {
    async upload(path, bytes, contentType) {
      await call(`${base}/object/${BUCKET}/${safePath(path)}`, {
        method: "POST",
        headers: { ...auth, "Content-Type": contentType, "x-upsert": "false", "cache-control": "max-age=3600" },
        body: bytes as unknown as BodyInit,
      });
    },
    async remove(paths) {
      if (!paths.length) return;
      await call(`${base}/object/${BUCKET}`, {
        method: "DELETE",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: paths }),
      });
    },
    async signedUrl(path, expiresIn) {
      const res = await call(`${base}/object/sign/${BUCKET}/${safePath(path)}`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn }),
      });
      const j = await res.json() as { signedURL?: string };
      if (!j.signedURL) throw unavailable("o Storage não devolveu o link assinado.");
      return `${base}${j.signedURL.startsWith("/") ? "" : "/"}${j.signedURL}`;
    },
  };
}

export const storage = (): StorageApi => override ?? supabaseStorage();

/** Só mexemos em objetos da documentação (o resto do bucket é dos anexos de tarefas, com outro ciclo de vida). */
export const isDocPath = (p: string | null | undefined): p is string => !!p && p.startsWith(DOC_PREFIX) && !p.includes("..");
