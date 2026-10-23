// Página "Minha chave" (/api/minha-chave): a pessoa entra com o mesmo login Google do Open e vê, copia ou troca a
// sua User-Key, e pode desconectar os apps vinculados (conector do Claude). Não usa biblioteca nem endereço do
// provedor de login no navegador: o login passa pela própria API (/api/auth/google) e a sessão volta no fragmento
// da URL (#access_token=...), que fica só nesta aba (sessionStorage).

/** Ícone do Open (o mesmo de public/favicon.svg), usado como ícone da aba. */
const FAVICON = `data:image/svg+xml,${
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="#E65100" fill-rule="evenodd" d="M50 0C77.61 0 100 22.39 100 50C100 77.61 77.61 100 50 100C22.39 100 0 77.61 0 50C0 22.39 22.39 0 50 0ZM50 20C33.43 20 20 33.43 20 50C20 66.57 33.43 80 50 80C64.5 80 76.5 69.7 79.3 56L40 56C38 56 36 54 36 52L36 44C36 42 38 40 40 40L79.3 40C76.5 28.3 64.5 20 50 20Z"/><path fill="#FFFFFF" d="M50 20C60 20 68 25 73 32L88 23C79 11 65 2 50 2Z"/></svg>`,
  )
}`;

export function keyPageHtml(opts: { root: string }): string {
  const cfg = JSON.stringify({ root: opts.root });
  // Endereço do app (a API vive em <app>/api): leva de volta ao Open.
  const appUrl = opts.root.replace(/\/api\/?$/, "") || "/";
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="referrer" content="no-referrer" />
<meta name="color-scheme" content="light dark" />
<title>Minha chave — Open API</title>
<link rel="icon" href="${FAVICON}" />
<style>
  /* Mesmos tokens do app (src/index.css): claro e escuro seguem o sistema. */
  :root {
    --oe-primary:#D9530E; --oe-primary-hover:#B8440A; --oe-primary-light:#FBEAE0;
    --surface-page:#FBFAF8; --surface-card:#FFFFFF; --surface-subtle:#F5F2EE; --surface-input:#FFFFFF;
    --text-primary:#1C1815; --text-secondary:#5A5347; --text-tertiary:#8A8177;
    --border-default:#E8E3DC; --border-strong:#D8D1C6;
    --sidebar-bg:#18140F; --sidebar-border:rgba(255,255,255,0.08); --sidebar-text:rgba(255,255,255,0.6);
    --success-bg:#E8F5EE; --success-text:#1A8850; --danger-bg:#FBEAEA; --danger-text:#D14343; --warning-text:#A8790A;
    --radius-md:10px; --radius-lg:14px; --shadow-sm:0 1px 2px rgba(28,24,21,0.06); --shadow-md:0 4px 16px rgba(28,24,21,0.08);
  }
  @media (prefers-color-scheme: dark) { :root {
    --oe-primary:#E8642A; --oe-primary-hover:#F27A44; --oe-primary-light:rgba(217,83,14,0.18);
    --surface-page:#131110; --surface-card:#292319; --surface-subtle:#1C1815; --surface-input:#1C1815;
    --text-primary:#F2EEE8; --text-secondary:#C7BFB2; --text-tertiary:#93897B;
    --border-default:#322C24; --border-strong:#443C31;
    --success-bg:rgba(26,136,80,0.18); --success-text:#3FBE80; --danger-bg:rgba(209,67,67,0.18); --danger-text:#E5716A; --warning-text:#D6A93B;
    --shadow-sm:0 1px 2px rgba(0,0,0,0.3); --shadow-md:0 4px 16px rgba(0,0,0,0.35);
  } }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--surface-page); color:var(--text-primary); font:14px/1.55 -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
    -webkit-font-smoothing:antialiased; }

  /* Barra do topo: a mesma do menu lateral do app (sempre escura), com o logotipo real */
  .bar { height:52px; background:var(--sidebar-bg); border-bottom:0.5px solid var(--sidebar-border); display:flex; align-items:center; gap:12px; padding:0 20px; }
  .logo { font-weight:800; font-size:17px; letter-spacing:-0.01em; text-decoration:none; color:#fff; display:inline-flex; align-items:center; gap:8px; }
  .logo .en { color:var(--oe-primary); }
  .logo img { width:20px; height:20px; display:block; }
  .tag { font-size:12px; font-weight:500; color:var(--sidebar-text); padding-left:12px; border-left:0.5px solid var(--sidebar-border); }
  .bar nav { margin-left:auto; display:flex; gap:4px; }
  .bar nav a { color:var(--sidebar-text); text-decoration:none; font-size:13px; padding:6px 10px; border-radius:var(--radius-md); }
  .bar nav a:hover { color:#fff; background:rgba(255,255,255,0.08); }
  @media (max-width:560px) { .tag { display:none; } }

  main { max-width:760px; margin:0 auto; padding:32px 20px 64px; }
  h1 { font-size:22px; font-weight:600; letter-spacing:-0.01em; margin:0 0 6px; }
  h2 { font-size:14px; font-weight:600; margin:0 0 4px; }
  p { margin:0; color:var(--text-secondary); }
  .lead { max-width:62ch; }
  code { font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:12.5px; background:var(--surface-subtle); border:0.5px solid var(--border-default); border-radius:6px; padding:1px 5px; color:var(--text-primary); }
  a { color:var(--oe-primary); }

  .card { background:var(--surface-card); border:0.5px solid var(--border-default); border-radius:var(--radius-lg); padding:20px; margin-top:16px; box-shadow:var(--shadow-sm); }
  .card-head { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:14px; }
  .label { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-tertiary); }
  .who { font-size:13px; color:var(--text-tertiary); }
  .row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  .key { flex:1; min-width:240px; padding:9px 12px; border:0.5px solid var(--border-default); border-radius:var(--radius-md); background:var(--surface-input);
    font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:13px; overflow-wrap:anywhere; color:var(--text-primary); }
  .meta { font-size:12.5px; color:var(--text-tertiary); margin-top:10px; }
  .pill { font-size:11px; font-weight:600; padding:2px 8px; border-radius:999px; background:var(--success-bg); color:var(--success-text); }

  button, a.btn { font:inherit; font-size:13px; font-weight:500; border-radius:var(--radius-md); padding:8px 14px; border:0.5px solid var(--border-default);
    background:var(--surface-card); color:var(--text-primary); cursor:pointer; text-decoration:none; transition:background .15s, border-color .15s; display:inline-flex; align-items:center; gap:8px; }
  button:hover, a.btn:hover { background:var(--surface-subtle); }
  button.primary, a.btn.primary { background:var(--oe-primary); border-color:var(--oe-primary); color:#fff; }
  button.primary:hover, a.btn.primary:hover { background:var(--oe-primary-hover); border-color:var(--oe-primary-hover); }
  button.ghost { border-color:transparent; background:none; color:var(--text-tertiary); }
  button.ghost:hover { color:var(--text-primary); background:var(--surface-subtle); }
  button.danger { color:var(--danger-text); }
  button.danger:hover { background:var(--danger-bg); border-color:var(--danger-text); }
  button:disabled { opacity:.6; cursor:default; }
  button:focus-visible, a:focus-visible { outline:2px solid var(--oe-primary); outline-offset:2px; }
  .actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:16px; padding-top:16px; border-top:0.5px solid var(--border-default); }
  .actions .push { margin-left:auto; }

  /* Entrar */
  .signin { max-width:400px; margin:48px auto 0; text-align:center; padding:36px 32px; }
  .signin .wordmark { font-weight:800; font-size:22px; letter-spacing:-0.01em; margin-bottom:6px; }
  .signin .wordmark .en { color:var(--oe-primary); }
  .signin p { color:var(--text-tertiary); font-size:13px; margin-bottom:24px; }
  .signin a.btn { width:100%; justify-content:center; padding:10px 20px; font-size:14px; }
  .foot { text-align:center; font-size:12px; color:var(--text-tertiary); margin-top:20px; }

  /* Passos e blocos de código */
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
  .msg { font-size:13px; margin-top:12px; } .msg:empty { display:none; } .ok { color:var(--success-text); } .warn { color:var(--danger-text); }
</style>
</head>
<body>
<header class="bar">
  <a class="logo" href="${appUrl}/" aria-label="Open"><span><span>op</span><span class="en">en</span></span></a>
  <span class="tag">API e MCP</span>
  <nav>
    <a id="docs" href="#">Documentação</a>
    <a href="${appUrl}/">Abrir o Open</a>
  </nav>
</header>
<main>
  <h1>Minha chave da Open API</h1>
  <p class="lead">A sua <strong>User-Key</strong> vai no cabeçalho <code>User-Key</code> para usar a API e o MCP em scripts, n8n e Postman.
  Ela dá o mesmo acesso que você tem no Open — <strong>não compartilhe</strong>. Para o Claude, prefira o plugin: ele usa o seu login, sem chave.</p>

  <div class="card signin" id="login" hidden>
    <div class="wordmark"><span>op</span><span class="en">en</span></div>
    <p>Entre com a sua conta Google da Ploomes para ver a sua chave.</p>
    <a class="btn" id="btn-login" href="#">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
        <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
        <path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
      </svg>
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
      <ol class="steps">
        <li><span>No Claude: <strong>Plugins → Adicionar → Fazer upload de plugin</strong> (ou instale o plugin compartilhado com você).</span></li>
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
