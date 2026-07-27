import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Project, TeamMember } from '@/types'
import { useAppStore } from '@/store/useAppStore'
import { Button } from '@/components/ui/Button'
import { Input, Field } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'

interface Props { project: Project }

const ROLES = ['PM', 'Dev Lead', 'Desenvolvedor', 'Consultor', 'Analista', 'Cliente (Champion)', 'Patrocinador']

export default function TeamTab({ project }: Props) {
  const { t } = useTranslation()
  const { addTeamMember, updateTeamMember, removeTeamMember, teamDirectory } = useAppStore()
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [mode, setMode] = useState<'directory' | 'text'>('directory')
  const [form, setForm] = useState<Omit<TeamMember, 'id'>>({ name: '', role: 'PM', email: '' })

  function openAdd() {
    setEditId(null)
    setMode('directory')
    setForm({ name: '', role: 'PM', email: '' })
    setOpen(true)
  }

  function openEdit(m: TeamMember) {
    setEditId(m.id)
    setMode(m.userId ? 'directory' : 'text')
    setForm({ name: m.name, role: m.role, email: m.email ?? '', userId: m.userId })
    setOpen(true)
  }

  function pickFromDirectory(profileId: string) {
    const profile = teamDirectory.find((p) => p.id === profileId)
    if (!profile) return
    setForm((f) => ({ ...f, userId: profile.id, name: profile.name ?? profile.email ?? '', email: profile.email ?? '' }))
  }

  function handleSave() {
    if (!form.name) return
    const member = { ...form, email: form.email || undefined, userId: mode === 'directory' ? form.userId : undefined }
    if (editId) {
      updateTeamMember(project.id, editId, member)
    } else {
      addTeamMember(project.id, member)
    }
    setOpen(false)
  }

  const roleColors: Record<string, string> = {
    PM: 'bg-blue-100 text-blue-700',
    'Dev Lead': 'bg-purple-100 text-purple-700',
    Desenvolvedor: 'bg-indigo-100 text-indigo-700',
    Consultor: 'bg-teal-100 text-teal-700',
    Analista: 'bg-cyan-100 text-cyan-700',
    'Cliente (Champion)': 'bg-orange-100 text-orange-700',
    Patrocinador: 'bg-green-100 text-green-700',
  }

  function initials(name: string) {
    return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">{t('team.title')}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{project.team.length} membro{project.team.length !== 1 ? 's' : ''}</p>
          </div>
          <Button size="sm" onClick={openAdd}>+ {t('team.add')}</Button>
        </div>

        {project.team.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <div className="text-3xl mb-2">👥</div>
            <p className="text-sm">{t('team.noMembers')}</p>
            <Button size="sm" className="mt-3" variant="secondary" onClick={openAdd}>{t('team.add')}</Button>
          </div>
        ) : (
          <div className="space-y-2">
            {project.team.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-4 p-3 rounded-lg hover:bg-gray-50 group transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-sm font-semibold text-slate-600 shrink-0">
                  {initials(member.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{member.name}</p>
                  {member.email && (
                    <p className="text-xs text-gray-400 truncate">{member.email}</p>
                  )}
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${roleColors[member.role] ?? 'bg-gray-100 text-gray-600'}`}>
                  {member.role}
                </span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(member)} className="text-gray-400 hover:text-blue-600 text-xs px-1">✎</button>
                  <button onClick={() => removeTeamMember(project.id, member.id)} className="text-gray-400 hover:text-red-500 text-xs px-1">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={open}
        title={editId ? 'Editar membro' : t('team.add')}
        onClose={() => setOpen(false)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>{t('actions.cancel')}</Button>
            <Button onClick={handleSave} disabled={!form.name}>{t('actions.save')}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode('directory')}
              className={`flex-1 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                mode === 'directory' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'
              }`}
            >
              {t('entry.fromUser')}
            </button>
            <button
              type="button"
              onClick={() => setMode('text')}
              className={`flex-1 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                mode === 'text' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'
              }`}
            >
              {t('entry.freeText')}
            </button>
          </div>

          {mode === 'directory' ? (
            <Field label={t('team.name')} required>
              <select
                value={form.userId ?? ''}
                onChange={(e) => pickFromDirectory(e.target.value)}
                className="block w-full rounded-md border px-3 py-2 text-sm focus:outline-none"
                style={{ borderColor: 'var(--border-default)', background: 'var(--surface-input)', color: 'var(--text-primary)' }}
              >
                <option value="">Selecione um usuário cadastrado...</option>
                {teamDirectory.map((p) => (
                  <option key={p.id} value={p.id}>{p.name ?? p.email}</option>
                ))}
              </select>
              {teamDirectory.length === 0 && (
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  Nenhum usuário cadastrado encontrado ainda — use "{t('entry.freeText')}" para pessoas externas.
                </p>
              )}
            </Field>
          ) : (
            <Field label={t('team.name')} required>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value, userId: undefined }))} placeholder="Nome completo" />
            </Field>
          )}
          <Field label={t('team.role')}>
            <div className="flex flex-wrap gap-2 mt-1">
              {ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, role: r }))}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    form.role === r
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {r}
                </button>
              ))}
              {!ROLES.includes(form.role) && (
                <Input
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  placeholder="Papel personalizado"
                  className="mt-1"
                />
              )}
            </div>
            <Input
              value={ROLES.includes(form.role) ? '' : form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              placeholder="Ou escreva um papel..."
              className="mt-2"
            />
          </Field>
          <Field label={t('team.email')}>
            <Input type="email" value={form.email ?? ''} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="email@empresa.com" />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
