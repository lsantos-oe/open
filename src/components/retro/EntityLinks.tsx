import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/useAppStore'
import { RetroLinkRef, RetroLinkType } from '@/types/retro'
import { MultiSelect } from '@/components/ui/MultiSelect'

const refKey = (r: RetroLinkRef) => `${r.type}:${r.id}`
const parseKey = (k: string): RetroLinkRef => {
  const i = k.indexOf(':')
  return { type: k.slice(0, i) as RetroLinkType, id: k.slice(i + 1) }
}

const ROUTE: Record<RetroLinkType, (id: string) => string> = {
  project: (id) => `/projects/${id}`,
  incident: (id) => `/support/${id}`,
  client: (id) => `/wallet/${id}`,
}

const TYPE_STYLE: Record<RetroLinkType, { background: string; color: string }> = {
  project: { background: 'var(--color-info-bg)', color: 'var(--color-info-text)' },
  incident: { background: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' },
  client: { background: 'var(--surface-subtle)', color: 'var(--text-secondary)' },
}

/** Nome de uma entidade já carregada no Open; undefined se ela não está na memória (ex.: arquivada). */
function useEntityName() {
  const { projects, incidents, clients } = useAppStore()
  return useMemo(() => {
    const names = new Map<string, string>()
    projects.forEach((p) => names.set(`project:${p.id}`, p.name))
    incidents.forEach((i) => names.set(`incident:${i.id}`, i.title))
    clients.forEach((c) => names.set(`client:${c.id}`, c.name))
    return (r: RetroLinkRef) => names.get(refKey(r))
  }, [projects, incidents, clients])
}

/** Seletor de projetos, incidentes e clientes (qualquer combinação). */
export function EntityLinksPicker({ value, onChange }: { value: RetroLinkRef[]; onChange: (next: RetroLinkRef[]) => void }) {
  const { t } = useTranslation()
  const { projects, incidents, clients } = useAppStore()

  const options = useMemo(() => [
    ...clients.filter((c) => !c.archived).map((c) => ({ id: `client:${c.id}`, label: c.name, sublabel: t('retro.linkType_client') })),
    ...projects.filter((p) => !p.archived && !p.hidden).map((p) => ({ id: `project:${p.id}`, label: p.name, sublabel: t('retro.linkType_project') })),
    ...incidents.map((i) => ({ id: `incident:${i.id}`, label: i.title, sublabel: t('retro.linkType_incident') })),
  ], [projects, incidents, clients, t])

  return (
    <MultiSelect
      values={value.map(refKey)}
      onChange={(keys) => onChange(keys.map(parseKey))}
      options={options}
      placeholder={t('retro.linksPlaceholder')}
      className="flex items-center justify-between gap-2 w-full border border-[var(--border-default)] bg-[var(--surface-input)] px-2.5 py-1.5 text-[12px] text-left focus:border-[var(--oe-primary)] focus:outline-none transition-colors"
    />
  )
}

/** Chips clicáveis dos vínculos de um card. */
export function EntityLinkChips({ links }: { links: RetroLinkRef[] }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const nameOf = useEntityName()
  if (links.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {links.map((l) => (
        <button
          key={refKey(l)}
          type="button"
          onClick={() => navigate(ROUTE[l.type](l.id))}
          title={t(`retro.linkType_${l.type}`)}
          className="text-[10.5px] px-1.5 py-[1px] max-w-full truncate hover:opacity-80"
          style={{ ...TYPE_STYLE[l.type], borderRadius: 'var(--radius-pill)' }}
        >
          {t(`retro.linkType_${l.type}`)} · {nameOf(l) ?? '—'}
        </button>
      ))}
    </div>
  )
}
