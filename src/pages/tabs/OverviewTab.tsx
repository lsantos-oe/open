import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Project, ProjectCharter } from '@/types'
import { useAppStore } from '@/store/useAppStore'
import { Button } from '@/components/ui/Button'
import { Input, Textarea, Field } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'

const EMPTY_CHARTER: ProjectCharter = {
  sponsor: '',
  objectives: '',
  scope: '',
  outOfScope: '',
  successCriteria: '',
  constraints: '',
  assumptions: '',
  budget: '',
}

const CHARTER_TEXTAREAS: { key: keyof ProjectCharter; rows?: number }[] = [
  { key: 'objectives', rows: 4 },
  { key: 'scope', rows: 4 },
  { key: 'outOfScope', rows: 3 },
  { key: 'successCriteria', rows: 3 },
  { key: 'constraints', rows: 3 },
  { key: 'assumptions', rows: 3 },
]

interface Props {
  project: Project
}

function ExternalLinkField({
  label, value, onSave, buttonLabel,
}: {
  label: string
  value: string | undefined
  onSave: (url: string) => void
  buttonLabel: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')

  function save() {
    onSave(draft.trim())
    setEditing(false)
  }

  return (
    <Field label={label}>
      {editing ? (
        <div className="flex gap-2">
          <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="https://..." />
          <Button size="sm" onClick={save}>Salvar</Button>
          <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>
        </div>
      ) : value ? (
        <div className="flex items-center gap-2">
          <a href={value} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="secondary">{buttonLabel} ↗</Button>
          </a>
          <button onClick={() => { setDraft(value); setEditing(true) }} className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">editar</button>
        </div>
      ) : (
        <button onClick={() => { setDraft(''); setEditing(true) }} className="text-sm text-[var(--oe-primary)] hover:underline">+ Adicionar link</button>
      )}
    </Field>
  )
}

export default function OverviewTab({ project }: Props) {
  const { t } = useTranslation()
  const { updateProject, addProjectLink, removeProjectLink } = useAppStore()
  const [overview, setOverview] = useState(project.overview ?? '')
  const [charter, setCharter] = useState<ProjectCharter>(project.charter ?? EMPTY_CHARTER)
  const [linkModal, setLinkModal] = useState(false)
  const [linkForm, setLinkForm] = useState({ label: '', url: '' })
  const overviewTimer = useRef<ReturnType<typeof setTimeout>>()
  const charterTimer = useRef<ReturnType<typeof setTimeout>>()

  // Sync from store when project changes externally
  useEffect(() => {
    setOverview(project.overview ?? '')
    setCharter(project.charter ?? EMPTY_CHARTER)
  }, [project.id])

  // Autosave with debounce
  useEffect(() => {
    clearTimeout(overviewTimer.current)
    overviewTimer.current = setTimeout(() => updateProject(project.id, { overview }), 700)
    return () => clearTimeout(overviewTimer.current)
  }, [overview])

  useEffect(() => {
    clearTimeout(charterTimer.current)
    charterTimer.current = setTimeout(() => updateProject(project.id, { charter }), 700)
    return () => clearTimeout(charterTimer.current)
  }, [charter])

  function setCharterField(field: keyof ProjectCharter, value: string) {
    setCharter((c) => ({ ...c, [field]: value }))
  }

  function handleAddLink() {
    if (!linkForm.url) return
    addProjectLink(project.id, { label: linkForm.label || linkForm.url, url: linkForm.url })
    setLinkForm({ label: '', url: '' })
    setLinkModal(false)
  }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      {/* Ploomes links */}
      <div className="bg-[var(--surface-card)] rounded-[var(--radius-lg)] border border-[var(--border-default)] p-6">
        <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4">Ploomes</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <ExternalLinkField
            label="Proposta"
            value={project.proposalLink}
            buttonLabel="Abrir proposta"
            onSave={(url) => updateProject(project.id, { proposalLink: url || undefined })}
          />
          <ExternalLinkField
            label="Negócio (deal)"
            value={project.dealLink}
            buttonLabel="Abrir negócio"
            onSave={(url) => updateProject(project.id, { dealLink: url || undefined })}
          />
        </div>
      </div>

      {/* Notes */}
      <div className="bg-[var(--surface-card)] rounded-[var(--radius-lg)] border border-[var(--border-default)] p-6">
        <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-3">{t('overview.notes')}</h3>
        <Textarea
          value={overview}
          onChange={(e) => setOverview(e.target.value)}
          rows={10}
          placeholder={t('overview.notesPlaceholder')}
        />
        <p className="text-xs text-[var(--text-tertiary)] mt-2">{t('overview.autosaved')}</p>
      </div>

      {/* External links */}
      <div className="bg-[var(--surface-card)] rounded-[var(--radius-lg)] border border-[var(--border-default)] p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)]">{t('overview.links')}</h3>
          <Button size="sm" variant="secondary" onClick={() => setLinkModal(true)}>
            + {t('overview.addLink')}
          </Button>
        </div>

        {project.links.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)]">{t('overview.noLinks')}</p>
        ) : (
          <ul className="space-y-2">
            {project.links.map((link) => (
              <li key={link.id} className="flex items-center gap-3 group">
                <div className="w-5 h-5 rounded-[var(--radius-sm)] bg-[var(--color-info-bg)] flex items-center justify-center shrink-0">
                  <svg className="w-3 h-3 text-[var(--color-info-text)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </div>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[var(--oe-primary)] hover:underline flex-1 truncate"
                >
                  {link.label}
                </a>
                <span className="text-xs text-[var(--text-disabled)] truncate max-w-[200px] hidden sm:block">{link.url}</span>
                <button
                  onClick={() => removeProjectLink(project.id, link.id)}
                  className="text-[var(--text-disabled)] hover:text-[var(--color-danger-text)] opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Charter */}
      <div className="bg-[var(--surface-card)] rounded-[var(--radius-lg)] border border-[var(--border-default)] p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)]">{t('charter.title')}</h3>
          <span className="text-xs text-[var(--text-tertiary)]">Salvo automaticamente</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label={t('charter.sponsor')}>
            <Input
              value={charter.sponsor}
              onChange={(e) => setCharterField('sponsor', e.target.value)}
              placeholder="Nome do sponsor executivo"
            />
          </Field>
          <Field label={t('charter.budget')}>
            <Input
              value={charter.budget ?? ''}
              onChange={(e) => setCharterField('budget', e.target.value)}
              placeholder="Ex: R$ 50.000"
            />
          </Field>
        </div>

        <div className="border-t border-[var(--border-default)] pt-5 grid grid-cols-1 gap-5">
          {CHARTER_TEXTAREAS.map(({ key, rows }) => (
            <Field key={key} label={t(`charter.${key}`)}>
              <Textarea
                value={charter[key] ?? ''}
                onChange={(e) => setCharterField(key, e.target.value)}
                rows={rows ?? 3}
                placeholder={`Descreva ${t(`charter.${key}`).toLowerCase()}...`}
              />
            </Field>
          ))}
        </div>
      </div>

      {/* Project metadata */}
      <div className="bg-[var(--surface-card)] rounded-[var(--radius-lg)] border border-[var(--border-default)] p-6">
        <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4">{t('overview.information')}</h3>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          {[
            [t('project.client'), project.client],
            [t('project.pm'), project.pm],
            [t('project.devLead'), project.devLead || '—'],
            [t('overview.devType'), project.devType ? t(`project.${project.devType}`) : '—'],
            [t('project.devIntegration'), project.devIntegration || '—'],
            [t('overview.baseline'), project.baselineSetAt ? new Date(project.baselineSetAt).toLocaleDateString() : '—'],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-[var(--text-tertiary)] text-xs">{label}</dt>
              <dd className="font-medium text-[var(--text-primary)] mt-0.5">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Add link modal */}
      <Modal
        open={linkModal}
        title={t('overview.addLink')}
        onClose={() => setLinkModal(false)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setLinkModal(false)}>{t('actions.cancel')}</Button>
            <Button onClick={handleAddLink} disabled={!linkForm.url}>{t('actions.confirm')}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t('overview.linkLabel')}>
            <Input
              value={linkForm.label}
              onChange={(e) => setLinkForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="Ex: SharePoint do projeto"
            />
          </Field>
          <Field label={t('overview.linkUrl')} required>
            <Input
              value={linkForm.url}
              onChange={(e) => setLinkForm((f) => ({ ...f, url: e.target.value }))}
              placeholder="https://..."
              type="url"
            />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
