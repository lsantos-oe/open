// Documentação de projetos e clientes: escrita (links, textos, arquivos, público e etiquetas).
//
// Regras (as mesmas da aba Documentação do app):
//  • Item DIRETO (documentation_items): de um projeto OU de um cliente; Kind Link (Url), Text (Body, Markdown) ou File.
//  • Item ESPELHADO (Source=Task: links e anexos das tarefas de documentação): o conteúdo mora na tarefa; aqui só se
//    classifica (Audience/Tags, em documentation_meta). Para trocar ou tirar o link/arquivo, mexa na tarefa.
//  • Texto: é um documento colaborativo (editor de blocos). Substituir o conteúdo = collab_reset + gravar a projeção
//    Markdown, como a API já faz com clients.notes e projects.overview.
//  • Arquivos: bucket project-files, caminho documentation/<project|client>/<id>/<uuid>_<nome>, até 25 MB. O Storage só
//    é tocado DEPOIS de a transação do usuário (RLS) aceitar o registro; apagar o arquivo acontece só após o COMMIT.
import { z } from "zod";
import type { Ctx } from "../lib/context.ts";
import { onTxEnd } from "../lib/db.ts";
import { config } from "../lib/config.ts";
import { ApiError, notFound, validation } from "../lib/errors.ts";
import { downloadFile } from "../lib/safefetch.ts";
import { isDocPath, storage } from "../lib/storage.ts";
import { Enums } from "../odata/edm.ts";
import { collabReset, Guid, parseBody, Text, zEnum } from "./shared.ts";

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

/** Mesmos limites do app (src/utils/documentation.ts). */
export const DOC_MAX_FILE_BYTES = 25 * 1024 * 1024;
/** Conteúdo inline (ContentBase64) viaja dentro do JSON: acima disso use SourceUrl ou o app. */
export const DOC_MAX_INLINE_BYTES = 8 * 1024 * 1024;
export const DOC_MAX_TEXT_BYTES = 200 * 1024;
export const MAX_TAGS = 12;
export const MAX_TAG_LENGTH = 30;

// ─── schemas ────────────────────────────────────────────────────────────────

/** Etiquetas: sem espaços nas pontas, sem repetir (ignora maiúsculas). Passou de 12 ou de 30 letras = erro claro (nada é cortado em silêncio). */
export const Tags = z.array(z.string()).max(100).transform((raw, ctx) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const t = r.replace(/\s+/g, " ").trim();
    const k = t.toLowerCase();
    if (!t || seen.has(k)) continue;
    if (t.length > MAX_TAG_LENGTH) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Etiqueta "${t.slice(0, 20)}…" passa de ${MAX_TAG_LENGTH} caracteres.` });
      return z.NEVER;
    }
    seen.add(k);
    out.push(t);
  }
  if (out.length > MAX_TAGS) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `No máximo ${MAX_TAGS} etiquetas por item.` });
    return z.NEVER;
  }
  return out;
});

/** Só http/https: um link "javascript:" ficaria clicável no app. */
export const HttpUrl = z.string().trim().min(1).max(2000).refine((s) => {
  try {
    return ["http:", "https:"].includes(new URL(s).protocol);
  } catch {
    return false;
  }
}, "Url precisa ser um endereço http(s) válido.");

const Audience = zEnum(Enums.DocAudience);
const scope = { ProjectId: Guid.optional(), ClientId: Guid.optional() };
const meta = { Audience: Audience.optional(), Tags: Tags.optional() };

export const DocLinkCreate = z.object({ ...scope, Title: Text(200), Url: HttpUrl, ...meta }).strict();
export const DocTextCreate = z.object({ ...scope, Title: Text(200), Body: z.string().optional(), ...meta }).strict();
export const DocFileCreate = z.object({
  ...scope,
  Title: Text(200).optional(),
  FileName: Text(200).optional(),
  ContentBase64: z.string().optional(),
  SourceUrl: z.string().trim().max(2000).optional(),
  /** Caminho devolvido por request_documentation_upload, depois do PUT do arquivo na URL assinada. */
  StoragePath: z.string().trim().max(500).optional(),
  ContentType: z.string().trim().max(120).optional(),
  ...meta,
}).strict();
export const DocPatch = z.object({
  Title: Text(200).optional(),
  Url: HttpUrl.optional(),
  Body: z.string().optional(),
  ...meta,
}).strict();

/** POST /DocumentationItems: o Kind escolhe o formato (Link, Text ou File). */
export const DocCreate = z.object({ Kind: zEnum(Enums.DocKind) }).passthrough();

// ─── apoio ──────────────────────────────────────────────────────────────────

async function ensureScope(ctx: Ctx, d: { ProjectId?: string; ClientId?: string }): Promise<{ kind: "project" | "client"; id: string }> {
  if (!!d.ProjectId === !!d.ClientId) throw validation("Informe exatamente um entre ProjectId e ClientId (o item é de um projeto OU de um cliente).", "ProjectId");
  if (d.ProjectId) {
    const [p] = await ctx.tx`select id from projects where id = ${d.ProjectId}`;
    if (!p) throw validation(`Projeto não encontrado: ${d.ProjectId}.`, "ProjectId");
    return { kind: "project", id: d.ProjectId };
  }
  const [c] = await ctx.tx`select id from clients where id = ${d.ClientId!}`;
  if (!c) throw validation(`Cliente não encontrado: ${d.ClientId}.`, "ClientId");
  return { kind: "client", id: d.ClientId! };
}

const scopeCols = (s: { kind: "project" | "client"; id: string }) => ({ project_id: s.kind === "project" ? s.id : null, client_id: s.kind === "client" ? s.id : null });

function checkBody(body: string) {
  const bytes = new TextEncoder().encode(body).byteLength;
  if (bytes > DOC_MAX_TEXT_BYTES) {
    throw validation(`O texto tem ${Math.ceil(bytes / 1024)} KB e o limite é ${DOC_MAX_TEXT_BYTES / 1024} KB. Divida em mais de uma caixa de texto.`, "Body");
  }
}

const safeFileName = (name: string) => name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_").slice(-120) || "arquivo";

const MIME: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", txt: "text/plain", md: "text/markdown",
  csv: "text/csv", json: "application/json", zip: "application/zip", doc: "application/msword", xls: "application/vnd.ms-excel",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};
const guessType = (name: string) => MIME[name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";

function decodeBase64(raw: string): Uint8Array {
  const clean = raw.replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(clean)) throw validation("ContentBase64 não é base64 válido.", "ContentBase64");
  if (clean.length * 0.75 > DOC_MAX_INLINE_BYTES) {
    throw validation(
      `O conteúdo inline passa de ${DOC_MAX_INLINE_BYTES / 1048576} MB. Para arquivos maiores (até ${DOC_MAX_FILE_BYTES / 1048576} MB) use SourceUrl (https público) ou envie pelo app.`,
      "ContentBase64",
    );
  }
  try {
    const bin = atob(clean.replaceAll("-", "+").replaceAll("_", "/"));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    throw validation("ContentBase64 não é base64 válido.", "ContentBase64");
  }
}

type Found =
  | { source: "direct"; row: Row }
  | { source: "task"; key: string; kind: "link" | "file"; projectId: string; storagePath: string | null };

/** Localiza o item pelo Id da API: direto (documentation_items) ou espelhado (Id derivado de md5 da chave da tarefa). */
async function findItem(ctx: Ctx, id: string, lock = false): Promise<Found> {
  const rows = lock
    ? await ctx.tx<Row[]>`select * from documentation_items where id = ${id} for update`
    : await ctx.tx<Row[]>`select * from documentation_items where id = ${id}`;
  if (rows[0]) return { source: "direct", row: rows[0] };
  const m = await ctx.tx<Row[]>`
    select 'entry-link:' || e.id::text || ':' || (l.value->>'id') as key, 'link' as kind, null::text as storage_path, e.project_id
      from entries e
      cross join lateral jsonb_array_elements(case when jsonb_typeof(e.links) = 'array' then e.links else '[]'::jsonb end) l
     where e.is_documentation and e.type = 'task' and e.project_id is not null
       and md5('entry-link:' || e.id::text || ':' || (l.value->>'id'))::uuid = ${id}
    union all
    select 'entry-file:' || a.id::text, 'file', a.storage_path, e.project_id
      from attachments a join entries e on e.id = a.entity_id
     where a.entity_type = 'entry' and e.is_documentation and e.type = 'task' and e.project_id is not null
       and md5('entry-file:' || a.id::text)::uuid = ${id}`;
  if (!m[0]) throw notFound(`DocumentationItems(${id}) não encontrado (ou sem permissão para vê-lo).`);
  return { source: "task", key: m[0].key, kind: m[0].kind, projectId: m[0].project_id, storagePath: m[0].storage_path };
}

const mirroredMsg = (what: string) =>
  `Este item é um ${what} de uma tarefa de documentação (Source=Task): o conteúdo mora na tarefa. Aqui só dá para mudar Audience e Tags; para trocar ou remover, altere a tarefa (Links/anexos).`;

// ─── criar ──────────────────────────────────────────────────────────────────

export async function createDocLink(ctx: Ctx, body: unknown): Promise<string> {
  const d = parseBody(DocLinkCreate, body);
  const s = await ensureScope(ctx, d);
  const c = scopeCols(s);
  const [r] = await ctx.tx<{ id: string }[]>`
    insert into documentation_items (project_id, client_id, kind, title, url, audience, tags, created_by)
    values (${c.project_id}, ${c.client_id}, 'link', ${d.Title}, ${d.Url}, ${d.Audience ?? "both"}, ${ctx.tx.array(d.Tags ?? [], 1009)}, ${ctx.user.id})
    returning id`;
  return r.id;
}

export async function createDocText(ctx: Ctx, body: unknown): Promise<string> {
  const d = parseBody(DocTextCreate, body);
  if (d.Body) checkBody(d.Body);
  const s = await ensureScope(ctx, d);
  const c = scopeCols(s);
  const [r] = await ctx.tx<{ id: string }[]>`
    insert into documentation_items (project_id, client_id, kind, title, body, audience, tags, created_by)
    values (${c.project_id}, ${c.client_id}, 'text', ${d.Title}, ${d.Body ?? ""}, ${d.Audience ?? "both"}, ${ctx.tx.array(d.Tags ?? [], 1009)}, ${ctx.user.id})
    returning id`;
  return r.id;
}

export async function createDocFile(ctx: Ctx, body: unknown): Promise<string> {
  const d = parseBody(DocFileCreate, body);
  const origins = [d.ContentBase64, d.SourceUrl, d.StoragePath].filter((x) => !!x).length;
  if (origins !== 1) {
    throw validation(
      "Informe a origem do arquivo — uma só: StoragePath (arquivo enviado pela URL de request_documentation_upload; o caminho para arquivos locais), SourceUrl (https público) ou ContentBase64 (só arquivos minúsculos).",
      "StoragePath",
    );
  }
  const s = await ensureScope(ctx, d);
  const c = scopeCols(s);

  // ── arquivo já enviado pela URL assinada: só conferimos e finalizamos (nada trafega por aqui)
  if (d.StoragePath) {
    const path = await checkUploadPath(ctx, s, d.StoragePath);
    const [dup] = await ctx.tx<Row[]>`select id from documentation_items where storage_path = ${path}`;
    if (dup) throw validation("Este StoragePath já virou um item de documentação. Peça outra URL com request_documentation_upload.", "StoragePath");
    const store = storage();
    const info = await store.head(path);
    if (!info) {
      throw validation("O arquivo ainda não está no Storage: o upload não foi concluído (confira a resposta do curl) ou a URL expirou. Peça outra com request_documentation_upload.", "StoragePath");
    }
    if (info.size === 0 || info.size > DOC_MAX_FILE_BYTES) {
      if (!ctx.dryRun) await store.remove([path]); // não deixa o objeto inválido ocupando espaço
      throw validation(info.size === 0 ? "O arquivo enviado está vazio." : `O arquivo enviado tem ${(info.size / 1048576).toFixed(1)} MB e o limite é ${DOC_MAX_FILE_BYTES / 1048576} MB.`, "StoragePath");
    }
    const name = (d.FileName?.trim() || path.slice(path.indexOf("_", path.lastIndexOf("/")) + 1)).slice(0, 200);
    const [r] = await ctx.tx<{ id: string }[]>`
      insert into documentation_items (project_id, client_id, kind, title, storage_path, file_name, file_size, audience, tags, created_by)
      values (${c.project_id}, ${c.client_id}, 'file', ${d.Title?.trim() || name}, ${path}, ${name}, ${info.size}, ${d.Audience ?? "both"},
              ${ctx.tx.array(d.Tags ?? [], 1009)}, ${ctx.user.id})
      returning id`;
    // item não criado (falha antes do COMMIT) = o objeto sai do Storage; em dry-run ele fica para a gravação de verdade
    if (!ctx.dryRun) onTxEnd(ctx.tx, { rollback: () => store.remove([path]) });
    return r.id;
  }

  let bytes: Uint8Array, contentType = d.ContentType ?? "", name = d.FileName ?? "";
  if (d.ContentBase64) {
    bytes = decodeBase64(d.ContentBase64);
  } else {
    const got = await downloadFile(d.SourceUrl!, DOC_MAX_FILE_BYTES);
    bytes = got.bytes;
    contentType ||= got.contentType;
    name ||= got.name;
  }
  if (!name.trim()) throw validation("Informe FileName (nome do arquivo com extensão).", "FileName");
  if (!bytes.byteLength) throw validation("O arquivo está vazio.", "ContentBase64");
  if (bytes.byteLength > DOC_MAX_FILE_BYTES) throw validation(`O arquivo passa de ${DOC_MAX_FILE_BYTES / 1048576} MB.`, "ContentBase64");
  name = name.trim().slice(0, 200);
  contentType ||= guessType(name);
  const path = `documentation/${s.kind}/${s.id}/${crypto.randomUUID()}_${safeFileName(name)}`;
  // 1º o registro (RLS e restrições do banco aceitam?), 2º o Storage. Se algo falhar depois, o arquivo sai do Storage.
  const [r] = await ctx.tx<{ id: string }[]>`
    insert into documentation_items (project_id, client_id, kind, title, storage_path, file_name, file_size, audience, tags, created_by)
    values (${c.project_id}, ${c.client_id}, 'file', ${d.Title?.trim() || name}, ${path}, ${name}, ${bytes.byteLength}, ${d.Audience ?? "both"},
            ${ctx.tx.array(d.Tags ?? [], 1009)}, ${ctx.user.id})
    returning id`;
  if (!ctx.dryRun) {
    const store = storage(); // sem Storage configurado: falha aqui (503) e o registro é desfeito
    onTxEnd(ctx.tx, { rollback: () => store.remove([path]) });
    await store.upload(path, bytes, contentType);
  }
  return r.id;
}

// ─── upload direto por URL assinada (arquivos locais, sem base64 e sem URL pública) ───────────

/** Segredo do carimbo dos caminhos (HMAC): pepper da API + service role. Sem nenhum dos dois não há Storage mesmo. */
const stampKey = () => `${config.tokenPepper}|${config.serviceRoleKey}`;

async function stamp(kind: string, scopeId: string, userId: string, nonce: string): Promise<string> {
  if (!config.tokenPepper && !config.serviceRoleKey) throw new ApiError(503, "StorageUnavailable", "Arquivos indisponíveis: a função não tem SUPABASE_SERVICE_ROLE_KEY.");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(stampKey()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${kind}/${scopeId}/${userId}/${nonce}`)));
  return [...mac.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const hex = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
/** 16 hex de nonce + 16 hex de carimbo, no formato de uuid: só este servidor, para esta pessoa e este escopo, gera um válido. */
const stampedUuid = (nonce: string, mac: string) => `${nonce.slice(0, 8)}-${nonce.slice(8, 12)}-${nonce.slice(12, 16)}-${mac.slice(0, 4)}-${mac.slice(4, 16)}`;

/** O StoragePath precisa ser exatamente do escopo informado, ter o formato gerado por request_documentation_upload e o carimbo desta pessoa. */
async function checkUploadPath(ctx: Ctx, s: { kind: "project" | "client"; id: string }, raw: string): Promise<string> {
  const path = raw.trim();
  const prefix = `documentation/${s.kind}/${s.id}/`;
  const m = path.startsWith(prefix) ? /^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})_([\w.\-]{1,160})$/.exec(path.slice(prefix.length)) : null;
  if (!m) {
    throw validation(`StoragePath precisa ser o caminho devolvido por request_documentation_upload para este mesmo ${s.kind === "project" ? "projeto" : "cliente"} (começa por ${prefix}).`, "StoragePath");
  }
  const nonce = m[1] + m[2] + m[3];
  const mac = m[4] + m[5];
  if (mac !== await stamp(s.kind, s.id, ctx.user.id, nonce)) {
    throw validation("StoragePath não foi gerado por request_documentation_upload para você neste escopo. Peça uma URL de upload e use o caminho que ela devolve.", "StoragePath");
  }
  return path;
}

export const DocUploadRequest = z.object({
  ...scope,
  FileName: Text(200),
  Size: z.number().int().min(1).optional(),
  ContentType: z.string().trim().max(120).optional(),
}).strict();

/** Gera o caminho e a URL assinada de upload (não grava item nenhum). O arquivo é enviado com um PUT dessa URL. */
export async function requestDocumentationUpload(ctx: Ctx, body: unknown) {
  const d = parseBody(DocUploadRequest, body);
  if (d.Size !== undefined && d.Size > DOC_MAX_FILE_BYTES) {
    throw validation(`O arquivo tem ${(d.Size / 1048576).toFixed(1)} MB e o limite é ${DOC_MAX_FILE_BYTES / 1048576} MB.`, "Size");
  }
  const s = await ensureScope(ctx, d);
  const name = d.FileName.trim();
  const nonce = hex(8);
  const path = `documentation/${s.kind}/${s.id}/${stampedUuid(nonce, await stamp(s.kind, s.id, ctx.user.id, nonce))}_${safeFileName(name)}`;
  const url = await storage().signedUploadUrl(path);
  const contentType = d.ContentType || guessType(name);
  return {
    Scope: { Kind: s.kind === "project" ? "Project" : "Client", Id: s.id },
    FileName: name,
    StoragePath: path,
    UploadUrl: url,
    Method: "PUT",
    Headers: { "Content-Type": contentType },
    MaxBytes: DOC_MAX_FILE_BYTES,
    Curl: `curl -sS --fail-with-body -X PUT -H "Content-Type: ${contentType}" --data-binary @"<CAMINHO_DO_ARQUIVO_LOCAL>" "${url}"`,
    ExpiresIn: "até cerca de 2 horas (prazo do Supabase); a URL só permite criar este caminho, uma vez, sem sobrescrever nem listar",
    NextStep: `Rode o Curl trocando <CAMINHO_DO_ARQUIVO_LOCAL> pelo caminho do arquivo (HTTP 200 com {"Key": ...} = enviado). Depois chame create_documentation_file com ${s.kind === "project" ? "ProjectId" : "ClientId"}=${s.id}, StoragePath="${path}", FileName="${name}", Title, Audience e Tags (primeiro com dryRun, depois dryRun=false). Até esse passo o arquivo ainda NÃO é um item da documentação.`,
    Warning: "A UploadUrl é uma credencial temporária: não a mostre nem a guarde.",
  };
}

/** POST /DocumentationItems — Kind: Link | Text | File. */
export function createDocumentationItem(ctx: Ctx, body: unknown): Promise<string> {
  const { Kind, ...rest } = parseBody(DocCreate, body);
  return (Kind === "link" ? createDocLink : Kind === "text" ? createDocText : createDocFile)(ctx, rest);
}

// ─── alterar ────────────────────────────────────────────────────────────────

/** Título, Url (links), Body (textos), Audience e Tags. Itens espelhados: só Audience e Tags (documentation_meta). */
export async function updateDocumentationItem(ctx: Ctx, id: string, body: unknown, _ifMatch?: string | null) {
  const d = parseBody(DocPatch, body);
  const it = await findItem(ctx, id, true);
  if (it.source === "task") {
    if (d.Title !== undefined || d.Url !== undefined || d.Body !== undefined) throw validation(mirroredMsg(it.kind === "link" ? "link" : "arquivo"));
    if (d.Audience === undefined && d.Tags === undefined) return;
    const [cur] = await ctx.tx<Row[]>`select audience, tags from documentation_meta where source_key = ${it.key}`;
    await ctx.tx`
      insert into documentation_meta (source_key, audience, tags, updated_by, updated_at)
      values (${it.key}, ${d.Audience ?? cur?.audience ?? "both"}, ${ctx.tx.array(d.Tags ?? cur?.tags ?? [], 1009)}, ${ctx.user.id}, now())
      on conflict (source_key) do update set audience = excluded.audience, tags = excluded.tags, updated_by = excluded.updated_by, updated_at = now()`;
    return;
  }
  const row = it.row;
  const set: Row = {};
  if (d.Title !== undefined) set.title = d.Title;
  if (d.Url !== undefined) {
    if (row.kind !== "link") throw validation("Url só vale para itens do tipo Link.", "Url");
    set.url = d.Url;
  }
  if (d.Body !== undefined) {
    if (row.kind !== "text") throw validation("Body só vale para itens do tipo Text.", "Body");
    checkBody(d.Body);
    // documento colaborativo: descarta o estado vivo do editor e grava a projeção (quem estiver com o texto aberto vê o novo conteúdo ao reabrir)
    await collabReset(ctx, `doc_${id}_body`);
    set.body = d.Body;
  }
  if (d.Audience !== undefined) set.audience = d.Audience;
  if (d.Tags !== undefined) set.tags = ctx.tx.array(d.Tags, 1009);
  if (Object.keys(set).length) await ctx.tx`update documentation_items set ${ctx.tx(set)} where id = ${id}`;
}

// ─── remover ────────────────────────────────────────────────────────────────

/** Remove um item direto (link, texto ou arquivo; o arquivo sai do Storage depois do COMMIT). */
export async function deleteDocumentationItem(ctx: Ctx, id: string) {
  const it = await findItem(ctx, id, true);
  if (it.source === "task") throw validation(mirroredMsg(it.kind === "link" ? "link" : "arquivo"));
  const r = await ctx.tx`delete from documentation_items where id = ${id} returning id`;
  if (!r.length) throw notFound("Item não encontrado ou sem permissão.");
  const path: string | null = it.row.storage_path;
  if (it.row.kind === "file" && isDocPath(path)) {
    const store = storage(); // eager: sem Storage configurado, não apaga o registro deixando o arquivo órfão
    onTxEnd(ctx.tx, { commit: () => store.remove([path]) });
  }
}

// ─── baixar ─────────────────────────────────────────────────────────────────

/** Link assinado e de curta duração do arquivo (item direto ou anexo de tarefa de documentação). */
export async function documentationFileLink(ctx: Ctx, id: string, a: { ExpiresInSeconds?: number } = {}) {
  const it = await findItem(ctx, id);
  const path: string | null = it.source === "direct" ? (it.row.kind === "file" ? it.row.storage_path : null) : (it.kind === "file" ? it.storagePath : null);
  if (!path) throw validation("Este item não é um arquivo (só arquivos têm link de download).");
  const expires = Math.min(3600, Math.max(60, Math.round(Number(a.ExpiresInSeconds ?? 600)) || 600));
  const url = await storage().signedUrl(path, expires);
  const [info] = await ctx.tx<Row[]>`
    select coalesce(d.title, a.name) as title, coalesce(d.file_name, a.name) as file_name, coalesce(d.file_size, a.size) as file_size, d.code
      from (select 1) x
      left join documentation_items d on d.id = ${id}
      left join attachments a on a.storage_path = ${path} and d.id is null
     limit 1`;
  return {
    Id: id,
    Code: info?.code ?? null,
    Title: info?.title ?? null,
    FileName: info?.file_name ?? null,
    FileSize: info?.file_size != null ? Number(info.file_size) : null,
    Url: url,
    ExpiresInSeconds: expires,
    Note: "Link temporário e privado: não o publique nem o cole em lugares abertos. Peça outro quando expirar.",
  };
}

