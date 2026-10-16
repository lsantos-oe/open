import { useState, useEffect } from 'react'
import { useAuthStore } from '@/stores/useAuthStore'
import { useToastStore } from '@/stores/useToastStore'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Field } from '@/components/ui/Input'
import { linkDiscord, unlinkDiscord } from '@/utils/discordLink'
import type { DiscordPrefs } from '@/types/database'

interface Props {
  open: boolean
  onClose: () => void
}

const DEFAULT_PREFS: DiscordPrefs = { assigned: true, changed: true, due: true }

const PREF_OPTIONS: { key: keyof DiscordPrefs; label: string }[] = [
  { key: 'assigned', label: 'Quando atribuírem uma tarefa a mim (ou criarem já comigo)' },
  { key: 'changed', label: 'Quando outra pessoa alterar uma tarefa minha' },
  { key: 'due', label: 'Quando uma tarefa minha vencer (1 dia antes e no dia)' },
]

export function EditProfileModal({ open, onClose }: Props) {
  const { profile, updateOwnProfile } = useAuthStore()
  const { addToast } = useToastStore()
  const [name, setName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [prefs, setPrefs] = useState<DiscordPrefs>(DEFAULT_PREFS)
  const [discordInput, setDiscordInput] = useState('')
  const [discordBusy, setDiscordBusy] = useState(false)
  const [discordError, setDiscordError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const linked = !!profile?.discord_user_id

  useEffect(() => {
    if (!open) return
    setName(profile?.name ?? '')
    setAvatarUrl(profile?.avatar_url ?? '')
    setPrefs({ ...DEFAULT_PREFS, ...(profile?.discord_prefs ?? {}) })
    setDiscordInput('')
    setDiscordError(null)
  }, [open, profile])

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    await updateOwnProfile({ name: name.trim(), avatar_url: avatarUrl.trim() || undefined, discord_prefs: prefs })
    setSaving(false)
    addToast('Perfil atualizado', 'success')
    onClose()
  }

  async function handleConnect() {
    if (!discordInput.trim()) return
    setDiscordBusy(true)
    setDiscordError(null)
    try {
      const result = await linkDiscord(discordInput)
      useAuthStore.setState((s) => ({ profile: s.profile ? { ...s.profile, ...result } : s.profile }))
      setDiscordInput('')
      addToast('Discord conectado. Enviei uma mensagem de teste.', 'success')
    } catch (err) {
      setDiscordError(err instanceof Error ? err.message : 'Não foi possível conectar o Discord.')
    } finally {
      setDiscordBusy(false)
    }
  }

  async function handleDisconnect() {
    setDiscordBusy(true)
    setDiscordError(null)
    try {
      const result = await unlinkDiscord()
      useAuthStore.setState((s) => ({ profile: s.profile ? { ...s.profile, ...result } : s.profile }))
      addToast('Discord desconectado', 'success')
    } catch (err) {
      setDiscordError(err instanceof Error ? err.message : 'Não foi possível desconectar o Discord.')
    } finally {
      setDiscordBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title="Editar perfil"
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving}>É basicamente isso</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nome" required>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
        </Field>
        <Field label="URL do avatar" hint="Link direto pra uma imagem — sem upload de arquivo por enquanto.">
          <Input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://..." />
        </Field>

        <div className="pt-4 space-y-3" style={{ borderTop: '1px solid var(--border-default)' }}>
          <div>
            <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>Alertas no Discord</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              O Open manda uma mensagem direta com os avisos das suas tarefas.
            </p>
          </div>

          {linked ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                Conectado como <strong>@{profile?.discord_username ?? profile?.discord_user_id}</strong>
              </p>
              <Button variant="secondary" onClick={handleDisconnect} disabled={discordBusy}>Desconectar</Button>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <Input
                  value={discordInput}
                  onChange={(e) => setDiscordInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleConnect() } }}
                  placeholder="Seu @ do Discord (ex.: fulano)"
                  disabled={discordBusy}
                />
              </div>
              <Button onClick={handleConnect} disabled={!discordInput.trim() || discordBusy}>
                {discordBusy ? 'Conectando…' : 'Conectar'}
              </Button>
            </div>
          )}
          {discordError && <p className="text-xs" role="alert" style={{ color: 'var(--status-critical, #c0392b)' }}>{discordError}</p>}

          <div className="space-y-1.5" style={{ opacity: linked ? 1 : 0.5 }}>
            {PREF_OPTIONS.map((opt) => (
              <label key={opt.key} className="flex items-center gap-2 text-[13px] cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                  className="rounded border-[var(--border-default)] accent-[var(--oe-primary)]"
                  checked={prefs[opt.key]}
                  disabled={!linked}
                  onChange={(e) => setPrefs((p) => ({ ...p, [opt.key]: e.target.checked }))}
                />
                {opt.label}
              </label>
            ))}
          </div>
          {!linked && (
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Você precisa estar no servidor do Discord do time e aceitar mensagens diretas dos membros dele. Ao conectar, chega uma mensagem de teste.
            </p>
          )}
        </div>
      </div>
    </Modal>
  )
}
