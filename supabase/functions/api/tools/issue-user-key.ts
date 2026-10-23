// Mostra (ou gera) a User-Key de uma pessoa direto no banco — para o admin fazer o bootstrap ou criar a chave de
// um usuário-robô de automação. No dia a dia, cada pessoa pega a sua em /api/minha-chave.
//
//   deno run -A --env-file=<ambiente>.env tools/issue-user-key.ts --email pessoa@ploomes.com [--rotate]
import { parseArgs } from "@std/cli/parse-args";
import { admin } from "../lib/db.ts";
import { getOrCreateUserKey, rotateUserKey } from "../lib/userkeys.ts";

const args = parseArgs(Deno.args, { string: ["email"], boolean: ["rotate"] });
if (!args.email) {
  console.error("Informe --email");
  Deno.exit(1);
}
const sql = admin();
const [p] = await sql<{ id: string; active: boolean }[]>`select id, active from public.profiles where lower(email) = lower(${args.email})`;
if (!p) {
  console.error(`Usuário ${args.email} não existe no Open (precisa ter entrado ao menos uma vez).`);
  Deno.exit(1);
}
if (!p.active) {
  console.error("Usuário inativo.");
  Deno.exit(1);
}
const info = args.rotate ? await rotateUserKey(p.id) : await getOrCreateUserKey(p.id);
console.log(info.UserKey);
await sql.end();
