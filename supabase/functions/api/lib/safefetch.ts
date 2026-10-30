// Download de arquivo por URL (SourceUrl) com proteção contra SSRF: só https público, sem credenciais na URL, sem
// destinos internos (localhost, redes privadas, link-local/metadata, CGNAT…), redirecionamentos revalidados a cada salto,
// limite de tamanho e de tempo. O DNS é resolvido aqui para conferir TODOS os endereços do nome.
import { validation } from "./errors.ts";

export interface Downloaded {
  bytes: Uint8Array;
  contentType: string;
  /** Último trecho do caminho da URL final (nome sugerido). */
  name: string;
}

type Resolver = (host: string) => Promise<string[]>;

const defaultResolver: Resolver = async (host) => {
  const out: string[] = [];
  for (const type of ["A", "AAAA"] as const) {
    try {
      out.push(...await Deno.resolveDns(host, type));
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) continue;
      if (e instanceof Error && /not (implemented|supported)|unsupported/i.test(e.message)) throw e;
      // NXDOMAIN/sem registro daquele tipo: tenta o outro
    }
  }
  return out;
};

let resolver: Resolver = defaultResolver;
let fetcher: typeof fetch = (...a) => fetch(...a);
/** Só para testes. */
export function setNetwork(r?: Resolver, f?: typeof fetch) {
  resolver = r ?? defaultResolver;
  fetcher = f ?? ((...a) => fetch(...a));
}

const v4 = (ip: string): number[] | null => {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const o = m.slice(1).map(Number);
  return o.every((n) => n <= 255) ? o : null;
};

/** true se o IP não é um destino público e roteável. */
export function isPrivateIp(ip: string): boolean {
  const a = v4(ip);
  if (a) {
    const [x, y] = a;
    return x === 0 || x === 10 || x === 127 || (x === 100 && y >= 64 && y <= 127) || (x === 169 && y === 254) ||
      (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 0) || (x === 192 && y === 168) || (x === 198 && (y === 18 || y === 19)) ||
      x >= 224;
  }
  const s = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (!s.includes(":")) return true; // não é IP: não confiamos
  if (s === "::" || s === "::1") return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s); // IPv4 mapeado
  if (mapped) return isPrivateIp(mapped[1]);
  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(s);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16), lo = parseInt(mappedHex[2], 16);
    return isPrivateIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  const first = parseInt(s.split(":")[0] || "0", 16);
  return (first & 0xfe00) === 0xfc00 /* fc00::/7 */ || (first & 0xffc0) === 0xfe80 /* fe80::/10 */ || (first & 0xff00) === 0xff00 /* multicast */ ||
    s.startsWith("64:ff9b:") /* NAT64 */ || s.startsWith("2001:db8");
}

async function assertPublicHost(u: URL) {
  if (u.protocol !== "https:") throw validation("SourceUrl precisa ser https.", "SourceUrl");
  if (u.username || u.password) throw validation("SourceUrl não pode ter usuário/senha na URL.", "SourceUrl");
  if (u.port && u.port !== "443") throw validation("SourceUrl só aceita a porta padrão (443).", "SourceUrl");
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  const literal = v4(host) || host.includes(":");
  if (literal) {
    if (isPrivateIp(host)) throw validation("SourceUrl aponta para um endereço interno/privado, que não é permitido.", "SourceUrl");
    return;
  }
  if (!host.includes(".") || host === "localhost" || /\.(localhost|local|internal|intranet|lan|home|corp|test|invalid)$/.test(host)) {
    throw validation("SourceUrl precisa ser um endereço público na internet (nada de localhost, rede interna ou nome sem domínio).", "SourceUrl");
  }
  let addrs: string[];
  try {
    addrs = await resolver(host);
  } catch {
    // runtime sem DNS programático: ficam valendo as checagens de nome acima (IP literal já foi barrado)
    return;
  }
  if (!addrs.length) throw validation(`Não foi possível resolver ${host}.`, "SourceUrl");
  if (addrs.some(isPrivateIp)) throw validation("SourceUrl resolve para um endereço interno/privado, que não é permitido.", "SourceUrl");
}

export async function downloadFile(rawUrl: string, maxBytes: number, opts: { timeoutMs?: number; maxRedirects?: number } = {}): Promise<Downloaded> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw validation("SourceUrl inválida.", "SourceUrl");
  }
  const signal = AbortSignal.timeout(opts.timeoutMs ?? 30_000);
  for (let hop = 0; hop <= (opts.maxRedirects ?? 3); hop++) {
    await assertPublicHost(url);
    let res: Response;
    try {
      res = await fetcher(url, { redirect: "manual", signal, headers: { "User-Agent": "OpenAPI-DocFetch/1", Accept: "*/*" } });
    } catch {
      throw validation("Não foi possível baixar o arquivo de SourceUrl (sem resposta ou demorou demais).", "SourceUrl");
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      await res.body?.cancel();
      if (!loc) throw validation("SourceUrl redirecionou sem destino.", "SourceUrl");
      url = new URL(loc, url);
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw validation(`O download de SourceUrl falhou (HTTP ${res.status}).`, "SourceUrl");
    }
    const tooBig = () => validation(`O arquivo passa do limite de ${Math.round(maxBytes / 1048576)} MB.`, "SourceUrl");
    const declared = Number(res.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > maxBytes) {
      await res.body?.cancel();
      throw tooBig();
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = res.body?.getReader();
    try {
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw tooBig();
        }
        chunks.push(value);
      }
    } catch (e) {
      if (e instanceof Error && e.name === "ApiError") throw e;
      if ((e as { status?: number })?.status) throw e;
      throw validation("O download de SourceUrl foi interrompido.", "SourceUrl");
    }
    const bytes = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      bytes.set(c, off);
      off += c.byteLength;
    }
    let name = url.pathname.split("/").filter(Boolean).pop() ?? "";
    try {
      name = decodeURIComponent(name);
    } catch { /* fica como veio */ }
    return { bytes, contentType: (res.headers.get("content-type") ?? "").split(";")[0].trim(), name };
  }
  throw validation("SourceUrl redireciona vezes demais.", "SourceUrl");
}
