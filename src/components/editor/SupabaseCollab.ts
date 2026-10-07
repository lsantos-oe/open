import * as Y from 'yjs'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

/** Nome do fragmento Yjs onde o BlockNote guarda o documento. Fixo: muda o formato se mudar. */
export const COLLAB_FRAGMENT = 'document-store'

export type CollabStatus = 'loading' | 'ready' | 'error'

interface UpdateRow {
  id: number
  kind: 'update' | 'snapshot' | 'reset'
  data: string
  created_by: string | null
}

const REMOTE = 'remote'
const FLUSH_DELAY_MS = 350
const COMPACT_THRESHOLD = 60
const MAX_RETRY_DELAY_MS = 15_000

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000 // evita estourar a pilha com String.fromCharCode(...array grande)
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(bin)
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Sincroniza um documento Yjs via Supabase.
 *
 *  • Persistência: cada edição vira uma linha em collab_doc_updates (append-only). O Realtime
 *    (postgres_changes) entrega as linhas aos outros editores. Atualizações de CRDT são
 *    idempotentes e comutativas, então ordem e duplicatas não importam — nada se perde.
 *  • Presença (cursores/nomes): awareness do y-protocols por um canal de broadcast.
 *  • O documento nasce do Markdown existente UMA vez (RPC collab_init decide quem inicializa). */
export class SupabaseCollab {
  readonly doc = new Y.Doc()
  readonly awareness = new Awareness(this.doc)
  status: CollabStatus = 'loading'
  /** Chamado quando outra pessoa substituiu o documento inteiro (ex.: importação). */
  onReset?: () => void

  private channel?: RealtimeChannel
  private knownIds = new Set<number>()
  private maxId = 0
  private rowCount = 0
  private pending: Uint8Array[] = []
  private flushTimer?: ReturnType<typeof setTimeout>
  private retryDelay = FLUSH_DELAY_MS
  private flushing = false
  private destroyed = false
  private ready = false
  private statusListeners = new Set<() => void>()

  constructor(readonly docId: string, private readonly userId: string) {}

  subscribeStatus(cb: () => void): () => void {
    this.statusListeners.add(cb)
    return () => { this.statusListeners.delete(cb) }
  }

  private setStatus(s: CollabStatus) {
    this.status = s
    this.statusListeners.forEach((cb) => cb())
  }

  /** `seed`: produz a atualização Yjs inicial (a partir do Markdown) — só é chamado se o documento ainda não existe. */
  async connect(seed: () => Promise<Uint8Array>): Promise<void> {
    try {
      await this.openChannel()
      // Sequencial de propósito (ver App.tsx): chamadas simultâneas disputam o lock de sessão do gotrue-js.
      let rows = await this.fetchRows()
      if (this.destroyed) return
      if (!rows.some((r) => r.kind !== 'reset')) {
        const update = await seed()
        const { data: won, error } = await supabase.rpc('collab_init', { p_doc: this.docId, p_data: bytesToBase64(update) })
        if (error) throw new Error(error.message)
        if (won) {
          Y.applyUpdate(this.doc, update, REMOTE)
        } else {
          // Outra pessoa inicializou primeiro: descarta a semente local e usa a que ficou.
          rows = await this.fetchRows()
        }
      }
      if (this.destroyed) return
      for (const row of rows) this.applyRow(row)

      this.doc.on('update', this.onLocalUpdate)
      this.awareness.on('update', this.onAwarenessUpdate)
      this.ready = true
      this.setStatus('ready')
      this.broadcastAwareness([this.doc.clientID])
      this.channel?.send({ type: 'broadcast', event: 'awareness-query', payload: {} })
      if (this.rowCount > COMPACT_THRESHOLD) void this.compact()
    } catch (err) {
      console.error('Falha ao conectar ao documento colaborativo:', err)
      if (!this.destroyed) this.setStatus('error')
    }
  }

  private openChannel(): Promise<void> {
    return new Promise((resolve) => {
      const channel = supabase
        .channel(`collab:${this.docId}`, { config: { broadcast: { self: false } } })
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'collab_doc_updates', filter: `doc_id=eq.${this.docId}` },
          (payload) => this.onRemoteRow(payload.new as UpdateRow),
        )
        .on('broadcast', { event: 'awareness' }, ({ payload }) => {
          applyAwarenessUpdate(this.awareness, base64ToBytes(payload.update as string), REMOTE)
        })
        .on('broadcast', { event: 'awareness-query' }, () => this.broadcastAwareness([this.doc.clientID]))
      this.channel = channel
      // Não trava a abertura se o Realtime demorar: o documento carrega do banco de qualquer forma.
      const timer = setTimeout(resolve, 4000)
      channel.subscribe((state) => {
        if (state === 'SUBSCRIBED') { clearTimeout(timer); resolve() }
      })
    })
  }

  private async fetchRows(): Promise<UpdateRow[]> {
    const { data, error } = await supabase
      .from('collab_doc_updates')
      .select('id, kind, data, created_by')
      .eq('doc_id', this.docId)
      .order('id', { ascending: true })
      .limit(5000)
    if (error) throw new Error(error.message)
    return (data ?? []) as UpdateRow[]
  }

  private applyRow(row: UpdateRow) {
    if (this.knownIds.has(row.id)) return
    this.knownIds.add(row.id)
    this.maxId = Math.max(this.maxId, row.id)
    if (row.kind === 'reset') return
    this.rowCount++
    if (row.data) Y.applyUpdate(this.doc, base64ToBytes(row.data), REMOTE)
  }

  private onRemoteRow(row: UpdateRow) {
    if (this.destroyed) return
    if (row.kind === 'reset') {
      this.knownIds.add(row.id)
      if (this.ready) this.onReset?.()
      return
    }
    this.applyRow(row)
  }

  // ── envio das edições locais ───────────────────────────────────────────────

  private onLocalUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === REMOTE || this.destroyed) return
    this.pending.push(update)
    this.scheduleFlush(FLUSH_DELAY_MS)
  }

  private scheduleFlush(delay: number) {
    clearTimeout(this.flushTimer)
    this.flushTimer = setTimeout(() => { void this.flush() }, delay)
  }

  /** Grava as edições acumuladas num único update. Em caso de falha (offline) mantém na fila e tenta de novo. */
  async flush(): Promise<void> {
    if (this.flushing || this.pending.length === 0) return
    this.flushing = true
    const batch = this.pending
    this.pending = []
    try {
      const merged = batch.length === 1 ? batch[0] : Y.mergeUpdates(batch)
      const { data, error } = await supabase
        .from('collab_doc_updates')
        .insert({ doc_id: this.docId, data: bytesToBase64(merged), created_by: this.userId })
        .select('id')
        .single()
      if (error) throw new Error(error.message)
      // Registra o id para ignorar o eco do Realtime da nossa própria gravação.
      if (data) { this.knownIds.add(data.id as number); this.maxId = Math.max(this.maxId, data.id as number); this.rowCount++ }
      this.retryDelay = FLUSH_DELAY_MS
    } catch (err) {
      console.warn('Falha ao salvar edição; vai tentar de novo:', err)
      this.pending = [...batch, ...this.pending]
      this.retryDelay = Math.min(this.retryDelay * 2, MAX_RETRY_DELAY_MS)
      if (!this.destroyed) this.scheduleFlush(this.retryDelay)
    } finally {
      this.flushing = false
    }
    if (this.pending.length > 0 && !this.destroyed && !this.flushTimer) this.scheduleFlush(FLUSH_DELAY_MS)
  }

  /** Troca as linhas já carregadas por um snapshot único (mantém o documento pequeno e a abertura rápida). */
  private async compact() {
    if (this.pending.length > 0) await this.flush()
    const upTo = this.maxId
    const snapshot = Y.encodeStateAsUpdate(this.doc)
    const { error } = await supabase.rpc('collab_compact', { p_doc: this.docId, p_data: bytesToBase64(snapshot), p_up_to: upTo })
    if (error) console.warn('Falha ao compactar o documento:', error.message)
  }

  // ── presença ───────────────────────────────────────────────────────────────

  private onAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (origin === REMOTE) return
    this.broadcastAwareness([...added, ...updated, ...removed])
  }

  private broadcastAwareness(clients: number[]) {
    if (!this.channel || this.destroyed) return
    const update = encodeAwarenessUpdate(this.awareness, clients)
    void this.channel.send({ type: 'broadcast', event: 'awareness', payload: { update: bytesToBase64(update) } })
  }

  // ── ciclo de vida ──────────────────────────────────────────────────────────

  async destroy(): Promise<void> {
    if (this.destroyed) return
    clearTimeout(this.flushTimer)
    // Garante que a última digitação vá ao banco antes de fechar.
    this.flushTimer = undefined
    if (this.ready && this.pending.length > 0) await this.flush()
    this.destroyed = true
    this.doc.off('update', this.onLocalUpdate)
    this.awareness.off('update', this.onAwarenessUpdate)
    this.awareness.setLocalState(null)
    if (this.channel) {
      // Avisa os outros que saímos (some o cursor) antes de fechar o canal.
      try { this.broadcastAwarenessRemoval() } catch { /* ignore */ }
      void supabase.removeChannel(this.channel)
    }
    this.awareness.destroy()
    this.doc.destroy()
  }

  private broadcastAwarenessRemoval() {
    if (!this.channel) return
    const update = encodeAwarenessUpdate(this.awareness, [this.doc.clientID])
    void this.channel.send({ type: 'broadcast', event: 'awareness', payload: { update: bytesToBase64(update) } })
  }
}
