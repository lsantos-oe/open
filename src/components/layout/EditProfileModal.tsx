import { useState, useEffect } from 'react'
import { useAuthStore } from '@/stores/useAuthStore'
import { useToastStore } from '@/stores/useToastStore'
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
  const [name, setName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(profile?.name ?? '')
    setAvatarUrl(profile?.avatar_url ?? '')
  }, [open, profile])

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    await updateOwnProfile({ name: name.trim(), avatar_url: avatarUrl.trim() || undefined })
    setSaving(false)
    addToast('Perfil atualizado', 'success')
    onClose()
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
      </div>
    </Modal>
  )
}
