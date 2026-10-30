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
  /** URL assinada de UPLOAD de um único caminho, sem sobrescrever (sem upsert): quem tem a URL só consegue criar esse objeto. */
  signedUploadUrl(path: string): Promise<string>;
  /** Metadados do objeto (tamanho e tipo) ou null se não existe. */
  head(path: string): Promise<{ size: number; contentType: string } | null>;
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
    // Storage API: POST /object/upload/sign/<bucket>/<path> → { url: "/object/upload/sign/<bucket>/<path>?token=…", token }.
    // O upload é um PUT nessa URL (o token é a credencial; vale ~2 h, prazo fixo do Supabase). x-upsert=false: não sobrescreve.
    async signedUploadUrl(path) {
      const res = await call(`${base}/object/upload/sign/${BUCKET}/${safePath(path)}`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json", "x-upsert": "false" },
        body: "{}",
      });
      const j = await res.json() as { url?: string; token?: string };
      const rel = j.url ?? (j.token ? `/object/upload/sign/${BUCKET}/${safePath(path)}?token=${encodeURIComponent(j.token)}` : "");
      if (!rel) throw unavailable("o Storage não devolveu a URL de upload.");
      return `${base}${rel.startsWith("/") ? "" : "/"}${rel}`;
    },
    async head(path) {
      let res: Response;
      try {
        res = await fetch(`${base}/object/authenticated/${BUCKET}/${safePath(path)}`, { method: "HEAD", headers: auth, signal: AbortSignal.timeout(30_000) });
      } catch {
        throw unavailable("o Storage não respondeu.");
      }
      if (res.status === 404 || res.status === 400) return null;
      if (!res.ok) throw unavailable(`o Storage recusou a consulta (HTTP ${res.status}).`);
      const size = Number(res.headers.get("content-length") ?? "");
      if (!Number.isFinite(size)) throw unavailable("o Storage não informou o tamanho do arquivo.");
      return { size, contentType: res.headers.get("content-type") ?? "" };
    },
  };
}

export const storage = (): StorageApi => override ?? supabaseStorage();

/** Só mexemos em objetos da documentação (o resto do bucket é dos anexos de tarefas, com outro ciclo de vida). */
export const isDocPath = (p: string | null | undefined): p is string => !!p && p.startsWith(DOC_PREFIX) && !p.includes("..");
