// Idempotency-Key: repetir a mesma escrita (ex.: agente que reenviou após timeout) devolve a resposta original
// em vez de criar de novo. Mesma chave com corpo/rota diferente → 422.
//
// Atômico: a chave é RESERVADA (insert ... on conflict do nothing) antes de executar. Dois envios simultâneos com a
// mesma chave: um executa; o outro recebe 409 "em processamento" (e, depois, a resposta original ao repetir).
import { admin } from "./db.ts";
import { ApiError } from "./errors.ts";

async function sha(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type IdemStart =
  | { hit: true; status: number; response: unknown }
  | { hit: false; hash: string };

/** status 0 = reservado (em processamento). */
export async function beginIdempotent(userId: string, key: string, request: string): Promise<IdemStart> {
  if (key.length < 8 || key.length > 200) throw new ApiError(400, "BadRequest", "Idempotency-Key deve ter de 8 a 200 caracteres.");
  const hash = await sha(request);
  const reserved = await admin()`
    insert into open_api.idempotency (user_id, key, request_hash, status, response)
    values (${userId}, ${key}, ${hash}, 0, null)
    on conflict (user_id, key) do nothing
    returning key`;
  if (reserved.length) return { hit: false, hash };
  const [row] = await admin()<{ request_hash: string; status: number; response: unknown }[]>`
    select request_hash, status, response from open_api.idempotency where user_id = ${userId} and key = ${key}`;
  if (!row) return await beginIdempotent(userId, key, request); // reserva liberada no meio do caminho
  if (row.request_hash !== hash) {
    throw new ApiError(422, "IdempotencyKeyReused", "Esta Idempotency-Key já foi usada com outro corpo/rota.");
  }
  if (row.status === 0) {
    throw new ApiError(409, "IdempotencyInProgress", "Uma requisição com esta Idempotency-Key ainda está em processamento. Repita em instantes.");
  }
  return { hit: true, status: row.status, response: row.response };
}

export async function finishIdempotent(userId: string, key: string, hash: string, status: number, response: unknown) {
  await admin()`
    update open_api.idempotency set status = ${status}, response = ${admin().json((response ?? null) as never)}
    where user_id = ${userId} and key = ${key} and request_hash = ${hash}`;
}

/** Libera a reserva (erro ou dry-run): a mesma chave pode ser usada de novo. */
export async function abortIdempotent(userId: string, key: string, hash: string) {
  await admin()`delete from open_api.idempotency where user_id = ${userId} and key = ${key} and request_hash = ${hash} and status = 0`;
}
