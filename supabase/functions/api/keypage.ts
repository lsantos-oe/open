// Página "Minha chave" (/api/minha-chave): a pessoa entra com o mesmo login Google do Open e vê, copia ou troca a
// sua User-Key, e pode desconectar os apps vinculados (conector do Claude). Não usa biblioteca nem endereço do
// provedor de login no navegador: o login passa pela própria API (/api/auth/google) e a sessão volta no fragmento
// da URL (#access_token=...), que fica só nesta aba (sessionStorage).

import { appUrlOf, BASE_CSS, FAVICON, GOOGLE_ICON, topBar } from "./brand.ts";

export function keyPageHtml(opts: { root: string }): string {
  const cfg = JSON.stringify({ root: opts.root });
  // Endereço do app (a API vive em <app>/api): leva de volta ao Open.
  const appUrl = appUrlOf(opts.root);
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="referrer" content="no-referrer" />
<meta name="color-scheme" content="light dark" />
<title>Minha chave — Open API</title>
<link rel="icon" href="${FAVICON}" />
<style>${BASE_CSS}
  main { max-width:760px; margin:0 auto; padding:32px 20px 64px; }
  .lead { max-width:62ch; }
  .card-head { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:14px; }
  .label { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-tertiary); }
  .who { font-size:13px; color:var(--text-tertiary); }
  .key { flex:1; min-width:240px; padding:9px 12px; border:0.5px solid var(--border-default); border-radius:var(--radius-md); background:var(--surface-input);
    font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:13px; overflow-wrap:anywhere; color:var(--text-primary); }
  .meta { font-size:12.5px; color:var(--text-tertiary); margin-top:10px; }
  .actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:16px; padding-top:16px; border-top:0.5px solid var(--border-default); }
  .actions .push { margin-left:auto; }
  .signin { max-width:400px; margin:48px auto 0; text-align:center; padding:36px 32px; }
  .signin .wordmark { margin-bottom:6px; }
  .signin p { color:var(--text-tertiary); font-size:13px; margin-bottom:24px; }
  .signin a.btn { width:100%; padding:10px 20px; font-size:14px; }
  .steps { margin:10px 0 0; padding:0; list-style:none; counter-reset:s; display:grid; gap:10px; }
  .steps li { counter-increment:s; display:flex; gap:10px; color:var(--text-secondary); }
  .steps li::before { content:counter(s); flex:0 0 22px; height:22px; border-radius:999px; background:var(--oe-primary-light); color:var(--oe-primary); font-size:12px; font-weight:700; display:flex; align-items:center; justify-content:center; margin-top:1px; }
  .grid { display:grid; grid-template-columns:1fr; gap:16px; }
  @media (min-width:700px) { .grid { grid-template-columns:1fr 1fr; } }
  .grid .card { margin-top:0; }
  .code { position:relative; margin-top:10px; }
  pre { margin:0; background:var(--surface-subtle); border:0.5px solid var(--border-default); border-radius:var(--radius-md); padding:12px 70px 12px 12px; overflow:auto;
    font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:12.5px; white-space:pre-wrap; overflow-wrap:anywhere; color:var(--text-primary); }
  .copy { position:absolute; top:7px; right:7px; padding:3px 9px; font-size:12px; }
</style>
</head>
<body>
${topBar(appUrl, `<a id="docs" href="#">Documentação</a><a href="${appUrl}/">Abrir o Open</a>`)}
<main>
  <h1>Minha chave da Open API</h1>
  <p class="lead">A sua <strong>User-Key</strong> vai no cabeçalho <code>User-Key</code> para usar a API e o MCP em scripts, n8n e Postman.
  Ela dá o mesmo acesso que você tem no Open — <strong>não compartilhe</strong>. Para o Claude, prefira o plugin: ele usa o seu login, sem chave.</p>

  <div class="card signin" id="login" hidden>
    <div class="wordmark"><span>op</span><span class="en">en</span></div>
    <p>Entre com a sua conta Google da Ploomes para ver a sua chave.</p>
    <a class="btn" id="btn-login" href="#">
      ${GOOGLE_ICON}
      Entrar com Google
    </a>
    <div class="msg warn" id="msg-login" role="status"></div>
    <div class="foot">Apenas contas @ploomes.com autorizadas</div>
  </div>

  <div id="panel" hidden>
    <div class="card">
      <div class="card-head">
        <div class="row"><span class="label">Sua User-Key</span><span class="pill">Ativa</span></div>
        <span class="who">Conectado como <strong id="who"></strong></span>
      </div>
      <div class="row">
        <span class="key" id="key">••••••••••••••••••••••••••••••••••••••••••••</span>
        <button id="btn-show">Mostrar</button>
        <button class="primary" id="btn-copy">Copiar</button>
      </div>
      <div class="meta" id="meta"></div>
      <div class="actions">
        <button id="btn-rotate">Gerar nova chave</button>
        <button class="danger" id="btn-apps" title="Desliga o Open em todos os apps vinculados com a sua conta (conectores do Claude)">Desconectar apps</button>
        <button class="ghost push" id="btn-logout">Sair</button>
      </div>
      <div class="msg" id="msg" role="status"></div>
    </div>

    <div class="card">
      <h2>Claude — plugin do Open <span class="pill" style="background:var(--oe-primary-light);color:var(--oe-primary)">Recomendado</span></h2>
      <p>Usa o seu login do Google, sem chave: o Claude age como você.</p>
      <div class="row" style="margin-top:12px"><a class="btn" href="${appUrl}/downloads/open-plugin.zip" download>Baixar o plugin (.zip)</a></div>
      <ol class="steps">
        <li><span>No Claude: <strong>Plugins → Adicionar → Fazer upload de plugin</strong> e escolha o arquivo baixado, sem descompactar (ou instale o plugin compartilhado com você).</span></li>
        <li><span>No plugin, aba <strong>Conectores → open → Vincular</strong>; entre com o Google e clique em <strong>Permitir</strong>.</span></li>
        <li><span>No Claude Code: <code>/mcp</code> → <strong>open</strong> → <strong>Authenticate</strong>.</span></li>
      </ol>
    </div>

    <div class="grid" style="margin-top:16px">
      <div class="card">
        <h2>Claude Code com a chave</h2>
        <p>Sem o plugin, ligue o MCP direto com a sua chave.</p>
        <div class="code"><pre id="ex-claude"></pre><button class="copy" data-copy="ex-claude">Copiar</button></div>
      </div>
      <div class="card">
        <h2>Testar no terminal</h2>
        <p>Confirma que a chave funciona.</p>
        <div class="code"><pre id="ex-curl"></pre><button class="copy" data-copy="ex-curl">Copiar</button></div>
      </div>
    </div>

    <div class="card">
      <h2>n8n, Postman e outras ferramentas</h2>
      <p>Adicione o cabeçalho <code>User-Key</code> com a sua chave. Endereço base (OData): <code id="base"></code></p>
      <p style="margin-top:10px"><a href="#" id="docs2">Documentação completa da API →</a></p>
    </div>
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
  $("docs").href = CFG.root + "/docs"; $("docs2").href = CFG.root + "/docs";
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
$("docs").href = CFG.root + "/docs"; $("docs2").href = CFG.root + "/docs";
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
document.querySelectorAll("[data-copy]").forEach((b) => {
  b.onclick = async () => {
    await navigator.clipboard.writeText($(b.dataset.copy).textContent);
    const old = b.textContent; b.textContent = "Copiado"; setTimeout(() => { b.textContent = old; }, 1400);
  };
});
load();
</script>
</body>
</html>`;
}
