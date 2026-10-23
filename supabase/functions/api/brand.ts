// Visual compartilhado das páginas HTML da API (Minha chave, login do conector, erro): o mesmo do app — tokens de
// src/index.css, barra escura do menu lateral e o logotipo real ("op" + "en"). Claro e escuro seguem o sistema.

/** Ícone do Open (o mesmo de public/favicon.svg), usado como ícone da aba. */
export const FAVICON = `data:image/svg+xml,${
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="#E65100" fill-rule="evenodd" d="M50 0C77.61 0 100 22.39 100 50C100 77.61 77.61 100 50 100C22.39 100 0 77.61 0 50C0 22.39 22.39 0 50 0ZM50 20C33.43 20 20 33.43 20 50C20 66.57 33.43 80 50 80C64.5 80 76.5 69.7 79.3 56L40 56C38 56 36 54 36 52L36 44C36 42 38 40 40 40L79.3 40C76.5 28.3 64.5 20 50 20Z"/><path fill="#FFFFFF" d="M50 20C60 20 68 25 73 32L88 23C79 11 65 2 50 2Z"/></svg>`,
  )
}`;

/** Endereço do app (a API vive em <app>/api). */
export const appUrlOf = (root: string) => root.replace(/\/api\/?$/, "") || "/";

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const GOOGLE_ICON = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
  <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
  <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
  <path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
</svg>`;

export const BASE_CSS = `
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
  body { margin:0; min-height:100vh; background:var(--surface-page); color:var(--text-primary); font:14px/1.55 -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
    -webkit-font-smoothing:antialiased; }

  /* Barra do topo: a mesma do menu lateral do app (sempre escura), com o logotipo real */
  .bar { height:52px; background:var(--sidebar-bg); border-bottom:0.5px solid var(--sidebar-border); display:flex; align-items:center; gap:12px; padding:0 20px; }
  .logo { font-weight:800; font-size:17px; letter-spacing:-0.01em; text-decoration:none; color:#fff; }
  .logo .en, .wordmark .en { color:var(--oe-primary); }
  .tag { font-size:12px; font-weight:500; color:var(--sidebar-text); padding-left:12px; border-left:0.5px solid var(--sidebar-border); }
  .bar nav { margin-left:auto; display:flex; gap:4px; }
  .bar nav a { color:var(--sidebar-text); text-decoration:none; font-size:13px; padding:6px 10px; border-radius:var(--radius-md); }
  .bar nav a:hover { color:#fff; background:rgba(255,255,255,0.08); }
  @media (max-width:560px) { .tag { display:none; } }

  h1 { font-size:22px; font-weight:600; letter-spacing:-0.01em; margin:0 0 6px; }
  h2 { font-size:14px; font-weight:600; margin:0 0 4px; }
  p { margin:0; color:var(--text-secondary); }
  code { font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:12.5px; background:var(--surface-subtle); border:0.5px solid var(--border-default); border-radius:6px; padding:1px 5px; color:var(--text-primary); }
  a { color:var(--oe-primary); }

  .card { background:var(--surface-card); border:0.5px solid var(--border-default); border-radius:var(--radius-lg); padding:20px; margin-top:16px; box-shadow:var(--shadow-sm); }
  .row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  .pill { font-size:11px; font-weight:600; padding:2px 8px; border-radius:999px; background:var(--success-bg); color:var(--success-text); }

  button, a.btn { font:inherit; font-size:13px; font-weight:500; border-radius:var(--radius-md); padding:8px 14px; border:0.5px solid var(--border-default);
    background:var(--surface-card); color:var(--text-primary); cursor:pointer; text-decoration:none; transition:background .15s, border-color .15s; display:inline-flex; align-items:center; justify-content:center; gap:8px; }
  button:hover, a.btn:hover { background:var(--surface-subtle); }
  button.primary, a.btn.primary { background:var(--oe-primary); border-color:var(--oe-primary); color:#fff; }
  button.primary:hover, a.btn.primary:hover { background:var(--oe-primary-hover); border-color:var(--oe-primary-hover); }
  button.ghost { border-color:transparent; background:none; color:var(--text-tertiary); }
  button.ghost:hover { color:var(--text-primary); background:var(--surface-subtle); }
  button.danger { color:var(--danger-text); }
  button.danger:hover { background:var(--danger-bg); border-color:var(--danger-text); }
  button:disabled { opacity:.6; cursor:default; }
  button:focus-visible, a:focus-visible, input:focus-visible, summary:focus-visible { outline:2px solid var(--oe-primary); outline-offset:2px; }
  input { width:100%; padding:9px 12px; border-radius:var(--radius-md); border:0.5px solid var(--border-strong); background:var(--surface-input); color:var(--text-primary); font:inherit; }

  .msg { font-size:13px; margin-top:12px; } .msg:empty { display:none; } .ok { color:var(--success-text); } .warn, .err { color:var(--danger-text); }
  .wordmark { font-weight:800; font-size:22px; letter-spacing:-0.01em; }
  .foot { text-align:center; font-size:12px; color:var(--text-tertiary); margin-top:20px; }
`;

/** Barra do topo com o logotipo e links (HTML já escapado por quem chama). */
export function topBar(appUrl: string, links: string): string {
  return `<header class="bar">
  <a class="logo" href="${esc(appUrl)}/" aria-label="Open"><span>op</span><span class="en">en</span></a>
  <span class="tag">API e MCP</span>
  <nav>${links}</nav>
</header>`;
}
