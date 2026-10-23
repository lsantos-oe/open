// Página do "Vincular" (OAuth): a pessoa entra com o login do Open (Google) — ou cola a própria User-Key — e
// permite que o app (Claude) acesse o Open como ela. Igual à página da chave, o navegador só fala com a API.
//   /api/oauth/authorize?…  valida o pedido e mostra login/consentimento
//   /api/oauth/callback     volta do login Google: guarda a sessão nesta aba e retoma o pedido salvo
import { appUrlOf, BASE_CSS, esc, FAVICON, GOOGLE_ICON, topBar } from "./brand.ts";

const STYLE = `${BASE_CSS}
  main { max-width:440px; margin:0 auto; padding:40px 16px 64px; }
  .panel { text-align:center; padding:32px 28px; margin-top:0; }
  .panel .wordmark { margin-bottom:14px; }
  .panel h1 { font-size:20px; margin-bottom:8px; }
  .panel p { color:var(--text-tertiary); font-size:13px; }
  .left { text-align:left; }
  .who { display:flex; align-items:center; gap:12px; margin:18px 0; padding:12px 14px; border:0.5px solid var(--border-default); border-radius:var(--radius-md); background:var(--surface-subtle); text-align:left; }
  .avatar { flex:0 0 34px; height:34px; border-radius:999px; background:var(--oe-primary); color:#fff; font-weight:700; display:flex; align-items:center; justify-content:center; }
  .who b { display:block; font-size:13.5px; overflow-wrap:anywhere; } .who small { color:var(--text-tertiary); font-size:12px; }
  ul.perm { list-style:none; margin:0 0 16px; padding:0; display:grid; gap:8px; text-align:left; }
  ul.perm li { display:flex; gap:10px; color:var(--text-secondary); font-size:13.5px; }
  ul.perm li::before { content:"✓"; flex:0 0 20px; height:20px; border-radius:999px; background:var(--success-bg); color:var(--success-text); font-size:12px; font-weight:700; display:flex; align-items:center; justify-content:center; margin-top:1px; }
  .small { font-size:12.5px; }
  .buttons { display:flex; gap:8px; margin-top:20px; } .buttons button { flex:1; padding:10px 16px; font-size:14px; }
  a.btn.wide { width:100%; padding:10px 20px; font-size:14px; margin-top:20px; }
  details { margin-top:18px; text-align:left; } summary { cursor:pointer; color:var(--text-tertiary); font-size:13px; }
  .keyrow { display:flex; gap:8px; margin-top:10px; } .keyrow input { flex:1; }
  .alert { margin-top:16px; padding:10px 14px; border-radius:var(--radius-md); background:var(--danger-bg); color:var(--danger-text); font-size:13px; text-align:left; }
  .spin { width:22px; height:22px; margin:6px auto 14px; border-radius:999px; border:2.5px solid var(--border-default); border-top-color:var(--oe-primary); animation:spin .8s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spin { animation:none; } }
`;

function shell(title: string, body: string, root: string): string {
  const appUrl = appUrlOf(root);
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="referrer" content="no-referrer" />
<meta name="color-scheme" content="light dark" />
<title>${esc(title)} — Open</title>
<link rel="icon" href="${FAVICON}" />
<style>${STYLE}</style>
</head>
<body>
${topBar(appUrl, `<a href="${esc(root)}/docs">Documentação</a>`)}
<main>
  <div class="card panel">
    <div class="wordmark"><span>op</span><span class="en">en</span></div>
    ${body}
  </div>
</main>
</body>
</html>`;
}

export function oauthErrorHtml(message: string, root = ""): string {
  return shell("Não foi possível conectar", `
  <h1>Não foi possível conectar</h1>
  <div class="alert" role="alert">${esc(message)}</div>
  <p class="small" style="margin-top:16px">Volte ao Claude, remova o conector do Open e vincule de novo.</p>`, root);
}

export function oauthAuthorizeHtml(opts: { root: string; clientName: string; redirectHost: string }): string {
  const cfg = JSON.stringify({ root: opts.root });
  const app = opts.clientName || opts.redirectHost;
  return shell("Conectar ao Open", `
  <div id="login" hidden>
    <h1>Conectar ${esc(app)} ao Open</h1>
    <p>Entre com a sua conta do Open para continuar.</p>
    <a class="btn wide" id="btn-google" href="${esc(opts.root)}/auth/google?to=oauth">${GOOGLE_ICON}Entrar com Google</a>
    <details>
      <summary>Prefiro usar a minha User-Key</summary>
      <p class="small" style="margin-top:8px">Cole a chave da página <a href="${esc(opts.root)}/minha-chave" target="_blank" rel="noopener">Minha chave</a>.</p>
      <div class="keyrow"><input id="key" type="password" placeholder="ouk_..." autocomplete="off" aria-label="User-Key" /><button id="btn-key">Continuar</button></div>
    </details>
    <div class="msg err" id="msg-login" role="status"></div>
  </div>

  <div id="consent" hidden>
    <h1>Permitir acesso ao Open?</h1>
    <p><strong>${esc(app)}</strong> quer acessar o Open como você:</p>
    <div class="who"><span class="avatar" id="avatar" aria-hidden="true"></span><span><b id="who"></b><small>Conta do Open</small></span></div>
    <ul class="perm">
      <li>Ler e gravar projetos, tarefas, incidentes e clientes, com as suas permissões.</li>
      <li>O que for gravado aparece no app com o seu nome.</li>
    </ul>
    <p class="small left">Depois da aprovação, você volta para <code>${esc(opts.redirectHost)}</code>. Para desconectar, use a página <a href="${esc(opts.root)}/minha-chave" target="_blank" rel="noopener">Minha chave</a>.</p>
    <div class="buttons">
      <button id="btn-deny">Cancelar</button>
      <button class="primary" id="btn-allow">Permitir</button>
    </div>
    <p class="small" style="margin-top:14px"><a href="#" id="btn-switch">Usar outra conta</a></p>
    <div class="msg err" id="msg" role="status"></div>
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
  if (cred) { $("who").textContent = cred.label; $("avatar").textContent = (cred.label.trim()[0] || "?").toUpperCase(); }
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
</script>`, opts.root);
}

/** Volta do login Google (#access_token=…): guarda a sessão nesta aba e retoma o pedido de autorização salvo. */
export function oauthCallbackHtml(root: string): string {
  const cfg = JSON.stringify({ root });
  return shell("Entrando", `
  <div class="spin" id="spin" aria-hidden="true"></div>
  <p id="msg" role="status">Entrando…</p>
<script type="module">
const CFG = ${cfg};
const h = new URLSearchParams(location.hash.slice(1));
if (h.get("access_token")) {
  const exp = Date.now() + Number(h.get("expires_in") ?? "3600") * 1000;
  try { sessionStorage.setItem("open-key-page-session", JSON.stringify({ token: h.get("access_token"), exp })); } catch {}
}
let q = null;
try { q = sessionStorage.getItem("open-oauth-request"); } catch {}
const fail = (m) => { document.getElementById("spin").hidden = true; document.getElementById("msg").textContent = m; };
if (h.get("error_description")) fail(h.get("error_description"));
else if (q) location.replace(CFG.root + "/oauth/authorize" + q);
else fail("Pedido de conexão não encontrado nesta aba. Volte ao Claude e clique em Vincular de novo.");
</script>`, root);
}
