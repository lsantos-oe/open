// Acesso ao Postgres.
//
// Regra central de segurança: toda leitura/escrita de dados do app roda dentro de `withUser`, que abre
// uma transação com `set local role authenticated` + as claims do usuário. Assim o RLS, o auth.uid() e
// os triggers existentes (notificações, menções, fila do Discord, collab) funcionam exatamente como
// quando a pessoa usa a tela — e com a autoria correta.
//
// `admin()` (sem troca de papel) é usado SOMENTE para o schema open_api (tokens, log, idempotência).
import postgres from "postgres";
import { config } from "./config.ts";
import { ApiError, fromDbError } from "./errors.ts";

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

let client: Sql | undefined;

export function admin(): Sql {
  if (!client) {
    if (!config.dbUrl) throw new Error("API_DB_URL/SUPABASE_DB_URL não configurada.");
    client = postgres(config.dbUrl, {
      prepare: false, // compatível com o pooler em modo transação
      // conexões simultâneas por instância (use o pooler do Supabase em modo transação, porta 6543, em produção)
      max: Number(Deno.env.get("API_DB_POOL") ?? "10"),
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: () => {},
      // datas puras (date) ficam como 'YYYY-MM-DD'; numeric vira number
      types: {
        date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
        numeric: { to: 1700, from: [1700], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
      },
    });
  }
  return client;
}

export interface DbUser {
  id: string;
  email: string | null;
}

class DryRunRollback extends Error {}

export interface TxOptions {
  readOnly?: boolean;
  /** Executa tudo e desfaz no final (Prefer: dry-run). */
  dryRun?: boolean;
}

export async function withUser<T>(user: DbUser, fn: (tx: Tx) => Promise<T>, opts: TxOptions = {}): Promise<T> {
  let result!: T;
  try {
    await admin().begin(async (tx) => {
      // Uma ida ao banco só: papel do app (= SET LOCAL ROLE), claims do usuário e, em leituras, modo somente leitura.
      const claims = JSON.stringify({ sub: user.id, role: "authenticated", aud: "authenticated", email: user.email });
      await tx`select set_config('transaction_read_only', ${opts.readOnly ? "on" : "off"}, true),
                      set_config('role', 'authenticated', true),
                      set_config('request.jwt.claims', ${claims}, true),
                      set_config('request.jwt.claim.sub', ${user.id}, true)`;
      result = await fn(tx);
      if (opts.dryRun) throw new DryRunRollback();
    });
  } catch (e) {
    if (e instanceof DryRunRollback) return result;
    if (e instanceof ApiError) throw e;
    throw fromDbError(e);
  }
  return result;
}

/** Executa algo como o dono (postgres) dentro da transação do usuário — usado para ler tabelas sem
 *  policy de SELECT que o app grava por trigger (ex.: conferir a fila do Discord em testes). Raro. */
export async function asOwner<T>(tx: Tx, fn: () => Promise<T>): Promise<T> {
  await tx.unsafe("reset role");
  try {
    return await fn();
  } finally {
    await tx.unsafe("set local role authenticated");
  }
}
