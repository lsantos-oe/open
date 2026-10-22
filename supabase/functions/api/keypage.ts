// Página "Minha chave" (/api/minha-chave): a pessoa entra com o mesmo login Google do Open e vê, copia ou troca a
// sua User-Key, e pode desconectar os apps vinculados (conector do Claude). Não usa biblioteca nem endereço do
// provedor de login no navegador: o login passa pela própria API (/api/auth/google) e a sessão volta no fragmento
// da URL (#access_token=...), que fica só nesta aba (sessionStorage).

export function keyPageHtml(opts: { root: string }): string {
  const cfg = JSON.stringify({ root: opts.root });
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="referrer" content="no-referrer" />
<title>Minha chave — Open API</title>
<style>
  :root { --bg:#FBFAF8; --card:#FFFFFF; --text:#1C1815; --muted:#5A5347; --line:#E8E3DC; --soft:#F5F2EE; --accent:#D9530E; --accent-hover:#B8440A; --ok:#1A8850; --warn:#A8790A; }
  @media (prefers-color-scheme: dark) { :root { --bg:#131110; --card:#1C1815; --text:#F2EEE8; --muted:#C7BFB2; --line:#322C24; --soft:#292319; --accent:#E8642A; --accent-hover:#D9530E; --ok:#3FBE80; --warn:#D6A93B; } }
  * { box-sizing: border-box; }
  body { margin:0; font:15px/1.55 -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif; background:var(--bg); color:var(--text); }
  main { max-width:760px; margin:0 auto; padding:40px 16px 64px; }
  .brand { display:flex; align-items:center; gap:10px; font-weight:700; font-size:18px; margin-bottom:24px; }
  .brand svg { width:28px; height:28px; }
  h1 { font-size:24px; margin:0 0 4px; } h2 { font-size:16px; margin:28px 0 8px; }
  p { color:var(--muted); margin:6px 0; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:20px; margin-top:20px; }
  .row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  code, .key, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .key { flex:1; min-width:240px; padding:10px 12px; border:1px solid var(--line); border-radius:10px; background:var(--soft); overflow-wrap:anywhere; }
  button, a.btn { font:inherit; border-radius:10px; padding:9px 14px; border:1px solid var(--line); background:var(--card); color:var(--text); cursor:pointer; text-decoration:none; }
  button.primary, a.btn.primary { background:var(--accent); color:#fff; border-color:var(--accent); font-weight:600; }
  button.primary:hover, a.btn.primary:hover { background:var(--accent-hover); }
  button:disabled { opacity:.6; cursor:default; }
  pre { background:var(--soft); border:1px solid var(--line); border-radius:10px; padding:12px; overflow:auto; font-size:13px; white-space:pre-wrap; overflow-wrap:anywhere; }
  ol { color:var(--muted); padding-left:20px; margin:6px 0; }
  .meta { font-size:13px; color:var(--muted); margin-top:8px; }
  .msg { font-size:14px; margin-top:10px; } .ok { color:var(--ok); } .warn { color:var(--warn); }
  a { color:var(--accent); }
</style>
</head>
<body>
<main>
  <div class="brand"><svg viewBox="0 0 100 100" aria-hidden="true"><path fill="#D9530E" d="M50 0C77.61 0 100 22.39 100 50C100 77.61 77.61 100 50 100C22.39 100 0 77.61 0 50C0 22.39 22.39 0 50 0ZM50 20C33.43 20 20 33.43 20 50C20 66.57 33.43 80 50 80C64.5 80 76.5 69.7 79.3 56L40 56C38 56 36 54 36 52L36 44C36 42 38 40 40 40L79.3 40C76.5 28.3 64.5 20 50 20Z"/></svg><span>Open</span></div>
  <h1>Minha chave da Open API</h1>
  <p>A sua <strong>User-Key</strong> vai no header <code>User-Key</code> para usar a API e o MCP em scripts, n8n e Postman.
  Ela tem o mesmo acesso que você tem no Open — não compartilhe. Para o Claude, prefira o plugin (abaixo): ele usa o
  seu login, sem chave.</p>

  <div class="card" id="login" hidden>
    <p>Entre com a sua conta Google da Ploomes para ver a sua chave.</p>
    <div class="row" style="margin-top:12px"><a class="btn primary" id="btn-login" href="#">Entrar com Google</a></div>
    <div class="msg" id="msg-login" role="status"></div>
  </div>

  <div class="card" id="panel" hidden>
    <p>Olá, <strong id="who"></strong>.</p>
    <div class="row" style="margin-top:12px">
      <span class="key" id="key">••••••••••••••••••••••••••••••••••••••••••••</span>
      <button id="btn-show">Mostrar</button>
      <button class="primary" id="btn-copy">Copiar</button>
    </div>
    <div class="meta" id="meta"></div>
    <div class="row" style="margin-top:16px">
      <button id="btn-rotate">Gerar nova chave</button>
      <button id="btn-apps" title="Desliga o Open em todos os apps vinculados com a sua conta (conectores do Claude)">Desconectar apps</button>
      <button id="btn-logout">Sair</button>
    </div>
    <div class="msg" id="msg" role="status"></div>

    <h2>Claude — plugin do Open (recomendado)</h2>
    <ol>
      <li>No Claude: <strong>Plugins → Adicionar → Fazer upload de plugin</strong> (ou instale o plugin compartilhado com você).</li>
      <li>No plugin, aba <strong>Conectores → open → Vincular</strong>; entre com o Google e clique em <strong>Permitir</strong>.</li>
      <li>No Claude Code: <code>/mcp</code> → <strong>open</strong> → <strong>Authenticate</strong>.</li>
    </ol>
    <h2>Claude Code sem o plugin (com a chave)</h2>
    <pre id="ex-claude"></pre>
    <h2>Testar no terminal</h2>
    <pre id="ex-curl"></pre>
    <h2>n8n / Postman / outras ferramentas</h2>
    <p>Adicione o header <code>User-Key</code> com a sua chave. Base OData: <code id="base"></code></p>
    <p style="margin-top:16px"><a id="docs" href="#">Documentação completa da API →</a></p>
  </div>
</main>
<script type="module">
const CFG = ${cfg};
const $ = (id) => document.getElementById(id);
const STORE = "open-key-page-session";
let current = null, shown = false;

// Sessão: volta do login no fragmento da URL (#access_token=...&expires_in=...). Guarda só nesta aba.
(function readSession() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get("access_token")) {
    const exp = Date.now() + Number(h.get("expires_in") ?? "3600") * 1000;
    try { sessionStorage.setItem(STORE, JSON.stringify({ token: h.get("access_token"), exp })); } catch {}
    history.replaceState(null, "", location.pathname + location.search);
  } else if (h.get("error_description")) {
    $("msg-login").className = "msg warn";
    $("msg-login").textContent = h.get("error_description");
    history.replaceState(null, "", location.pathname + location.search);
  }
})();

function session() {
  try {
    const s = JSON.parse(sessionStorage.getItem(STORE) ?? "null");
    return s && s.exp > Date.now() + 10000 ? s.token : null;
  } catch { return null; }
}

function render(info) {
  current = info;
  $("key").textContent = shown ? info.UserKey : info.Prefix + "••••••••••••••••••••••••••••••••••••";
  $("btn-show").textContent = shown ? "Ocultar" : "Mostrar";
  const fmt = (s) => s ? new Date(s).toLocaleString("pt-BR") : "nunca";
  $("meta").textContent = "Gerada em " + fmt(info.RotatedAt) + " · último uso: " + fmt(info.LastUsedAt);
  const k = shown ? info.UserKey : "SUA_USER_KEY";
  $("ex-curl").textContent = 'curl -H "User-Key: ' + k + '" ' + CFG.root + "/odata/v1/Me";
  $("ex-claude").textContent = "claude mcp add --transport http open " + CFG.root + '/mcp --header "User-Key: ' + k + '"';
  $("base").textContent = CFG.root + "/odata/v1";
  $("docs").href = CFG.root + "/docs";
}

async function call(path, method = "GET") {
  const res = await fetch(CFG.root + path, { method, headers: { Authorization: "Bearer " + session() } });
  const body = await res.json();
  if (res.status === 401) { try { sessionStorage.removeItem(STORE); } catch {} }
  if (!res.ok) throw new Error(body?.error?.message ?? "Erro " + res.status);
  return body;
}

async function load() {
  if (!session()) { $("login").hidden = false; $("panel").hidden = true; return; }
  $("login").hidden = true; $("panel").hidden = false;
  try {
    const info = await call("/user-key");
    $("who").textContent = info.Email ?? "";
    render(info);
  } catch (e) {
    if (!session()) return load();
    $("msg").className = "msg warn"; $("msg").textContent = e.message;
  }
}

$("btn-login").href = CFG.root + "/auth/google";
$("btn-logout").onclick = () => { try { sessionStorage.removeItem(STORE); } catch {} location.reload(); };
$("btn-show").onclick = () => { shown = !shown; if (current) render(current); };
$("btn-copy").onclick = async () => {
  if (!current) return;
  await navigator.clipboard.writeText(current.UserKey);
  $("msg").className = "msg ok"; $("msg").textContent = "Chave copiada.";
};
$("btn-rotate").onclick = async () => {
  if (!confirm("Gerar uma nova chave? A atual para de funcionar na hora (atualize n8n, scripts e o Claude Code, se usar a chave).")) return;
  $("btn-rotate").disabled = true;
  try { const info = await call("/user-key/rotate", "POST"); render({ ...info }); $("msg").className = "msg ok"; $("msg").textContent = "Nova chave gerada. A anterior não funciona mais."; }
  catch (e) { $("msg").className = "msg warn"; $("msg").textContent = e.message; }
  finally { $("btn-rotate").disabled = false; }
};
$("btn-apps").onclick = async () => {
  if (!confirm("Desconectar o Open de todos os apps vinculados (conectores do Claude)? Para voltar a usar, clique em Vincular de novo.")) return;
  try { const r = await call("/user-key/disconnect-apps", "POST"); $("msg").className = "msg ok"; $("msg").textContent = r.Revoked ? "Apps desconectados." : "Nenhum app conectado."; }
  catch (e) { $("msg").className = "msg warn"; $("msg").textContent = e.message; }
};
load();
</script>
</body>
</html>`;
}
