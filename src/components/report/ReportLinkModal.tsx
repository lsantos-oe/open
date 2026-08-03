import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Field } from '@/components/ui/Input'
import { useAppStore } from '@/store/useAppStore'
import { Project, AppSettings, ReportLink } from '@/types'
import { buildStatusReportHtml, ReportConfig } from '@/utils/statusReport'

interface Props {
  project: Project
  settings: AppSettings
  config: ReportConfig
  onClose: () => void
}

function defaultLabel(): string {
  return `Status Report — ${new Date().toLocaleDateString('pt-BR')}`
}

function fmtGeneratedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

export default function ReportLinkModal({ project, settings, config, onClose }: Props) {
  const { t } = useTranslation()
  const generateReportLink = useAppStore((s) => s.generateReportLink)
  const existing = project.reportLinks
  const atLimit = existing.length >= 3

  const [target, setTarget] = useState<'new' | string>(atLimit ? (existing[0]?.id ?? 'new') : 'new')
  const [label, setLabel] = useState(() =>
    target === 'new' ? defaultLabel() : (existing.find((l) => l.id === target)?.label ?? defaultLabel()),
  )
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ReportLink | null>(null)
  const [copied, setCopied] = useState(false)

  function selectTarget(next: 'new' | string) {
    setTarget(next)
    setLabel(next === 'new' ? defaultLabel() : (existing.find((l) => l.id === next)?.label ?? defaultLabel()))
  }

  async function handleGenerate() {
    setGenerating(true)
    setError(null)
    try {
      const html = buildStatusReportHtml(project, settings, config)
      const overwriteId = target === 'new' ? undefined : target
      await generateReportLink(project.id, html, label.trim() || defaultLabel(), overwriteId)
      const updated = useAppStore.getState().projects.find((p) => p.id === project.id)?.reportLinks ?? []
      const link = overwriteId ? updated.find((l) => l.id === overwriteId) : updated[updated.length - 1]
      if (link) setResult(link)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGenerating(false)
    }
  }

  async function handleCopy() {
    if (!result?.url) return
    await navigator.clipboard.writeText(result.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (result) {
    return (
      <Modal
        open
        title={t('report.linkGenerated')}
        onClose={onClose}
        size="sm"
        footer={<Button onClick={onClose}>{t('report.linkDone')}</Button>}
      >
        <div className="space-y-3">
          <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>{result.label}</p>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={result.url ?? ''}
              onFocus={(e) => e.currentTarget.select()}
              className="text-[12px]"
            />
            <Button variant="secondary" onClick={handleCopy}>
              {copied ? t('report.linkCopied') : t('report.linkCopy')}
            </Button>
          </div>
          <a
            href={result.url}
            target="_blank"
            rel="noreferrer"
            className="text-[12px] underline inline-block"
            style={{ color: 'var(--oe-primary)' }}
          >
            {t('report.linkOpen')} ↗
          </a>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open
      title={t('report.linkModalTitle')}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('actions.cancel')}</Button>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? t('report.generating') : t('report.generateLinkBtn')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {existing.length > 0 && (
          <div>
            <p className="text-[12px] font-[500] text-[var(--text-tertiary)] uppercase tracking-wide mb-2.5">
              {t('report.linkChooseTarget')}
            </p>
            <div className="space-y-1.5">
              {!atLimit && (
                <label className="flex items-center gap-2.5 cursor-pointer group">
                  <input
                    type="radio"
                    name="target"
                    checked={target === 'new'}
                    onChange={() => selectTarget('new')}
                    className="w-3.5 h-3.5 accent-[var(--oe-primary)]"
                  />
                  <span className="text-[13px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                    {t('report.linkNew')}
                  </span>
                </label>
              )}
              {existing.map((l) => (
                <label key={l.id} className="flex items-center gap-2.5 cursor-pointer group">
                  <input
                    type="radio"
                    name="target"
                    checked={target === l.id}
                    onChange={() => selectTarget(l.id)}
                    className="w-3.5 h-3.5 accent-[var(--oe-primary)]"
                  />
                  <span className="text-[13px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                    {t('report.linkOverwrite')}: {l.label}{' '}
                    <span style={{ color: 'var(--text-tertiary)' }}>({fmtGeneratedAt(l.generatedAt)})</span>
                  </span>
                </label>
              ))}
            </div>
            {atLimit && (
              <p className="text-[12px] mt-2" style={{ color: 'var(--text-tertiary)' }}>
                {t('report.linkLimitReached')}
              </p>
            )}
          </div>
        )}

        <Field label={t('report.linkLabel')}>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={defaultLabel()} />
        </Field>

        {error && <p className="text-[12px]" style={{ color: 'var(--color-danger-text)' }}>{error}</p>}
      </div>
    </Modal>
  )
}
