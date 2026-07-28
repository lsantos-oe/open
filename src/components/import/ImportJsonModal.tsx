import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '@/store/useAppStore'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { validateImportJson, importNewProject, importUpdateProject, ValidationResult } from '@/utils/importJson'

interface Props {
  initialTab: 'new' | 'update'
  projectId?: string
  onClose: () => void
}

type Tab = 'new' | 'update'
type MergeMode = 'replace' | 'merge'

export default function ImportJsonModal({ initialTab, projectId, onClose }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { projects, importProject, updateProject } = useAppStore()

  const [tab, setTab] = useState<Tab>(initialTab)
  const [jsonText, setJsonText] = useState('')
  const [result, setResult] = useState<ValidationResult | null>(null)
  const [mergeMode, setMergeMode] = useState<MergeMode>('replace')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [blurError, setBlurError] = useState<string | null>(null)

  const targetProject = projectId ? projects.find(p => p.id === projectId) : undefined

  // Reset validation when text or tab changes
  useEffect(() => {
    setResult(null)
    setImportError(null)
    setBlurError(null)
  }, [jsonText, tab])

  function handleBlur() {
    if (!jsonText.trim()) return
    try {
      JSON.parse(jsonText)
      setBlurError(null)
    } catch (e) {
      setBlurError(`JSON inválido: ${(e as Error).message}`)
    }
  }

  function handleValidate() {
    setImportError(null)
    const res = validateImportJson(jsonText)
    setResult(res)
  }

  async function handleImport() {
    if (!result?.valid) return
    setImporting(true)
    setImportError(null)
    try {
      if (tab === 'new') {
        const project = importNewProject(jsonText)
        importProject(project)
        onClose()
        navigate(`/project/${project.id}`)
      } else {
        if (!targetProject) return
        const updated = importUpdateProject(targetProject, jsonText, mergeMode)
        updateProject(targetProject.id, updated)
        onClose()
      }
    } catch (e) {
      setImportError((e as Error).message)
    } finally {
      setImporting(false)
    }
  }

  const canImport = result?.valid && !importing

  return (
    <Modal
      open
      title={t('import.title')}
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('actions.cancel')}</Button>
          <Button onClick={handleImport} disabled={!canImport}>
            {importing ? t('import.importing') : t('import.importBtn')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Tabs */}
        <div className="flex border-b" style={{ borderColor: 'var(--border-default)' }}>
          {(['new', 'update'] as Tab[]).map(t2 => (
            <button
              key={t2}
              onClick={() => setTab(t2)}
              disabled={t2 === 'update' && !projectId}
              className="px-4 py-2 text-[13px] font-[500] border-b-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                borderBottomColor: tab === t2 ? 'var(--oe-primary)' : 'transparent',
                color: tab === t2 ? 'var(--text-primary)' : 'var(--text-tertiary)',
                marginBottom: -1,
              }}
            >
              {t2 === 'new' ? t('import.tabNew') : t('import.tabUpdate')}
            </button>
          ))}
        </div>

        {/* Target project info (update tab) */}
        {tab === 'update' && targetProject && (
          <div
            className="px-3 py-2 rounded-[var(--radius-lg)] text-[12px]"
            style={{ background: 'var(--surface-subtle)', border: '1px solid var(--border-default)' }}
          >
            <span style={{ color: 'var(--text-tertiary)' }}>{t('import.targetProject')}: </span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{targetProject.name}</span>
          </div>
        )}

        {/* JSON Textarea */}
        <div>
          <textarea
            value={jsonText}
            onChange={e => setJsonText(e.target.value)}
            onBlur={handleBlur}
            placeholder={t('import.placeholder')}
            rows={9}
            className="w-full focus:outline-none resize-none"
            style={{
              fontFamily: 'monospace',
              fontSize: 12,
              padding: '10px 12px',
              border: `1px solid ${blurError ? 'var(--color-danger-text)' : 'var(--border-default)'}`,
              borderRadius: 'var(--radius-md)',
              background: 'var(--surface-page)',
              color: 'var(--text-primary)',
              lineHeight: 1.5,
            }}
            onFocus={e => { if (!blurError) e.currentTarget.style.borderColor = 'var(--oe-primary)' }}
          />
          {blurError && (
            <p className="mt-1 text-[11px]" style={{ color: 'var(--color-danger-text)' }}>{blurError}</p>
          )}
        </div>

        {/* Validate button */}
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleValidate}
            disabled={!jsonText.trim() || !!blurError}
          >
            {t('import.validate')}
          </Button>
          {result && !result.valid && (
            <span className="text-[12px]" style={{ color: 'var(--color-danger-text)' }}>
              {result.errors.length} {result.errors.length === 1 ? 'erro' : 'erros'} encontrado{result.errors.length !== 1 ? 's' : ''}
            </span>
          )}
          {result?.valid && (
            <span className="text-[12px]" style={{ color: 'var(--color-success-text)' }}>
              ✓ JSON válido
            </span>
          )}
        </div>

        {/* Validation errors */}
        {result && !result.valid && result.errors.length > 0 && (
          <div
            className="rounded-[var(--radius-lg)] p-3 space-y-1"
            style={{ background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-text)' }}
          >
            <p className="text-[11px] font-[600] uppercase tracking-wide mb-1" style={{ color: 'var(--color-danger-text)' }}>
              {t('import.errorTitle')}
            </p>
            {result.errors.map((err, i) => (
              <p key={i} className="text-[12px]" style={{ color: 'var(--color-danger-text)' }}>· {err}</p>
            ))}
          </div>
        )}

        {/* Preview */}
        {result?.valid && result.preview && (
          <div
            className="rounded-[var(--radius-lg)] p-3 space-y-2"
            style={{ background: 'var(--color-success-bg)', border: '1px solid var(--color-success-text)' }}
          >
            <p className="text-[11px] font-[600] uppercase tracking-wide" style={{ color: 'var(--color-success-text)' }}>
              {t('import.previewTitle')}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[14px] font-[600]" style={{ color: 'var(--text-primary)' }}>
                {result.preview.name}
              </span>
              {result.preview.client && (
                <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                  — {result.preview.client}
                </span>
              )}
            </div>
            <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
              {result.preview.phases} {t('template.phases')} · {result.preview.entries} {t('template.entries')} · {result.preview.risks} {t('risk.title').toLowerCase()} · {result.preview.teamMembers} {t('team.title').toLowerCase()}
            </p>
            <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
              Charter: {result.preview.hasCharter ? '✓' : '—'}
            </p>
            {tab === 'update' && targetProject && (
              <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                {t('import.targetProject')}: <strong>{targetProject.name}</strong>
              </p>
            )}
          </div>
        )}

        {/* Merge options (update tab only) */}
        {tab === 'update' && result?.valid && (
          <div className="space-y-2">
            <p className="text-[12px] font-[500] uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
              {t('import.mergeOptions')}
            </p>
            <label className="flex items-start gap-2.5 cursor-pointer group">
              <input
                type="radio"
                name="mergeMode"
                value="replace"
                checked={mergeMode === 'replace'}
                onChange={() => setMergeMode('replace')}
                className="mt-0.5 accent-[var(--oe-primary)]"
              />
              <div>
                <p className="text-[13px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                  {t('import.mergeReplace')}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-warning-text)' }}>
                  {t('import.mergeReplaceWarning')}
                </p>
              </div>
            </label>
            <label className="flex items-start gap-2.5 cursor-pointer group">
              <input
                type="radio"
                name="mergeMode"
                value="merge"
                checked={mergeMode === 'merge'}
                onChange={() => setMergeMode('merge')}
                className="mt-0.5 accent-[var(--oe-primary)]"
              />
              <div>
                <p className="text-[13px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                  {t('import.mergePatch')}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                  {t('import.mergePatchDesc')}
                </p>
              </div>
            </label>
          </div>
        )}

        {/* Import error */}
        {importError && (
          <div
            className="rounded-[var(--radius-lg)] p-3"
            style={{ background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-text)' }}
          >
            <p className="text-[12px]" style={{ color: 'var(--color-danger-text)' }}>
              {importError}
            </p>
          </div>
        )}
      </div>
    </Modal>
  )
}
