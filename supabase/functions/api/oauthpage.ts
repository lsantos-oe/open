// Página do "Vincular" (OAuth): a pessoa entra com o login do Open (Google) — ou cola a própria User-Key — e
// permite que o app (Claude) acesse o Open como ela. Igual à página da chave, o navegador só fala com a API.
//   /api/oauth/authorize?…  valida o pedido e mostra login/consentimento
//   /api/oauth/callback     volta do login Google: guarda a sessão nesta aba e retoma o pedido salvo

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const STYLE = `
  :root { --bg:#FBFAF8; --card:#FFFFFF; --text:#1C1815; --muted:#5A5347; --line:#E8E3DC; --accent:#D9530E; --accent-hover:#B8440A; --warn:#A8790A; --err:#D14343; }
  @media (prefers-color-scheme: dark) { :root { --bg:#131110; --card:#1C1815; --text:#F2EEE8; --muted:#C7BFB2; --line:#322C24; --accent:#E8642A; --accent-hover:#D9530E; --warn:#D6A93B; --err:#E5716A; } }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px 16px;
    font:15px/1.55 -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif; background:var(--bg); color:var(--text); }
  .card { width:100%; max-width:440px; background:var(--card); border:1px solid var(--line); border-radius:14px; padding:28px; }
  .brand { display:flex; align-items:center; gap:10px; font-weight:700; font-size:18px; margin-bottom:20px; }
  .brand svg { width:28px; height:28px; }
  h1 { font-size:20px; margin:0 0 8px; } p { color:var(--muted); margin:6px 0; }
  .who { margin:16px 0; padding:12px 14px; border:1px solid var(--line); border-radius:10px; }
  ul { color:var(--muted); padding-left:20px; margin:8px 0 16px; }
  .row { display:flex; gap:8px; flex-wrap:wrap; margin-top:16px; }
  button, a.btn { font:inherit; border-radius:10px; padding:10px 16px; border:1px solid var(--line); background:var(--card); color:var(--text);
    cursor:pointer; text-decoration:none; display:inline-flex; align-items:center; justify-content:center; }
  button.primary, a.btn.primary { background:var(--accent); border-color:var(--accent); color:#fff; font-weight:600; flex:1; }
  button.primary:hover, a.btn.primary:hover { background:var(--accent-hover); }
  button:disabled { opacity:.6; cursor:default; }
  input { width:100%; padding:10px 12px; border-radius:10px; border:1px solid var(--line); background:var(--bg); color:var(--text); font:inherit; }
  details { margin-top:18px; } summary { cursor:pointer; color:var(--muted); font-size:14px; }
  .msg { font-size:14px; margin-top:12px; } .err { color:var(--err); } .warn { color:var(--warn); }
  .small { font-size:13px; } code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:13px; }
`;

const LOGO = `<svg viewBox="0 0 100 100" aria-hidden="true"><path fill="#D9530E" d="M50 0C77.61 0 100 22.39 100 50C100 77.61 77.61 100 50 100C22.39 100 0 77.61 0 50C0 22.39 22.39 0 50 0ZM50 20C33.43 20 20 33.43 20 50C20 66.57 33.43 80 50 80C64.5 80 76.5 69.7 79.3 56L40 56C38 56 36 54 36 52L36 44C36 42 38 40 40 40L79.3 40C76.5 28.3 64.5 20 50 20Z"/></svg>`;

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="referrer" content="no-referrer" />
<title>${esc(title)} — Open</title>
<style>${STYLE}</style>
</head>
<body>
<main class="card">
  <div class="brand">${LOGO}<span>Open</span></div>
  ${body}
</main>
</body>
</html>`;
}

export function oauthErrorHtml(message: string): string {
  return shell("Não foi possível conectar", `
  <h1>Não foi possível conectar</h1>
  <p class="err">${esc(message)}</p>
  <p class="small">Volte ao Claude, remova o conector do Open e vincule de novo.</p>`);
}

export function oauthAuthorizeHtml(opts: { root: string; clientName: string; redirectHost: string }): string {
  const cfg = JSON.stringify({ root: opts.root });
  const app = opts.clientName || opts.redirectHost;
  return shell("Conectar ao Open", `
  <div id="login" hidden>
    <h1>Conectar ${esc(app)} ao Open</h1>
    <p>Entre com a sua conta do Open para continuar.</p>
    <div class="row"><a class="btn primary" id="btn-google" href="${esc(opts.root)}/auth/google?to=oauth">Entrar com Google</a></div>
    <details>
      <summary>Prefiro usar a minha User-Key</summary>
      <p class="small" style="margin-top:8px">Cole a chave da página <a href="${esc(opts.root)}/minha-chave" target="_blank" rel="noopener">Minha chave</a>.</p>
      <div class="row"><input id="key" type="password" placeholder="ouk_..." autocomplete="off" /><button id="btn-key">Continuar</button></div>
    </details>
    <div class="msg" id="msg-login" role="status"></div>
  </div>

  <div id="consent" hidden>
    <h1>Permitir acesso ao Open?</h1>
    <p><strong>${esc(app)}</strong> quer acessar o Open como você:</p>
    <div class="who" id="who"></div>
    <ul>
      <li>ler e gravar projetos, tarefas, incidentes e clientes, com as suas permissões;</li>
      <li>o que for gravado aparece no app com o seu nome.</li>
    </ul>
    <p class="small">Depois da aprovação, você volta para <code>${esc(opts.redirectHost)}</code>. Para desconectar, use a página <a href="${esc(opts.root)}/minha-chave" target="_blank" rel="noopener">Minha chave</a>.</p>
    <div class="row">
      <button id="btn-deny">Cancelar</button>
      <button class="primary" id="btn-allow">Permitir</button>
    </div>
    <p class="small" style="margin-top:12px"><a href="#" id="btn-switch">Usar outra conta</a></p>
    <div class="msg" id="msg" role="status"></div>
  </div>
<script type="module">
const CFG = ${cfg};
const $ = (id) => document.getElementById(id);
const STORE = "open-key-page-session";
const REQ = "open-oauth-request";
try { sessionStorage.setItem(REQ, location.search); } catch {}
let cred = null; // { header: "Authorization" | "User-Key", value, label }

function session() {
  try {
    const s = JSON.parse(sessionStorage.getItem(STORE) ?? "null");
    return s && s.exp > Date.now() + 10000 ? s.token : null;
  } catch { return null; }
}
function emailOf(jwt) {
  try { return JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).email ?? ""; } catch { return ""; }
}
function show() {
  const t = session();
  if (!cred && t) cred = { header: "Authorization", value: "Bearer " + t, label: emailOf(t) || "sua conta do Open" };
  $("login").hidden = !!cred; $("consent").hidden = !cred;
  if (cred) $("who").textContent = cred.label;
}
async function decide(allow) {
  $("btn-allow").disabled = $("btn-deny").disabled = true;
  try {
    const res = await fetch(CFG.root + "/oauth/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json", [cred.header]: cred.value },
      body: JSON.stringify({ query: location.search, allow }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.redirect) { location.href = body.redirect; return; }
    if (res.status === 401) { try { sessionStorage.removeItem(STORE); } catch {} cred = null; show(); }
    $("msg").className = "msg err"; $("msg").textContent = body?.error?.message ?? body?.error_description ?? "Não foi possível concluir.";
  } finally { $("btn-allow").disabled = $("btn-deny").disabled = false; }
}
$("btn-key").onclick = () => {
  const k = $("key").value.trim();
  if (!/^ouk_[A-Za-z0-9]{40}$/.test(k)) { $("msg-login").className = "msg err"; $("msg-login").textContent = "Chave inválida (formato ouk_...)."; return; }
  cred = { header: "User-Key", value: k, label: "Dona da chave " + k.slice(0, 8) + "…" }; show();
};
$("btn-allow").onclick = () => decide(true);
$("btn-deny").onclick = () => decide(false);
$("btn-switch").onclick = (e) => { e.preventDefault(); try { sessionStorage.removeItem(STORE); } catch {} cred = null; show(); };
show();
</script>`);
}

/** Volta do login Google (#access_token=…): guarda a sessão nesta aba e retoma o pedido de autorização salvo. */
export function oauthCallbackHtml(root: string): string {
  const cfg = JSON.stringify({ root });
  return shell("Entrando", `
  <p id="msg">Entrando…</p>
<script type="module">
const CFG = ${cfg};
const h = new URLSearchParams(location.hash.slice(1));
if (h.get("access_token")) {
  const exp = Date.now() + Number(h.get("expires_in") ?? "3600") * 1000;
  try { sessionStorage.setItem("open-key-page-session", JSON.stringify({ token: h.get("access_token"), exp })); } catch {}
}
let q = null;
try { q = sessionStorage.getItem("open-oauth-request"); } catch {}
if (h.get("error_description")) document.getElementById("msg").textContent = h.get("error_description");
else if (q) location.replace(CFG.root + "/oauth/authorize" + q);
else document.getElementById("msg").textContent = "Pedido de conexão não encontrado nesta aba. Volte ao Claude e clique em Vincular de novo.";
</script>`);
}
