// @ts-nocheck
// Uso: npm run build:discord-ai && deno run -A server/discordAi/test/edge.test.ts

const U = '00000000-0000-0000-0000-00000000000a'
const db = {
  profiles: [{ id: U, name: 'Ana Souza', email: 'ana@x.com', active: true, role: 'member', discord_user_id: '111111111111111111' }],
  projects: [{ id: 'p1', name: 'Implantação Lockton', status: 'in_progress', pm: 'Ana Souza', type: 'nova_conta', language: 'pt', archived: false, hidden: false, team: [], links: [] }],
  phases: [{ id: 'ph1', project_id: 'p1', name: 'Fase 1', order: 0 }],
  entries: [
    { id: 'e1', project_id: 'p1', phase_id: 'ph1', type: 'task', name: 'Configurar funil', status: 'in_progress', planned_start: '2026-10-01', planned_end: '2026-10-10', responsible: 'Ana Souza', responsible_member_id: U, owners: [{ id: 'o1', type: 'member', memberId: U, name: 'Ana Souza', kind: 'executor' }], depends_on: [], subtasks: [], links: [], risk_flag: 'none', order: 0 },
  ],
  clients: [], contacts: [], incidents: [], settings: [], invited_users: [], ai_memories: [],
  ai_conversations: [], ai_messages: [], discord_ai_pending: [],
}
const requests = []
const modelCalls = []
let modelScript = []

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

function restTable(url, method, headers, bodyText) {
  const table = url.pathname.replace('/rest/v1/', '')
  const q = url.searchParams
  const wantsObject = (headers.get('accept') ?? '').includes('vnd.pgrst.object')
  const rows = (db[table] ??= [])
  if (method === 'POST') {
    const body = JSON.parse(bodyText)
    const list = Array.isArray(body) ? body : [body]
    const stored = list.map((r) => ({ id: crypto.randomUUID(), updated_at: new Date(Date.now() + 5).toISOString(), ...r }))
    rows.push(...stored)
    const prefer = headers.get('prefer') ?? ''
    if (prefer.includes('return=representation')) return json(wantsObject ? stored[0] : stored, 201)
    return new Response(null, { status: 201 })
  }
  if (method === 'PATCH') {
    const body = JSON.parse(bodyText)
    const id = q.get('id')?.replace('eq.', '')
    for (const r of rows) if (!id || r.id === id) Object.assign(r, body, table === 'ai_conversations' ? { updated_at: new Date().toISOString() } : {})
    return new Response(null, { status: 204 })
  }
  if (method === 'DELETE') {
    const id = q.get('id')?.replace('eq.', '')
    const gone = rows.filter((r) => !id || r.id === id)
    db[table] = rows.filter((r) => !gone.includes(r))
    const prefer = headers.get('prefer') ?? ''
    return prefer.includes('return=representation') ? json(gone) : new Response(null, { status: 204 })
  }
  // GET
  let out = rows
  for (const [k, v] of q.entries()) {
    if (v.startsWith('eq.')) out = out.filter((r) => String(r[k]) === v.slice(3))
    else if (v === 'is.null') out = out.filter((r) => r[k] == null)
  }
  if (table === 'entries' && q.get('project_id')?.startsWith('in.')) out = out.filter((r) => r.project_id)
  if (q.get('order')?.startsWith('updated_at.desc')) out = [...out].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
  if (table === 'ai_messages') out = [...out].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const lim = Number(q.get('limit') ?? 0)
  if (lim) out = out.slice(0, lim)
  if (wantsObject) return out.length ? json(out[0]) : json({ message: 'no rows' }, 406)
  return json(out)
}

const discordCalls = []
globalThis.fetch = async (input, init = {}) => {
  const req = input instanceof Request ? input : new Request(input, init)
  const url = new URL(req.url)
  if (url.hostname === 'discord.com') {
    discordCalls.push({ method: req.method, path: url.pathname.replace(/\/api\/v10\/webhooks\/APP\/TOKEN/, ''), body: JSON.parse(await req.clone().text() || '{}') })
    return json({ id: 'msg' })
  }
  const bodyText = req.method === 'GET' || req.method === 'HEAD' ? '' : await req.clone().text()
  requests.push({ method: req.method, path: url.pathname + url.search, body: bodyText.slice(0, 400) })

  if (url.pathname === '/auth/v1/admin/generate_link') {
    return json({ action_link: 'x', email_otp: '1', hashed_token: 'HASH', redirect_to: '', verification_type: 'magiclink', id: U, email: 'ana@x.com', aud: 'authenticated' })
  }
  if (url.pathname === '/auth/v1/verify') {
    return json({ access_token: 'user-token', token_type: 'bearer', expires_in: 3600, refresh_token: 'r', user: { id: U, email: 'ana@x.com', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01' } })
  }
  if (url.pathname.startsWith('/rest/v1/')) return restTable(url, req.method, req.headers, bodyText)
  if (url.pathname === '/functions/v1/ai-chat') {
    const payload = JSON.parse(bodyText)
    modelCalls.push({ auth: req.headers.get('authorization'), system: payload.system, messages: payload.messages, toolCount: payload.tools?.length })
    const next = modelScript.shift()
    if (!next) return json({ error: 'sem resposta roteirizada' }, 500)
    const message = { id: 'm', type: 'message', role: 'assistant', model: 'x', stop_reason: next.stop_reason ?? 'end_turn', content: next.content, usage: {} }
    return new Response(JSON.stringify({ type: 'final', message }) + '\n', { headers: { 'Content-Type': 'application/x-ndjson' } })
  }
  return json({ message: 'rota não simulada: ' + url.pathname }, 404)
}


let pass = 0, fail = 0
const check = (n, c, x = '') => { c ? (pass++, console.log('  PASS', n)) : (fail++, console.log('  FAIL', n, typeof x === 'string' ? x : JSON.stringify(x).slice(0, 700))) }
const text = (t) => ({ type: 'text', text: t })
const toolUse = (id, name, input) => ({ type: 'tool_use', id, name, input })
// ── ambiente da função ──
const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])
const pubHex = [...new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))].map((b) => b.toString(16).padStart(2, '0')).join('')
Deno.env.set('SUPABASE_URL', 'http://fake.supabase.co'); Deno.env.set('SUPABASE_ANON_KEY', 'anon'); Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service')
Deno.env.set('DISCORD_PUBLIC_KEY', pubHex); Deno.env.set('APP_URL', 'https://openploo.vercel.app')
const waits = []
globalThis.EdgeRuntime = { waitUntil: (p) => { waits.push(p) } }
let handler
Deno.serve = (h) => { handler = h; return {} }
const edgeEntry = '../../../supabase/functions/discord-ai/index.ts'   // caminho em variável: o tsc do app não deve tentar tipar a função do Deno
await import(edgeEntry)

const hex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('')
async function send(body, { badSig = false, ts = String(Date.now()) } = {}) {
  const raw = JSON.stringify(body)
  const sig = new Uint8Array(await crypto.subtle.sign('Ed25519', kp.privateKey, new TextEncoder().encode(ts + raw + (badSig ? 'x' : ''))))
  const res = await handler(new Request('http://f/functions/v1/discord-ai', { method: 'POST', headers: { 'x-signature-ed25519': hex(sig), 'x-signature-timestamp': ts, 'content-type': 'application/json' }, body: raw }))
  const out = res.status === 200 ? await res.json() : await res.text()
  await Promise.all(waits.splice(0))
  return { status: res.status, out }
}
const base = { application_id: 'APP', token: 'TOKEN', channel_id: 'c1' }
const cmd = (name, discordId, text) => ({ ...base, type: 2, member: { user: { id: discordId } }, data: { name, options: text ? [{ name: 'mensagem', type: 3, value: text }] : [] } })
const click = (discordId, customId) => ({ ...base, type: 3, user: { id: discordId }, data: { custom_id: customId, component_type: 2 } })
const LINKED = '111111111111111111'

console.log('[assinatura e ping]')
let r = await send({ type: 1 }, { badSig: true })
check('assinatura inválida: 401', r.status === 401, r)
r = await send({ type: 1 })
check('PING recebe PONG', r.status === 200 && r.out.type === 1, r)

console.log('[quem não conectou o Discord]')
r = await send(cmd('open', '999999999999999999', 'oi'))
check('resposta imediata, só para a pessoa, explicando como conectar', r.out.type === 4 && (r.out.data.flags & 64) === 64 && /Conectar/.test(r.out.data.content), r)
check('e nada foi processado', modelCalls.length === 0)

console.log('[/open — pergunta]')
modelScript = [{ stop_reason: 'tool_use', content: [toolUse('t1', 'list_projects', {})] }, { content: [text('Você tem **1 projeto** em andamento.')] }]
discordCalls.length = 0
r = await send(cmd('open', LINKED, 'Como estão meus projetos?'))
check('responde na hora com "pensando…" (tipo 5) e sem ser privado (vale onde foi pedido)', r.out.type === 5 && !r.out.data, r.out)
let patch = discordCalls.find((c) => c.method === 'PATCH' && c.path === '/messages/@original')
check('depois edita a mensagem com a resposta', /1 projeto/.test(patch?.body.content ?? ''), discordCalls)
check('sem pré-visualização de links e sem mencionar ninguém', patch.body.flags === 4 && JSON.stringify(patch.body.allowed_mentions) === '{"parse":[]}', patch.body)

console.log('[/open — resposta longa]')
modelScript = [{ content: [text(Array.from({ length: 80 }, (_, i) => `- item ${i} ${'x'.repeat(40)}`).join('\n'))] }]
discordCalls.length = 0
await send(cmd('open', LINKED, 'lista tudo'))
const parts = discordCalls.filter((c) => c.body.content)
check('passa do limite: continua em mensagens seguintes, todas dentro de 2000', parts.length >= 2 && parts.every((c) => c.body.content.length <= 2000), parts.map((c) => c.method + ':' + c.body.content.length))

console.log('[/open — ação com confirmação]')
modelScript = [
  { stop_reason: 'tool_use', content: [text('Vou criar a tarefa.'), toolUse('t2', 'create_task', { name: 'Ligar para o cliente', executorName: 'Ana Souza' })] },
  { content: [text('Tarefa criada!')] },
]
discordCalls.length = 0
await send(cmd('open', LINKED, 'cria uma tarefa solta'))
const follow = discordCalls.find((c) => c.method === 'POST' && c.body.components)
const ids = follow?.body.components?.[0]?.components?.map((c) => c.custom_id) ?? []
check('mostra a ação e os botões Confirmar e Cancelar', /Confirma esta ação/.test(follow?.body.content ?? '') && ids.length === 2 && ids[0].startsWith('oai:ok:') && ids[1].startsWith('oai:no:'), discordCalls)
check('a ação ainda não foi gravada', !requests.some((q) => q.method === 'POST' && q.path.startsWith('/rest/v1/entries')))

console.log('[botão]')
discordCalls.length = 0
r = await send(click('555555555555555555', ids[0]))
check('quem não conectou o Discord não confirma', r.out.type === 4 && (r.out.data.flags & 64) === 64, r)
db.profiles.push({ id: '00000000-0000-0000-0000-0000000000bb', name: 'Bruno', email: 'b@x.com', active: true, discord_user_id: '222222222222222222' })
discordCalls.length = 0
r = await send(click('222222222222222222', ids[0]))
const eph = discordCalls.find((c) => c.method === 'POST')
check('outra pessoa conectada recebe um aviso só para ela e a ação continua pendente', r.out.type === 6 && /Só quem pediu/.test(eph?.body.content ?? '') && (eph.body.flags & 64) === 64 && db.discord_ai_pending.length === 1, [r.out, eph])
discordCalls.length = 0
r = await send(click(LINKED, ids[0]))
patch = discordCalls.find((c) => c.method === 'PATCH' && c.path === '/messages/@original')
check('quem pediu confirma: a mensagem dos botões vira o resultado (sem botões)', r.out.type === 6 && /Tarefa criada/.test(patch?.body.content ?? '') && Array.isArray(patch.body.components) && patch.body.components.length === 0, [r.out, discordCalls])
check('e a tarefa foi gravada', requests.some((q) => q.method === 'POST' && q.path.startsWith('/rest/v1/entries') && q.body.includes('Ligar para o cliente')))

console.log('[/open-novo]')
discordCalls.length = 0
r = await send(cmd('open-novo', LINKED))
check('responde só para a pessoa e confirma a conversa nova', r.out.type === 5 && (r.out.data.flags & 64) === 64 && /Conversa nova/.test(discordCalls.find((c) => c.method === 'PATCH')?.body.content ?? ''), [r.out, discordCalls])

console.log('[erro interno]')
modelScript = []   // o "modelo" falha (500)
discordCalls.length = 0
await send(cmd('open', LINKED, 'oi'))
const errPatch = discordCalls.find((c) => c.method === 'PATCH')
check('falha vira mensagem amigável, sem detalhes internos', /^(❌|⚠️)/.test(errPatch?.body.content ?? '') && !/Error|stack|supabase/i.test(errPatch.body.content), discordCalls)

console.log(`\n${pass} passou, ${fail} falhou`)
Deno.exit(fail ? 1 : 0)
