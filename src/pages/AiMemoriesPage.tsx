import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAiMemoryStore } from '@/stores/useAiMemoryStore'
import { MEMORY_KIND_LABEL, MEMORY_LIMIT, MEMORY_MAX_LENGTH } from '@/ai/history'
import type { AiMemory, AiMemoryKind } from '@/types/ai'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'

const KINDS = Object.keys(MEMORY_KIND_LABEL) as AiMemoryKind[]

const KIND_HINT: Record<AiMemoryKind, string> = {
  preference: 'Como você gosta das coisas',
  fact: 'Fato estável (nomes, apelidos, regras)',
  correction: 'Algo que o assistente errou e você corrigiu',
  context: 'Contexto de longo prazo do seu trabalho',
}

const KIND_STYLE: Record<AiMemoryKind, { background: string; color: string }> = {
  preference: { background: 'var(--color-info-bg)', color: 'var(--color-info-text)' },
  fact: { background: 'var(--color-success-bg)', color: 'var(--color-success-text)' },
  correction: { background: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' },
  context: { background: 'var(--color-violet-bg)', color: 'var(--color-violet-text)' },
}

function MemoryRow({ memory }: { memory: AiMemory }) {
  const { update, remove } = useAiMemoryStore()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(memory.content)
  const [kind, setKind] = useState(memory.kind)
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    const ok = await update(memory.id, { content: text, kind })
    setBusy(false)
    if (ok) setEditing(false)
  }

  return (
    <li className="p-4 border-b last:border-b-0" style={{ borderColor: 'var(--border-default)' }}>
      {editing ? (
        <div className="space-y-2">
          <Textarea value={text} maxLength={MEMORY_MAX_LENGTH} rows={2} autoFocus onChange={(e) => setText(e.target.value)} />
          <div className="flex items-center gap-2 flex-wrap">
            <div className="w-44 shrink-0">
              <Select value={kind} onChange={(e) => setKind(e.target.value as AiMemoryKind)}>
                {KINDS.map((k) => <option key={k} value={k}>{MEMORY_KIND_LABEL[k]}</option>)}
              </Select>
            </div>
            <span className="text-xs mr-auto" style={{ color: 'var(--text-tertiary)' }}>{text.length}/{MEMORY_MAX_LENGTH}</span>
            <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setText(memory.content); setKind(memory.kind) }}>Cancelar</Button>
            <Button size="sm" onClick={save} disabled={busy || !text.trim()}>Salvar</Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <span className="text-[11px] font-medium px-2 py-0.5 shrink-0 mt-0.5" style={{ borderRadius: 'var(--radius-pill)', ...KIND_STYLE[memory.kind] }}>
            {MEMORY_KIND_LABEL[memory.kind]}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm" style={{ color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{memory.content}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
              {memory.source === 'assistant' ? 'Anotada pelo assistente' : 'Escrita por você'} · {new Date(memory.updatedAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button className="text-xs px-2 py-1" style={{ color: 'var(--text-tertiary)' }} onClick={() => setEditing(true)}>Editar</button>
            <button
              className="text-xs px-2 py-1"
              style={{ color: 'var(--color-danger-text)' }}
              onClick={() => { if (window.confirm('Esquecer esta memória?')) void remove(memory.id) }}
            >
              Apagar
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

export default function AiMemoriesPage() {
  const { memories, loaded, load, add, clearAll } = useAiMemoryStore()
  const [newText, setNewText] = useState('')
  const [newKind, setNewKind] = useState<AiMemoryKind>('preference')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => { void load() }, [load])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? memories.filter((m) => m.content.toLowerCase().includes(q)) : memories
  }, [memories, query])

  async function handleAdd() {
    setAdding(true)
    setError('')
    const res = await add({ content: newText, kind: newKind, source: 'user' })
    setAdding(false)
    if (res.ok) setNewText('')
    else setError(res.error ?? 'Não foi possível salvar.')
  }

  async function handleClear() {
    if (!window.confirm(`Apagar TODAS as ${memories.length} memórias? O assistente volta a não saber nada sobre você.`)) return
    await clearAll()
  }

  return (
    <div className="p-6 max-w-[760px] mx-auto">
      <Link to="/settings" className="text-xs" style={{ color: 'var(--text-tertiary)' }}>← Configurações</Link>
      <h1 className="text-lg font-semibold mt-2" style={{ color: 'var(--text-primary)' }}>Memória do assistente</h1>
      <p className="text-sm mt-1 mb-6 max-w-xl" style={{ color: 'var(--text-tertiary)' }}>
        Notas curtas que o assistente guarda sobre você para não recomeçar do zero a cada conversa: preferências, correções e fatos duradouros.
        São <strong style={{ color: 'var(--text-secondary)' }}>só suas</strong> — ninguém do time vê, e só entram nas suas conversas.
        Você pode editar ou apagar qualquer uma.
      </p>

      <section className="rounded-[var(--radius-lg)] border p-4 mb-6" style={{ background: 'var(--surface-card)', borderColor: 'var(--border-default)' }}>
        <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Adicionar uma memória</p>
        <Textarea
          value={newText}
          maxLength={MEMORY_MAX_LENGTH}
          rows={2}
          placeholder="Ex.: Prefere status reports curtos, sem tabela de riscos."
          onChange={(e) => setNewText(e.target.value)}
        />
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <div className="w-44 shrink-0">
            <Select value={newKind} onChange={(e) => setNewKind(e.target.value as AiMemoryKind)} title={KIND_HINT[newKind]}>
              {KINDS.map((k) => <option key={k} value={k}>{MEMORY_KIND_LABEL[k]}</option>)}
            </Select>
          </div>
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{KIND_HINT[newKind]}</span>
          <Button size="sm" className="ml-auto" onClick={handleAdd} disabled={adding || !newText.trim() || memories.length >= MEMORY_LIMIT}>Adicionar</Button>
        </div>
        {error && <p className="text-xs mt-2" style={{ color: 'var(--color-danger-text)' }}>{error}</p>}
      </section>

      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
          Suas memórias <span className="font-normal" style={{ color: 'var(--text-tertiary)' }}>({memories.length} de {MEMORY_LIMIT})</span>
        </h2>
        {memories.length > 6 && (
          <div className="w-48 ml-auto"><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar…" /></div>
        )}
        {memories.length > 0 && (
          <Button variant="danger" size="sm" className={memories.length > 6 ? '' : 'ml-auto'} onClick={handleClear}>Apagar todas</Button>
        )}
      </div>

      {!loaded ? (
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Carregando…</p>
      ) : memories.length === 0 ? (
        <EmptyState
          title="Nenhuma memória ainda"
          description="Conforme você conversa, o assistente anota o que vale lembrar — e avisa a cada anotação. Você também pode adicionar as suas acima."
        />
      ) : visible.length === 0 ? (
        <p className="text-sm py-6 text-center" style={{ color: 'var(--text-tertiary)' }}>Nada encontrado.</p>
      ) : (
        <ul className="rounded-[var(--radius-lg)] border" style={{ background: 'var(--surface-card)', borderColor: 'var(--border-default)' }}>
          {visible.map((m) => <MemoryRow key={m.id} memory={m} />)}
        </ul>
      )}
    </div>
  )
}
