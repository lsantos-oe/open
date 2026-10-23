// User-Key (header `User-Key`, como na API do Ploomes): uma chave por pessoa.
// - busca por hash SHA-256 (+ pepper) → rápido e sem decifrar a cada requisição;
// - valor cifrado no Supabase Vault → a pessoa pode ver/copiar de novo na página /api/minha-chave;
// - trocar a chave invalida a anterior imediatamente.
import { admin } from "./db.ts";
import { config } from "./config.ts";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
/** Prefixo fixo facilita detectar vazamento (gitleaks/secret scanning) e diferenciar de outras chaves. */
export const USER_KEY_RE = /^ouk_[A-Za-z0-9]{40}$/;

export function generateUserKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(40));
  let s = "";
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return `ouk_${s}`;
}

export async function hashUserKey(key: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(config.tokenPepper + key));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface UserKeyInfo {
  UserKey: string;
  Prefix: string;
  CreatedAt: string;
  RotatedAt: string;
  LastUsedAt: string | null;
}

interface Row {
  user_id: string;
  prefix: string;
  vault_secret_id: string;
  created_at: Date;
  rotated_at: Date;
  last_used_at: Date | null;
}

const secretName = (userId: string) => `open_api_user_key_${userId}`;

async function reveal(row: Row): Promise<UserKeyInfo> {
  const [s] = await admin()<{ decrypted_secret: string }[]>`
    select decrypted_secret from vault.decrypted_secrets where id = ${row.vault_secret_id}`;
  return {
    UserKey: s?.decrypted_secret ?? "",
    Prefix: row.prefix,
    CreatedAt: row.created_at.toISOString(),
    RotatedAt: row.rotated_at.toISOString(),
    LastUsedAt: row.last_used_at?.toISOString() ?? null,
  };
}

/** Devolve a chave da pessoa, criando na primeira vez. */
export async function getOrCreateUserKey(userId: string, createdBy = userId): Promise<UserKeyInfo> {
  const [row] = await admin()<Row[]>`select * from open_api.user_keys where user_id = ${userId}`;
  if (row) return await reveal(row);
  return await rotateUserKey(userId, createdBy);
}

/** Gera uma chave nova (a anterior deixa de valer na hora). */
export async function rotateUserKey(userId: string, by = userId): Promise<UserKeyInfo> {
  const key = generateUserKey();
  const hash = await hashUserKey(key);
  const row = await admin().begin(async (tx) => {
    const [existing] = await tx<Row[]>`select * from open_api.user_keys where user_id = ${userId} for update`;
    if (existing) {
      await tx`select vault.update_secret(${existing.vault_secret_id}::uuid, ${key})`;
      const [r] = await tx<Row[]>`
        update open_api.user_keys set key_hash = ${hash}, prefix = ${key.slice(0, 8)}, rotated_at = now(), last_used_at = null
        where user_id = ${userId} returning *`;
      return r;
    }
    // remove segredo órfão com o mesmo nome (ex.: linha apagada manualmente)
    await tx`delete from vault.secrets where name = ${secretName(userId)}`;
    const [{ id }] = await tx<{ id: string }[]>`
      select vault.create_secret(${key}, ${secretName(userId)}, 'Open API User-Key') as id`;
    const [r] = await tx<Row[]>`
      insert into open_api.user_keys (user_id, key_hash, prefix, vault_secret_id, created_by)
      values (${userId}, ${hash}, ${key.slice(0, 8)}, ${id}, ${by})
      returning *`;
    return r;
  });
  return { UserKey: key, Prefix: row.prefix, CreatedAt: row.created_at.toISOString(), RotatedAt: row.rotated_at.toISOString(), LastUsedAt: null };
}

/** Informações sem o segredo (para listagens de admin). */
export async function listUserKeys() {
  return await admin()<{ user_id: string; email: string; name: string; prefix: string; rotated_at: Date; last_used_at: Date | null }[]>`
    select k.user_id, p.email, p.name, k.prefix, k.rotated_at, k.last_used_at
    from open_api.user_keys k join public.profiles p on p.id = k.user_id order by p.name`;
}
