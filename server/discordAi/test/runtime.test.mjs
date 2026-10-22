// Teste de integração do assistente no Discord: roda o runtime.mjs REAL (o código do app empacotado) contra um
// Supabase e um "ai-chat" simulados por um fetch falso. Nada sai da máquina.
// Uso: npm run build:discord-ai && node server/discordAi/test/runtime.test.mjs   (também roda no Deno: deno run -A ...)
const RUNTIME = new URL('../../../supabase/functions/discord-ai/runtime.mjs', import.meta.url).href

const U = '00000000-0000-0000-0000-00000000000a'
const db = {
  profiles: [{ id: U, name: 'Ana Souza', email: 'ana@x.com', active: true, role: 'member', discord_user_id: '111111111111111111' }],
  projects: [{ id: 'p1', name: 'Implantação Lockton', status: 'in_progress', pm: 'Ana Souza', type: 'nova_conta', language: 'pt', archived: false, hidden: false, team: [], links: [] }],
  phases: [{ id: 'ph1', project_id: 'p1', name: 'Fase 1', order: 0 }],
  entries: [
    { id: 'e1', project_id: 'p1', phase_id: 'ph1', type: 'task', name: 'Configurar funil', status: 'in_progress', planned_start: '2026-10-01', planned_end: '2026-10-10', responsible: 'Ana Souza', responsible_member_id: U, owners: [{ id: 'o1', type: 'member', memberId: U, name: 'Ana Souza', kind: 'executor' }], depends_on: [], subtasks: [], links: [], risk_flag: 'none', order: 0 },
  ],
  status_report_links: [{ id: 'rl1', project_id: 'p1', storage_path: 'p1/abc123.html', label: 'Relatório', created_at: '2026-10-01T00:00:00Z' }],
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

globalThis.fetch = async (input, init = {}) => {
  const req = input instanceof Request ? input : new Request(input, init)
  const url = new URL(req.url)
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
    // Como a API de verdade: cada tool_use precisa de exatamente um tool_result na mensagem seguinte do usuário.
    const msgs = payload.messages
    for (let i = 0; i < msgs.length; i++) {
      const uses = msgs[i].role === 'assistant' ? msgs[i].content.filter((b) => b.type === 'tool_use').map((b) => b.id) : []
      const results = msgs[i + 1]?.role === 'user' ? msgs[i + 1].content.filter((b) => b.type === 'tool_result').map((b) => b.tool_use_id) : []
      const bad = uses.length !== results.length || uses.some((id) => results.filter((r) => r === id).length !== 1)
      if (uses.length && bad) return new Response(JSON.stringify({ type: 'error', status: 400, message: 'tool_use sem tool_result único: ' + uses.join(',') }) + '\n', { headers: { 'Content-Type': 'application/x-ndjson' } })
      if (!uses.length && msgs[i].role === 'user' && msgs[i].content.some((b) => b.type === 'tool_result') && !(msgs[i - 1]?.content ?? []).some((b) => b.type === 'tool_use')) {
        return new Response(JSON.stringify({ type: 'error', status: 400, message: 'tool_result órfão' }) + '\n', { headers: { 'Content-Type': 'application/x-ndjson' } })
      }
    }
    const next = modelScript.shift()
    if (!next) return json({ error: 'sem resposta roteirizada' }, 500)
    const message = { id: 'm', type: 'message', role: 'assistant', model: 'x', stop_reason: next.stop_reason ?? 'end_turn', content: next.content, usage: {} }
    return new Response(JSON.stringify({ type: 'final', message }) + '\n', { headers: { 'Content-Type': 'application/x-ndjson' } })
  }
  return json({ message: 'rota não simulada: ' + url.pathname }, 404)
}

const rt = await import(RUNTIME)
const cfg = { supabaseUrl: 'http://fake.supabase.co', anonKey: 'anon', serviceKey: 'service', appUrl: 'https://openploo.vercel.app/' }

let pass = 0, fail = 0
const check = (n, c, x = '') => { c ? (pass++, console.log('  PASS', n)) : (fail++, console.log('  FAIL', n, typeof x === 'string' ? x : JSON.stringify(x).slice(0, 600))) }
const text = (t) => ({ type: 'text', text: t })
const toolUse = (id, name, input) => ({ type: 'tool_use', id, name, input })

console.log('[identificação]')
const who = await rt.findUserByDiscordId(cfg, '111111111111111111')
check('acha a pessoa pelo ID do Discord ligado ao perfil', who?.id === U, who)
check('ID de Discord desconhecido não acha ninguém', (await rt.findUserByDiscordId(cfg, '999')) === null)

console.log('[pergunta de leitura]')
modelScript = [
  { stop_reason: 'tool_use', content: [text('Vou consultar.'), toolUse('tu1', 'list_projects', {})] },
  { content: [text('Você tem **1 projeto** em andamento: Implantação Lockton.')] },
]
let r = await rt.ask(cfg, U, 'Como estão meus projetos?')
check('devolve a resposta final do assistente', r.text.includes('1 projeto'), r)
check('agiu como a pessoa: o ai-chat recebeu o token DELA (não o do serviço)', modelCalls.every((c) => c.auth === 'Bearer user-token'), modelCalls.map((c) => c.auth))
check('a ferramenta rodou com os dados do Open e voltou para o modelo', JSON.stringify(modelCalls[1].messages).includes('Implantação Lockton'), JSON.stringify(modelCalls[1]?.messages).slice(0, 300))
check('o prompt tem a instrução do Discord e a data', modelCalls[0].system.includes('Você está no Discord') && /Hoje é \d{4}-\d{2}-\d{2}/.test(modelCalls[0].system))
check('o prompt chama a pessoa pelo nome (meus projetos = dela)', modelCalls[0].system.includes('Ana Souza'))
check('sem confirmação pendente em leitura', !r.confirmation)
check('carregar o projeto com link de relatório não dá erro (no servidor não existe window)', r.warnings.length === 0, r.warnings)
check('conversa do Discord criada e marcada como tal', db.ai_conversations.length === 1 && db.ai_conversations[0].source === 'discord' && db.ai_conversations[0].user_id === U, db.ai_conversations)
check('histórico gravado (pergunta, passo da ferramenta, resultado, resposta)', db.ai_messages.length === 4, db.ai_messages.length)

console.log('[mesma conversa na pergunta seguinte]')
modelScript = [{ content: [text('Resposta 2')] }]
const before = db.ai_conversations.length
r = await rt.ask(cfg, U, 'E os incidentes?')
check('reaproveita a conversa e envia o histórico ao modelo', db.ai_conversations.length === before && modelCalls.at(-1).messages.length === 5, [db.ai_conversations.length, modelCalls.at(-1).messages.length])

console.log('[conversa nova]')
modelScript = [{ content: [text('Oi!')] }]
await rt.startNew(cfg, U)
r = await rt.ask(cfg, U, 'Olá')
check('/open-novo começa uma conversa nova (histórico anterior não vai ao modelo)', db.ai_conversations.length === 2 && modelCalls.at(-1).messages.length === 1, [db.ai_conversations.length, modelCalls.at(-1).messages.length])

console.log('[escrita com confirmação]')
modelScript = [
  { stop_reason: 'tool_use', content: [text('Estou prestes a criar a tarefa. É basicamente isso?'), toolUse('tu2', 'create_task', { name: 'Ligar para o cliente', executorName: 'Ana Souza' })] },
  { content: [text('Tarefa criada: **Ligar para o cliente**.')] },
]
r = await rt.ask(cfg, U, 'Cria uma tarefa solta "Ligar para o cliente" para mim')
check('para na confirmação em vez de gravar', !!r.confirmation?.pendingId && r.confirmation.summary.length > 5, r)
check('nada foi gravado em entries ainda', !requests.some((q) => q.method === 'POST' && q.path.startsWith('/rest/v1/entries')))
check('a confirmação ficou guardada para o clique', db.discord_ai_pending.length === 1 && db.discord_ai_pending[0].user_id === U)
const pendingId = r.confirmation.pendingId

let denied = null
try { await rt.decide(cfg, '00000000-0000-0000-0000-0000000000bb', pendingId, true) } catch (e) { denied = e }
check('outra pessoa não pode confirmar a ação', denied?.name === 'RuntimeError' && /Só quem pediu/.test(denied.message), denied?.message)
check('e a confirmação continua valendo para quem pediu', db.discord_ai_pending.length === 1)

r = await rt.decide(cfg, U, pendingId, true)
check('confirmar executa a ação de verdade (grava a tarefa)', requests.some((q) => q.method === 'POST' && q.path.startsWith('/rest/v1/entries') && q.body.includes('Ligar para o cliente')), requests.filter((q) => q.path.includes('entries')).map((q) => q.method + q.path))
check('e o modelo conclui a conversa', r.text.includes('Tarefa criada'), r)
check('a confirmação é consumida (um segundo clique não executa de novo)', db.discord_ai_pending.length === 0)
let twice = null
try { await rt.decide(cfg, U, pendingId, true) } catch (e) { twice = e }
check('segundo clique recebe aviso, sem repetir a ação', twice?.name === 'RuntimeError', twice?.message)
check('a tarefa criada gravou só uma vez', requests.filter((q) => q.method === 'POST' && q.path.startsWith('/rest/v1/entries')).length === 1)

console.log('[mensagem nova no meio de uma confirmação]')
modelScript = [{ stop_reason: 'tool_use', content: [text('Vou criar.'), toolUse('tu5', 'create_task', { name: 'Tarefa velha', executorName: 'Ana Souza' })] }]
r = await rt.ask(cfg, U, 'cria a tarefa velha')
const oldPending = r.confirmation.pendingId
modelScript = [{ content: [text('Certo, outra coisa então.')] }]
r = await rt.ask(cfg, U, 'esquece, outra pergunta')
check('a conversa segue sem erro depois de ignorar os botões', r.text.includes('outra coisa') && r.warnings.length === 0, r)
check('a confirmação antiga deixa de existir', !db.discord_ai_pending.some((p) => p.id === oldPending))
let stale = null
try { await rt.decide(cfg, U, oldPending, true) } catch (e) { stale = e }
check('clicar no botão antigo é recusado, sem gravar', stale?.name === 'RuntimeError' && !requests.some((q) => q.method === 'POST' && q.path.startsWith('/rest/v1/entries') && q.body.includes('Tarefa velha')), stale?.message)

console.log('[conversa que já ficou com resultado duplicado (estrago antigo)]')
{
  const conv = db.ai_conversations.filter((c) => c.source === 'discord').sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0]
  const msgs = db.ai_messages.filter((m) => m.conversation_id === conv.id)
  let pos = Math.max(...msgs.map((m) => m.position ?? 0)) + 1
  const add = (role, content) => db.ai_messages.push({ id: crypto.randomUUID(), conversation_id: conv.id, user_id: U, role, content, position: pos++, created_at: new Date().toISOString() })
  add('user', [{ type: 'text', text: 'cria dup' }])
  add('assistant', [toolUse('dup1', 'create_task', { name: 'Dup' })])
  add('user', [{ type: 'tool_result', tool_use_id: 'dup1', content: 'A ação não foi concluída (repair).', is_error: true }])
  add('user', [{ type: 'tool_result', tool_use_id: 'dup1', content: '{"success":true}' }])
  add('assistant', [text('Criei.')])
  modelScript = [{ content: [text('Seguimos normalmente.')] }]
  r = await rt.ask(cfg, U, 'e agora?')
  check('a conversa com resultado duplicado é consertada e responde', r.text.includes('Seguimos') && r.warnings.length === 0, r)
}

console.log('[cancelar]')
modelScript = [
  { stop_reason: 'tool_use', content: [text('Vou criar. É basicamente isso?'), toolUse('tu3', 'create_task', { name: 'Outra tarefa', executorName: 'Ana Souza' })] },
  { content: [text('Tudo bem, não criei.')] },
]
r = await rt.ask(cfg, U, 'Cria outra tarefa')
const postsBefore = requests.filter((q) => q.method === 'POST' && q.path.startsWith('/rest/v1/entries')).length
r = await rt.decide(cfg, U, r.confirmation.pendingId, false)
check('cancelar não grava e o modelo responde', r.text.includes('não criei') && requests.filter((q) => q.method === 'POST' && q.path.startsWith('/rest/v1/entries')).length === postsBefore, r)
check('o modelo foi avisado de que a pessoa não aprovou', JSON.stringify(modelCalls.at(-1).messages).includes('não aprovou'))

console.log('[confirmação vencida]')
modelScript = [{ stop_reason: 'tool_use', content: [toolUse('tu4', 'create_task', { name: 'X', executorName: 'Ana Souza' })] }]
r = await rt.ask(cfg, U, 'cria X')
db.discord_ai_pending.at(-1).expires_at = new Date(Date.now() - 1000).toISOString()
let expired = null
try { await rt.decide(cfg, U, r.confirmation.pendingId, true) } catch (e) { expired = e }
check('confirmação vencida é recusada', expired?.name === 'RuntimeError' && /expirou/.test(expired.message), expired?.message)

console.log('[acesso]')
db.profiles[0].active = false
let off = null
try { await rt.ask(cfg, U, 'oi') } catch (e) { off = e }
check('usuário desativado não consegue usar', off?.name === 'RuntimeError' && /desativado/.test(off.message), off?.message)
db.profiles[0].active = true

console.log(`\n${pass} passou, ${fail} falhou`)
process.exit(fail ? 1 : 0)
