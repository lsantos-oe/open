// O assistente de IA do Open rodando sem navegador, para o comando /open do Discord.
//
// Reaproveita o código do app (ferramentas, leitura de dados, prompt, histórico, memória, a mesma volta de conversa com
// confirmação das escritas): este arquivo só "hospeda" tudo isso no servidor. Cada pedido age como UMA pessoa — o
// servidor gera uma sessão dela (RLS, autoria e gatilhos do banco valem como se ela tivesse usado o app), carrega os
// dados do Open e roda a conversa. Empacotado por scripts/build-discord-ai.mjs para a função discord-ai.
import './polyfills'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { useClient, supabase } from './supabaseShim'
import { useAppStore } from '@/store/useAppStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useAiChatStore } from '@/stores/useAiChatStore'
import { useAiMemoryStore } from '@/stores/useAiMemoryStore'
import { useToastStore } from '@/stores/useToastStore'
import { setPromptAddendum } from '@/ai/systemPrompt'
import { approveConfirmation, rejectConfirmation, runConversation } from '@/ai/runConversation'
import { addMessage, openConversation } from '@/ai/persistence'
import { titleFromText } from '@/ai/history'
import type { ChatMessage, PendingWriteConfirmation, ChatContentBlock } from '@/types/ai'

export interface RuntimeConfig {
  supabaseUrl: string
  anonKey: string
  serviceKey: string
  /** Endereço do Open (sem barra no final) — vira o link das ações ("Ver projeto"). */
  appUrl: string
}

export interface Confirmation {
  /** Id da linha em discord_ai_pending — vai no botão. */
  pendingId: string
  /** Texto da ação que o assistente quer executar. */
  summary: string
}

export interface TurnResult {
  /** Resposta do assistente (pode ser vazia quando só há uma confirmação). */
  text: string
  confirmation?: Confirmation
  /** Atalho para o que foi criado, já com o endereço completo. */
  link?: { label: string; url: string }
  /** Erros de gravação que o app mostraria como aviso vermelho. */
  warnings: string[]
}

/** Erro que pode ser mostrado à pessoa como está (os outros viram uma mensagem genérica). */
export class RuntimeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RuntimeError'
  }
}

const DISCORD_ADDENDUM = `# Você está no Discord
Esta conversa acontece pelo comando /open do Discord, não pelo painel do Open.
- Respostas curtas e diretas (até uns 1500 caracteres). Use o Markdown do Discord: **negrito**, listas com "-". Nada de tabelas nem de títulos com #.
- Para escrever (criar ou alterar algo), apenas chame a tool: o Discord mostra os botões Confirmar e Cancelar para a pessoa. Não diga "cartão" nem "aprove no painel".
- Não invente links. Quando algo for criado, o link já é mostrado pelo sistema.
- Anexos (imagens, PDFs) não chegam por aqui. Se a pessoa precisar, peça para colar o texto.`

/** Uma conversa do Discord inativa por mais tempo que isso recomeça do zero (a conversa não cresce para sempre). */
const IDLE_NEW_CONVERSATION_MS = 24 * 60 * 60 * 1000
/** Confirmação não respondida: expira. */
const PENDING_TTL_MS = 60 * 60 * 1000

// O app guarda tudo em stores globais (um navegador = uma pessoa). Aqui um pedido por vez usa essas stores.
let chain: Promise<unknown> = Promise.resolve()
function exclusive<T>(job: () => Promise<T>): Promise<T> {
  const run = chain.then(job, job)
  chain = run.catch(() => undefined)
  return run
}

function admin(cfg: RuntimeConfig): SupabaseClient {
  return createClient(cfg.supabaseUrl, cfg.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }

/** Gera uma sessão da pessoa (sem e-mail e sem senha: o admin emite um link de login e ele é trocado na hora). */
async function signInAs(cfg: RuntimeConfig, userId: string): Promise<{ name: string }> {
  const adm = admin(cfg)
  const { data: profile, error: pe } = await adm.from('profiles').select('id, name, email, active').eq('id', userId).maybeSingle()
  if (pe || !profile) throw new RuntimeError('Não encontrei o seu usuário no Open.')
  if (!profile.active) throw new RuntimeError('O seu acesso ao Open está desativado.')
  if (!profile.email) throw new RuntimeError('Seu perfil não tem e-mail, então não consigo agir como você.')

  const { data: link, error: le } = await adm.auth.admin.generateLink({ type: 'magiclink', email: profile.email })
  const hashed = link?.properties?.hashed_token
  if (le || !hashed) throw new RuntimeError('Não consegui abrir uma sessão para você no Open.')

  const client = createClient(cfg.supabaseUrl, cfg.anonKey, clientOptions)
  const { data: session, error: ve } = await client.auth.verifyOtp({ token_hash: hashed, type: 'magiclink' })
  if (ve || !session?.user) throw new RuntimeError('Não consegui abrir uma sessão para você no Open.')

  useClient(client, cfg.supabaseUrl, cfg.anonKey)
  useAuthStore.setState({
    user: session.user,
    profile: { id: profile.id, name: profile.name, email: profile.email, role: 'member', active: true, avatar_url: null, created_at: null } as never,
    loading: false,
  })
  return { name: profile.name ?? profile.email }
}

/** Carrega os dados do Open (os mesmos carregamentos que o app faz ao abrir), todos de uma vez. */
async function loadData(): Promise<void> {
  const app = useAppStore.getState()
  await Promise.all([
    app.loadProjects(), app.loadSettings(), app.loadTeamDirectory(), app.loadClients(),
    app.loadIncidents(), app.loadContacts(), app.loadStandaloneTasks(), app.loadClientGroups(),
  ])
}

function resetStores(): void {
  useAiChatStore.getState().reset()
  useAiChatStore.setState({ conversationId: null, hydratedFor: null, conversations: [], messages: [] })
  useAiMemoryStore.setState({ memories: [], loaded: false, loadedFor: null })
  useToastStore.setState({ toasts: [] })
}

/** Erros de gravação (o app os mostra como aviso vermelho) vão para a resposta. */
function collectWarnings(): string[] {
  return useToastStore.getState().toasts.filter((t) => t.type === 'error').map((t) => t.message)
}

/** Abre a conversa SEM "consertar" um tool_use pendente (o que `openConversation` faz). Na confirmação, o último
 *  recado do assistente é justamente a ação esperando o clique: consertar gravaria um resultado de erro para ela e o
 *  clique mandaria um segundo resultado para a mesma ação — a API recusa (um resultado por tool_use). */
async function openConversationAsIs(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('ai_messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', id)
    .order('position', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true })
  if (error) throw new RuntimeError(`Não consegui abrir a conversa (${error.message}).`)
  const messages: ChatMessage[] = (data ?? []).map((m) => ({
    id: m.id as string,
    role: m.role as 'user' | 'assistant',
    content: m.content as ChatContentBlock[],
    createdAt: m.created_at as string,
  }))
  const chat = useAiChatStore.getState()
  chat.reset()
  chat.setConversationId(id)
  chat.setMessages(messages)
}

async function findOrCreateConversation(userId: string, forceNew: boolean): Promise<string> {
  if (!forceNew) {
    const { data } = await supabase
      .from('ai_conversations')
      .select('id, updated_at')
      .eq('user_id', userId)
      .eq('source', 'discord')
      .order('updated_at', { ascending: false })
      .limit(1)
    const last = data?.[0]
    if (last && Date.now() - new Date(last.updated_at as string).getTime() < IDLE_NEW_CONVERSATION_MS) return last.id as string
  }
  const id = crypto.randomUUID()
  const { error } = await supabase.from('ai_conversations').insert({ id, user_id: userId, title: 'Discord', source: 'discord' })
  if (error) throw new RuntimeError(`Não consegui criar a conversa (${error.message}).`)
  return id
}

function textOf(blocks: ChatContentBlock[]): string {
  return blocks.filter((b): b is Extract<ChatContentBlock, { type: 'text' }> => b.type === 'text').map((b) => b.text).join('\n').trim()
}

/** Texto das mensagens do assistente que surgiram depois de `fromIndex`. */
function assistantTextSince(fromIndex: number): string {
  return useAiChatStore.getState().messages
    .slice(fromIndex)
    .filter((m) => m.role === 'assistant')
    .map((m) => textOf(m.content))
    .filter(Boolean)
    .join('\n\n')
}

async function savePending(cfg: RuntimeConfig, userId: string, conversationId: string): Promise<Confirmation | undefined> {
  const chat = useAiChatStore.getState()
  const pending = chat.pendingConfirmation
  if (!pending) return undefined
  const state = { pending, queued: chat.queuedConfirmations, pendingToolResults: chat.pendingToolResults }
  const { data, error } = await admin(cfg)
    .from('discord_ai_pending')
    .insert({ user_id: userId, conversation_id: conversationId, state, expires_at: new Date(Date.now() + PENDING_TTL_MS).toISOString() })
    .select('id')
    .single()
  if (error || !data) throw new RuntimeError('Não consegui guardar a confirmação da ação.')
  return { pendingId: data.id as string, summary: pending.summary }
}

function actionLink(cfg: RuntimeConfig): TurnResult['link'] {
  const link = useAiChatStore.getState().actionLink
  if (!link) return undefined
  return { label: link.label, url: `${cfg.appUrl.replace(/\/+$/, '')}${link.to}` }
}

async function finishTurn(cfg: RuntimeConfig, userId: string, conversationId: string, fromIndex: number): Promise<TurnResult> {
  const confirmation = await savePending(cfg, userId, conversationId)
  return {
    text: assistantTextSince(fromIndex),
    confirmation,
    link: actionLink(cfg),
    warnings: collectWarnings(),
  }
}

/** Uma pergunta ou pedido da pessoa. */
export function ask(cfg: RuntimeConfig, userId: string, text: string, opts: { newConversation?: boolean } = {}): Promise<TurnResult> {
  return exclusive(async () => {
    resetStores()
    const { name } = await signInAs(cfg, userId)
    ;(globalThis as { __APP_ORIGIN__?: string }).__APP_ORIGIN__ = cfg.appUrl.replace(/\/+$/, '')
    setPromptAddendum(DISCORD_ADDENDUM)
    await loadData()

    const conversationId = await findOrCreateConversation(userId, !!opts.newConversation)
    await openConversation(conversationId)
    // Uma mensagem nova substitui qualquer confirmação que ficou sem resposta nesta conversa (o `openConversation`
    // acima já registrou essa ação como não concluída): os botões antigos deixam de valer.
    await admin(cfg).from('discord_ai_pending').delete().eq('conversation_id', conversationId)
    const fromIndex = useAiChatStore.getState().messages.length

    const message: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: [{ type: 'text', text }],
      createdAt: new Date().toISOString(),
    }
    await addMessage(message)
    if (fromIndex === 0) {
      // Primeiro recado da conversa: o título vira o assunto (a lista de conversas do painel mostra isso).
      await supabase.from('ai_conversations').update({ title: `Discord: ${titleFromText(text)}` }).eq('id', conversationId)
    }
    void name
    await runConversation()
    return finishTurn(cfg, userId, conversationId, fromIndex + 1)
  })
}

/** Só abre uma conversa nova (para o comando /open-novo). */
export function startNew(cfg: RuntimeConfig, userId: string): Promise<void> {
  return exclusive(async () => {
    resetStores()
    await signInAs(cfg, userId)
    await findOrCreateConversation(userId, true)
  })
}

/** Clique em Confirmar ou Cancelar. Só quem pediu a ação pode decidir. */
export function decide(cfg: RuntimeConfig, userId: string, pendingId: string, approve: boolean): Promise<TurnResult> {
  return exclusive(async () => {
    const adm = admin(cfg)
    const { data: row } = await adm.from('discord_ai_pending').select('*').eq('id', pendingId).maybeSingle()
    if (!row) throw new RuntimeError('Essa confirmação já foi respondida ou não existe mais.')
    if (row.user_id !== userId) throw new RuntimeError('Só quem pediu a ação pode confirmar ou cancelar.')
    if (new Date(row.expires_at as string).getTime() < Date.now()) {
      await adm.from('discord_ai_pending').delete().eq('id', pendingId)
      throw new RuntimeError('Essa confirmação expirou. Peça de novo com /open.')
    }
    // Apaga antes de executar: um segundo clique (ou dois cliques rápidos) nunca executa a ação duas vezes.
    const { data: taken } = await adm.from('discord_ai_pending').delete().eq('id', pendingId).select('id')
    if (!taken?.length) throw new RuntimeError('Essa confirmação já foi respondida.')

    resetStores()
    await signInAs(cfg, userId)
    ;(globalThis as { __APP_ORIGIN__?: string }).__APP_ORIGIN__ = cfg.appUrl.replace(/\/+$/, '')
    setPromptAddendum(DISCORD_ADDENDUM)
    await loadData()
    await openConversationAsIs(row.conversation_id as string)
    const fromIndex = useAiChatStore.getState().messages.length

    const state = row.state as { pending: PendingWriteConfirmation; queued: PendingWriteConfirmation[]; pendingToolResults: ChatContentBlock[] }
    // A conversa precisa estar exatamente onde a confirmação parou: o último recado é o do assistente com esta ação.
    const last = useAiChatStore.getState().messages.at(-1)
    const waiting = last?.role === 'assistant' && last.content.some((b) => b.type === 'tool_use' && b.id === state.pending?.toolUseId)
    if (!waiting) throw new RuntimeError('Essa confirmação não vale mais, porque a conversa seguiu. Peça de novo com /open.')
    const chat = useAiChatStore.getState()
    chat.setPendingToolResults(state.pendingToolResults ?? [])
    chat.setQueuedConfirmations(state.queued ?? [])
    chat.setPendingConfirmation(state.pending)

    if (approve) await approveConfirmation(); else await rejectConfirmation()
    return finishTurn(cfg, userId, row.conversation_id as string, fromIndex)
  })
}

/** Procura a pessoa do Open ligada a este usuário do Discord (a ligação é feita e confirmada no perfil). */
export async function findUserByDiscordId(cfg: RuntimeConfig, discordId: string): Promise<{ id: string; name: string | null } | null> {
  const { data } = await admin(cfg).from('profiles').select('id, name').eq('discord_user_id', discordId).maybeSingle()
  return data ? { id: data.id as string, name: (data.name as string | null) ?? null } : null
}
