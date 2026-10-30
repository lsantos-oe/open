import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/useAppStore'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { localTodayISO, openTasksOfIncident, openTasksOfProject } from '@/utils/closeOut'
import type { Entry } from '@/types'

function fmtDate(iso: string | undefined, dateFormat: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.substring(0, 10).split('-')
  return dateFormat === 'MM/DD/YYYY' ? `${m}/${d}/${y}` : `${d}/${m}/${y}`
}

function ownerNames(entry: Entry): string {
  const names = (entry.owners ?? []).filter((o) => o.kind !== 'validator').map((o) => o.name)
  if (names.length > 0) return names.join(', ')
  return entry.responsible || '—'
}

/** Aparece quando um projeto vai para Concluído ou um incidente para Resolvido/Fechado e ainda há tarefas abertas:
 *  pergunta se elas também devem ser concluídas, deixa escolher quais e aplica Fim real = hoje. Fica no Layout. */
export function CloseOutModal() {
  const { t } = useTranslation()
  const { closeOutQueue, projects, incidents, settings, dismissCloseOut, completeTasks } = useAppStore()
  const target = closeOutQueue[0]

  const info = useMemo(() => {
    if (!target) return null
    if (target.kind === 'project') {
      const p = projects.find((x) => x.id === target.id)
      return p ? { name: p.name, tasks: openTasksOfProject(p), doneLabel: t('status.done') } : null
    }
    const i = incidents.find((x) => x.id === target.id)
    return i ? { name: i.title, tasks: openTasksOfIncident(i), doneLabel: t(`incident.status_${i.status}`) } : null
  }, [target, projects, incidents, t])

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const targetKey = target ? `${target.kind}:${target.id}` : ''

  // Item da fila mudou (ou abriu): começa com todas marcadas.
  useEffect(() => {
    setSelected(new Set(info?.tasks.map((x) => x.id) ?? []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey])

  // O projeto/incidente sumiu (excluído) ou já não tem tarefas abertas: nada a perguntar.
  useEffect(() => {
    if (target && (!info || info.tasks.length === 0)) dismissCloseOut()
  }, [target, info, dismissCloseOut])

  if (!target || !info || info.tasks.length === 0) return null

  const tasks = info.tasks
  const allSelected = tasks.every((x) => selected.has(x.id))
  const today = localTodayISO()
  const kindLabel = target.kind === 'project' ? 'projeto' : 'incidente'
  const movedTo = target.kind === 'project' ? 'Concluído' : info.doneLabel

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function confirm() {
    completeTasks(target!, tasks.filter((x) => selected.has(x.id)).map((x) => x.id))
  }

  const th = { padding: '8px 10px', fontSize: 11, fontWeight: 600, textAlign: 'left' as const, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }
  const td = { padding: '9px 10px', fontSize: 13, color: 'var(--text-secondary)', verticalAlign: 'top' as const }

  return (
    <Modal
      open
      size="xl"
      title={`Concluir também as tarefas do ${kindLabel}?`}
      onClose={dismissCloseOut}
      footer={
        <>
          <span className="mr-auto text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Data de fim aplicada: hoje, {fmtDate(today, settings.dateFormat)}
            {closeOutQueue.length > 1 ? ` · mais ${closeOutQueue.length - 1} na fila` : ''}
          </span>
          <Button variant="secondary" onClick={dismissCloseOut}>Agora não</Button>
          <Button onClick={confirm} disabled={selected.size === 0}>
            {selected.size === 0 ? 'Concluir tarefas' : `Concluir ${selected.size} ${selected.size === 1 ? 'tarefa' : 'tarefas'}`}
          </Button>
        </>
      }
    >
      <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
        O {kindLabel} <strong style={{ color: 'var(--text-primary)' }}>{info.name}</strong> foi movido para <strong>{movedTo}</strong> e ainda tem{' '}
        {tasks.length} {tasks.length === 1 ? 'tarefa aberta' : 'tarefas abertas'}. Escolha quais concluir agora.
      </p>
      <div className="rounded-[var(--radius-lg)] border overflow-auto" style={{ borderColor: 'var(--border-default)', maxHeight: '50vh' }}>
        <table className="w-full" style={{ borderCollapse: 'collapse' }}>
          <thead style={{ background: 'var(--surface-subtle)', position: 'sticky', top: 0 }}>
            <tr>
              <th style={{ ...th, width: 36 }}>
                <input
                  type="checkbox"
                  aria-label="Selecionar todas as tarefas"
                  className="rounded border-[var(--border-default)] accent-[var(--text-primary)]"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(tasks.map((x) => x.id)))}
                />
              </th>
              <th style={th}>Título</th>
              <th style={th}>Início</th>
              <th style={th}>Fim previsto</th>
              <th style={th}>Responsável</th>
              <th style={th}>Status atual</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr
                key={task.id}
                onClick={() => toggle(task.id)}
                className="cursor-pointer"
                style={{ borderTop: '1px solid var(--border-default)', background: selected.has(task.id) ? 'var(--oe-primary-light)' : undefined }}
              >
                <td style={td} onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label={`Concluir ${task.name}`}
                    className="rounded border-[var(--border-default)] accent-[var(--text-primary)]"
                    checked={selected.has(task.id)}
                    onChange={() => toggle(task.id)}
                  />
                </td>
                <td style={{ ...td, color: 'var(--text-primary)', fontWeight: 500 }}>{task.name}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDate(task.plannedStart, settings.dateFormat)}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDate(task.plannedEnd, settings.dateFormat)}</td>
                <td style={td}>{ownerNames(task)}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{t(`entry.${task.status}` as any)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}
