// Copia as funções PURAS de domínio do app (src/) para api/domain/, sem alterar os originais.
// Reescreve só os imports ('@/types' → './types.ts', './x' → './x.ts'). Cada arquivo gerado leva o
// hash SHA-256 da origem: `--check` falha se o app mudou e a cópia não foi refeita.
//
//   deno run -A supabase/functions/api/tools/sync-domain.ts          # (re)gera
//   deno run -A supabase/functions/api/tools/sync-domain.ts --check  # só confere (CI)

const ROOT = new URL("../../../../", import.meta.url);
const OUT = new URL("../domain/", import.meta.url);

const FILES: Record<string, string> = {
  "src/types/index.ts": "types.ts",
  "src/utils/businessDays.ts": "businessDays.ts",
  "src/utils/statusCalc.ts": "statusCalc.ts",
  "src/utils/dateEngine.ts": "dateEngine.ts",
  "src/utils/criticalPath.ts": "criticalPath.ts",
  "src/utils/signals.ts": "signals.ts",
  "src/utils/projectStats.ts": "projectStats.ts",
};

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function rewrite(src: string): string {
  return src
    .replace(/from '@\/types'/g, "from './types.ts'")
    .replace(/from '\.\/(\w+)'/g, "from './$1.ts'");
}

const check = Deno.args.includes("--check");
let drift = 0;
await Deno.mkdir(OUT, { recursive: true });

for (const [from, to] of Object.entries(FILES)) {
  // quebra de linha normalizada: o hash é o mesmo no Windows (autocrlf → CRLF) e no CI (Linux, LF)
  const source = (await Deno.readTextFile(new URL(from, ROOT))).replace(/\r\n/g, "\n");
  const hash = await sha256(source);
  const header = `// GERADO por tools/sync-domain.ts — NÃO EDITAR. Origem: ${from} (sha256 ${hash})\n`;
  const target = new URL(to, OUT);
  if (check) {
    const current = await Deno.readTextFile(target).catch(() => "");
    if (!current.startsWith(header)) {
      console.error(`DIVERGENTE: ${from} mudou desde a última cópia → rode tools/sync-domain.ts`);
      drift++;
    }
    continue;
  }
  await Deno.writeTextFile(target, header + rewrite(source));
  console.log(`ok ${from} → domain/${to}`);
}

if (check && drift) Deno.exit(1);
if (check) console.log("domain/ em dia com src/.");
