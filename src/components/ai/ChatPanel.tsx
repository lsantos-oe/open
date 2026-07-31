import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { v4 as uuid } from 'uuid'
import ReactMarkdown from 'react-markdown'
import { useAiChatStore } from '@/stores/useAiChatStore'
import { useOverlayStore } from '@/stores/useOverlayStore'
import { runConversation, approveConfirmation, rejectConfirmation } from '@/ai/runConversation'
import type { ChatContentBlock, PendingAttachment } from '@/types/ai'

const MARKDOWN_COMPONENTS = {
  p: ({ children }: { children?: React.ReactNode }) => <p style={{ margin: '0 0 6px' }}>{children}</p>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul style={{ margin: '0 0 6px', paddingLeft: 18 }}>{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol style={{ margin: '0 0 6px', paddingLeft: 18 }}>{children}</ol>,
  li: ({ children }: { children?: React.ReactNode }) => <li style={{ marginBottom: 2 }}>{children}</li>,
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>{children}</a>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code style={{ background: 'rgba(127,127,127,0.15)', borderRadius: 4, padding: '1px 4px', fontSize: '0.9em' }}>{children}</code>
  ),
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Strip the "data:<mime>;base64," prefix — Anthropic wants raw base64.
      resolve(result.split(',')[1] ?? '')
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function ChatPanel() {
  const {
    open, setOpen, messages, isStreaming, streamingText, pendingConfirmation,
    input, setInput, attachments, addAttachment, removeAttachment, clearAttachments,
    appendMessage, actionLink, setActionLink,
  } = useAiChatStore()
  const sidePanelOpen = useOverlayStore((s) => s.sidePanelCount > 0)
  const navigate = useNavigate()
  const [approving, setApproving] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages, streamingText, pendingConfirmation, actionLink])

  if (!open) return null

  async function handleFiles(files: FileList | null) {
    if (!files) return
    for (const file of Array.from(files)) {
      const isPdf = file.type === 'application/pdf'
      const isImage = file.type.startsWith('image/')
      if (!isPdf && !isImage) continue
      const data = await fileToBase64(file)
      const attachment: PendingAttachment = {
        id: uuid(),
        kind: isPdf ? 'document' : 'image',
        mediaType: file.type,
        data,
        name: file.name,
      }
      addAttachment(attachment)
    }
  }

  async function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (!file) continue
        e.preventDefault()
        const data = await fileToBase64(file)
        addAttachment({ id: uuid(), kind: 'image', mediaType: item.type, data, name: 'Imagem colada' })
      }
    }
  }

  async function handleSend() {
    if (isStreaming || pendingConfirmation) return
    const text = input.trim()
    if (!text && attachments.length === 0) return

    const content: ChatContentBlock[] = []
    for (const att of attachments) {
      content.push({
        type: att.kind,
        source: { type: 'base64', media_type: att.mediaType as never, data: att.data },
      } as ChatContentBlock)
    }
    if (text) content.push({ type: 'text', text })

    appendMessage({ id: uuid(), role: 'user', content, createdAt: new Date().toISOString() })
    setInput('')
    clearAttachments()
    setActionLink(null)
    await runConversation()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  async function handleApprove() {
    setApproving(true)
    await approveConfirmation()
    setApproving(false)
  }

  return createPortal(
    <div
      style={{
        position: 'fixed',
        bottom: 88,
        ...(sidePanelOpen
          ? { left: '50%', transform: 'translateX(-50%)' }
          : { right: 24 }),
        width: 400,
        maxWidth: 'calc(100vw - 32px)',
        height: 560,
        maxHeight: 'calc(100vh - 120px)',
        background: 'var(--surface-card)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 9985,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '0.5px solid var(--border-default)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Assistente de IA</span>
        <button
          onClick={() => setOpen(false)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 18, lineHeight: 1 }}
        >
          ×
        </button>
      </div>

      {/* Messages */}
      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.length === 0 && !isStreaming && (
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 24 }}>
            Pergunte sobre projetos, clientes ou incidentes — ou cole um texto/imagem pra extrair tarefas automaticamente.
          </p>
        )}
        {messages.map((m) => {
          const text = m.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n')
          if (!text) return null
          return (
            <div key={m.id} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div
                style={{
                  maxWidth: '85%',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-lg)',
                  fontSize: 13,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  background: m.role === 'user' ? 'var(--oe-primary)' : 'var(--surface-subtle)',
                  color: m.role === 'user' ? 'white' : 'var(--text-primary)',
                }}
              >
                <ReactMarkdown components={MARKDOWN_COMPONENTS}>{text}</ReactMarkdown>
              </div>
            </div>
          )
        })}
        {isStreaming && streamingText && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ maxWidth: '85%', padding: '8px 12px', borderRadius: 'var(--radius-lg)', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', background: 'var(--surface-subtle)', color: 'var(--text-primary)' }}>
              <ReactMarkdown components={MARKDOWN_COMPONENTS}>{streamingText}</ReactMarkdown>
            </div>
          </div>
        )}
        {isStreaming && !streamingText && (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Pensando...</div>
        )}

        {pendingConfirmation && (
          <div
            style={{
              border: '1px solid var(--oe-primary)',
              background: 'var(--oe-primary-light)',
              borderRadius: 'var(--radius-lg)',
              padding: 12,
              fontSize: 13,
              color: 'var(--text-primary)',
            }}
          >
            <p style={{ marginBottom: 10, lineHeight: 1.5 }}>{pendingConfirmation.summary}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => rejectConfirmation()}
                disabled={approving}
                style={{ fontSize: 12, padding: '5px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--surface-card)', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleApprove}
                disabled={approving}
                style={{ fontSize: 12, padding: '5px 10px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--oe-primary)', color: 'white', cursor: 'pointer' }}
              >
                {approving ? 'Aplicando...' : 'Aprovar'}
              </button>
            </div>
          </div>
        )}

        {actionLink && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <button
              onClick={() => { navigate(actionLink.to); setActionLink(null); setOpen(false) }}
              style={{
                fontSize: 12.5, fontWeight: 500, padding: '6px 12px', borderRadius: 'var(--radius-pill)',
                border: '1px solid var(--oe-primary)', background: 'var(--oe-primary-light)', color: 'var(--oe-primary)',
                cursor: 'pointer',
              }}
            >
              {actionLink.label}
            </button>
          </div>
        )}
      </div>

      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '0 16px 8px' }}>
          {attachments.map((a) => (
            <span
              key={a.id}
              style={{ fontSize: 11, padding: '3px 8px', borderRadius: 'var(--radius-pill)', background: 'var(--surface-subtle)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              {a.kind === 'image' ? '🖼️' : '📄'} {a.name ?? a.kind}
              <button onClick={() => removeAttachment(a.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 12, lineHeight: 1 }}>×</button>
            </span>
          ))}
        </div>
      )}

      {/* Composer */}
      <div style={{ padding: 12, borderTop: '0.5px solid var(--border-default)', display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => { handleFiles(e.target.files); e.target.value = '' }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Anexar imagem ou PDF"
          style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--surface-card)', color: 'var(--text-tertiary)', cursor: 'pointer' }}
        >
          +
        </button>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          placeholder="Pergunte algo ou cole um texto/imagem..."
          rows={2}
          disabled={isStreaming || !!pendingConfirmation}
          style={{
            flex: 1, resize: 'none', fontSize: 13, padding: '8px 10px', minHeight: 52, maxHeight: 140,
            border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)',
            background: 'var(--surface-input, var(--surface-card))', color: 'var(--text-primary)', outline: 'none',
          }}
        />
        <button
          onClick={handleSend}
          disabled={isStreaming || !!pendingConfirmation || (!input.trim() && attachments.length === 0)}
          style={{
            flexShrink: 0, height: 32, padding: '0 12px', borderRadius: 'var(--radius-md)', border: 'none',
            background: 'var(--oe-primary)', color: 'white', fontSize: 12, fontWeight: 500, cursor: 'pointer',
            opacity: (isStreaming || !!pendingConfirmation || (!input.trim() && attachments.length === 0)) ? 0.5 : 1,
          }}
        >
          Enviar
        </button>
      </div>
    </div>,
    document.body,
  )
}
