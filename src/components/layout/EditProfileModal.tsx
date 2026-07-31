import { useState, useEffect } from 'react'
import { useAuthStore } from '@/stores/useAuthStore'
import { useToastStore } from '@/stores/useToastStore'
import { useAiStore } from '@/stores/useAiStore'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Field } from '@/components/ui/Input'

interface Props {
  open: boolean
  onClose: () => void
}

export function EditProfileModal({ open, onClose }: Props) {
  const { profile, updateOwnProfile } = useAuthStore()
  const { addToast } = useToastStore()
  const { hasKey, saving: savingKey, saveKey, removeKey } = useAiStore()
  const [name, setName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [apiKey, setApiKey] = useState('')

  useEffect(() => {
    if (!open) return
    setName(profile?.name ?? '')
    setAvatarUrl(profile?.avatar_url ?? '')
    setApiKey('')
  }, [open, profile])

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    await updateOwnProfile({ name: name.trim(), avatar_url: avatarUrl.trim() || undefined })
    setSaving(false)
    addToast('Perfil atualizado', 'success')
    onClose()
  }

  async function handleSaveKey() {
    const ok = await saveKey(apiKey)
    if (ok) {
      setApiKey('')
      addToast('Chave da API salva com sucesso', 'success')
    }
  }

  async function handleRemoveKey() {
    await removeKey()
    addToast('Chave da API removida', 'success')
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
          <Button onClick={handleSave} disabled={!name.trim() || saving}>Salvar</Button>
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

        <div className="pt-1" style={{ borderTop: '1px solid var(--border-default)' }}>
          <p className="text-sm font-medium mt-4 mb-1" style={{ color: 'var(--text-primary)' }}>Assistente de IA</p>
          <p className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>
            Cole sua própria API key da Anthropic (Claude) pra liberar o assistente de chat. O uso é debitado direto da sua conta — a chave fica criptografada e só você consegue usá-la.
          </p>
          {hasKey ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm" style={{ color: 'var(--color-success-text)' }}>Chave configurada ✓</span>
              <Button variant="secondary" size="sm" onClick={handleRemoveKey} disabled={savingKey}>Remover chave</Button>
            </div>
          ) : (
            <Field label="API key da Anthropic">
              <div className="flex gap-2">
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                  className="flex-1"
                />
                <Button size="sm" onClick={handleSaveKey} disabled={!apiKey.trim() || savingKey}>
                  {savingKey ? 'Validando...' : 'Validar e salvar'}
                </Button>
              </div>
            </Field>
          )}
        </div>
      </div>
    </Modal>
  )
}
