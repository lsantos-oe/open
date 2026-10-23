// Contexto de execução de uma operação: usuário, transação, "hoje" (São Paulo) e configurações do app.
import type { AuthUser } from "./auth.ts";
import type { Tx } from "./db.ts";
import { config } from "./config.ts";
import type { Workdays } from "../domain/types.ts";

export interface AppSettings {
  holidays: string[];
  workdays: Workdays;
  defaultLanguage: "pt" | "en" | "es";
}

export interface Ctx {
  user: AuthUser;
  tx: Tx;
  today: string;
  settings: AppSettings;
  dryRun: boolean;
}

/** Data de hoje (YYYY-MM-DD) no fuso do app — o front usa UTC (bug B10 do code review); a API usa São Paulo. */
export function todayInSaoPaulo(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

let cache: { at: number; value: AppSettings } | undefined;

/** Feriados/dias úteis mudam raramente: cache de 60s por instância. */
export async function loadSettings(tx: Tx): Promise<AppSettings> {
  if (cache && Date.now() - cache.at < 60_000) return cache.value;
  const value = await readSettings(tx);
  cache = { at: Date.now(), value };
  return value;
}

async function readSettings(tx: Tx): Promise<AppSettings> {
  const [row] = await tx<{ value: Record<string, unknown> }[]>`select value from settings where key = 'config'`;
  const v = row?.value ?? {};
  return {
    holidays: Array.isArray(v.holidays) ? (v.holidays as string[]) : [],
    workdays: v.workdays === "mon-sat" ? "mon-sat" : "mon-fri",
    defaultLanguage: (["pt", "en", "es"].includes(String(v.defaultLanguage)) ? v.defaultLanguage : "pt") as
      AppSettings["defaultLanguage"],
  };
}

export async function makeCtx(user: AuthUser, tx: Tx, dryRun = false): Promise<Ctx> {
  return { user, tx, today: todayInSaoPaulo(), settings: await loadSettings(tx), dryRun };
}

/** Links da UI do app (mesmas rotas que o front usa). */
export const uiLink = {
  project: (id: string) => `${config.appUrl}/projects/${id}`,
  task: (t: { id: string; project_id?: string | null; incident_id?: string | null }) =>
    t.project_id
      ? `${config.appUrl}/projects/${t.project_id}?task=${t.id}`
      : t.incident_id
      ? `${config.appUrl}/support/${t.incident_id}?task=${t.id}`
      : `${config.appUrl}/tasks?task=${t.id}`,
  incident: (id: string) => `${config.appUrl}/support/${id}`,
  client: (id: string) => `${config.appUrl}/wallet/${id}`,
};

/** Caminho relativo (sem domínio) — é o formato que o app grava em notifications.link. */
export const appPath = {
  project: (id: string) => `/projects/${id}`,
  incident: (id: string) => `/support/${id}`,
};
