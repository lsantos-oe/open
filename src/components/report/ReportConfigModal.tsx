import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { ReportConfig, DEFAULT_REPORT_CONFIG } from '@/utils/statusReport'

interface Props {
  projectId: string
  onGenerate: (config: ReportConfig) => void
  onGenerateLink: (config: ReportConfig) => void
  onClose: () => void
}

function loadConfig(projectId: string): ReportConfig {
  try {
    const raw = localStorage.getItem(`reportConfig_${projectId}`)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ReportConfig>
      return {
        ...DEFAULT_REPORT_CONFIG,
        ...parsed,
        sections: { ...DEFAULT_REPORT_CONFIG.sections, ...(parsed.sections ?? {}) },
        planColumns: { ...DEFAULT_REPORT_CONFIG.planColumns, ...(parsed.planColumns ?? {}) },
      }
    }
  } catch {}
  return structuredClone(DEFAULT_REPORT_CONFIG)
}

function saveConfig(projectId: string, config: ReportConfig) {
  localStorage.setItem(`reportConfig_${projectId}`, JSON.stringify(config))
}

export default function ReportConfigModal({ projectId, onGenerate, onGenerateLink, onClose }: Props) {
  const { t } = useTranslation()
  const [config, setConfig] = useState<ReportConfig>(() => loadConfig(projectId))

  function toggleSection(key: keyof ReportConfig['sections']) {
    setConfig(prev => ({
      ...prev,
      sections: { ...prev.sections, [key]: !prev.sections[key] },
    }))
  }

  function toggleColumn(key: keyof ReportConfig['planColumns']) {
    setConfig(prev => ({
      ...prev,
      planColumns: { ...prev.planColumns, [key]: !prev.planColumns[key] },
    }))
  }

  function handleGenerate() {
    saveConfig(projectId, config)
    onGenerate(config)
  }

  function handleGenerateLink() {
    saveConfig(projectId, config)
    onGenerateLink(config)
  }

  const sections: { key: keyof ReportConfig['sections']; label: string }[] = [
    { key: 'summary', label: t('report.secSummary') },
    { key: 'team', label: t('report.secTeam') },
    { key: 'charter', label: t('report.secCharter') },
    { key: 'milestones', label: t('report.secMilestones') },
    { key: 'plan', label: t('report.secPlan') },
    { key: 'delayLog', label: t('report.secDelayLog') },
    { key: 'risks', label: t('report.secRisks') },
  ]

  const planColumns: { key: keyof ReportConfig['planColumns']; label: string }[] = [
    { key: 'type', label: t('report.type') },
    { key: 'responsible', label: t('report.responsible') },
    { key: 'deps', label: t('report.colDeps') },
    { key: 'plannedStart', label: t('report.colPlannedStart') },
    { key: 'plannedEnd', label: t('report.colPlannedEnd') },
    { key: 'baselineStart', label: t('report.colBaselineStart') },
    { key: 'baselineEnd', label: t('report.colBaselineEnd') },
    { key: 'variance', label: t('report.variance') },
    { key: 'duration', label: t('report.duration') },
    { key: 'status', label: t('report.status') },
  ]

  return (
    <Modal
      open
      title={t('report.configTitle')}
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('actions.cancel')}</Button>
          <Button variant="secondary" onClick={handleGenerateLink}>{t('report.generateLinkBtn')}</Button>
          <Button onClick={handleGenerate}>{t('report.generatePdf')}</Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="text-[12px] font-[500] text-[var(--text-tertiary)] uppercase tracking-wide mb-2.5">
            {t('report.layout')}
          </p>
          <div className="flex gap-4">
            {(['standard', 'ploomes'] as const).map((layout) => (
              <label key={layout} className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="radio"
                  name="layout"
                  value={layout}
                  checked={config.layout === layout}
                  onChange={() => setConfig(prev => ({ ...prev, layout }))}
                  className="w-3.5 h-3.5 accent-[var(--oe-primary)]"
                />
                <span className="text-[13px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                  {t(`report.layout_${layout}`)}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[12px] font-[500] text-[var(--text-tertiary)] uppercase tracking-wide mb-2.5">
            {t('report.sections')}
          </p>
          <div className="space-y-1.5">
            {sections.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={config.sections[key]}
                  onChange={() => toggleSection(key)}
                  className="w-3.5 h-3.5 rounded accent-[var(--oe-primary)]"
                />
                <span className="text-[13px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                  {label}
                </span>
              </label>
            ))}
          </div>
        </div>

        {config.sections.plan && (
          <div>
            <p className="text-[12px] font-[500] text-[var(--text-tertiary)] uppercase tracking-wide mb-2.5">
              {t('report.planColumns')}
            </p>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2.5 cursor-not-allowed opacity-60">
                <input type="checkbox" checked disabled className="w-3.5 h-3.5 rounded" />
                <span className="text-[13px] text-[var(--text-secondary)]">{t('report.name')}</span>
              </label>
              {planColumns.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={config.planColumns[key]}
                    onChange={() => toggleColumn(key)}
                    className="w-3.5 h-3.5 rounded accent-[var(--oe-primary)]"
                  />
                  <span className="text-[13px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
