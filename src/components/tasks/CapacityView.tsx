import { useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Avatar } from '@/components/ui/Chip'
import { Badge } from '@/components/ui/Badge'
import { buildCapacity, CapTask, DEFAULT_LIMIT, LoadLevel, PersonCapacity } from '@/utils/capacity'

interface Props {
  tasks: CapTask[]
  today: string
  /** Abre a tabela de tarefas já filtrada nesta pessoa. */
  onSeePerson: (key: string) => void
}

const LIMIT_KEY = 'pb-capacity-limit'
const LIMITS_KEY = 'pb-capacity-limits'

const CELL: Record<LoadLevel, { bg: string; fg: string }> = {
  none: { bg: 'transparent', fg: 'var(--text-disabled)' },
  free: { bg: 'var(--badge-gray-bg)', fg: 'var(--text-secondary)' },
  ok: { bg: 'var(--badge-green-bg)', fg: 'var(--color-success-text)' },
  high: { bg: 'var(--badge-amber-bg)', fg: 'var(--color-warning-text)' },
  over: { bg: 'var(--badge-red-bg)', fg: 'var(--color-danger-text)' },
}

const STATUS_BAR: { key: keyof PersonCapacity['byStatus']; label: string; color: string }[] = [
  { key: 'in_progress', label: 'Em andamento', color: 'var(--color-info-text)' },
  { key: 'validation', label: 'Em validação', color: 'var(--color-violet-text)' },
  { key: 'todo', label: 'A fazer', color: 'var(--text-tertiary)' },
  { key: 'pending', label: 'Backlog', color: 'var(--border-strong)' },
  { key: 'blocked', label: 'Bloqueada', color: 'var(--color-danger-text)' },
]

const TONE: Record<'bad' | 'warn' | 'good', string> = {
  bad: 'var(--color-danger-text)', warn: 'var(--color-warning-text)', good: 'var(--color-success-text)',
}

function Kpi({ label, value, sub, tone }: { label: string; value: number | string; sub?: string; tone?: 'bad' | 'warn' }) {
  return (
    <div className="oe-card px-4 py-3 min-w-0">
      <p className="text-[13px] truncate" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
      <p className="text-[26px] leading-tight font-semibold" style={{ color: tone ? TONE[tone] : 'var(--text-primary)' }}>{value}</p>
      {sub && <p className="text-[11.5px] truncate" style={{ color: 'var(--text-tertiary)' }}>{sub}</p>}
    </div>
  )
}

function StatusMix({ p }: { p: PersonCapacity }) {
  const total = p.active || 1
  const title = STATUS_BAR.filter((s) => p.byStatus[s.key] > 0).map((s) => `${s.label}: ${p.byStatus[s.key]}`).join(' · ')
  return (
    <div className="flex h-1.5 w-24 rounded-full overflow-hidden gap-px" title={title} role="img" aria-label={title || 'Sem tarefas'}>
      {STATUS_BAR.map((s) => p.byStatus[s.key] > 0 && <span key={s.key} style={{ width: `${(p.byStatus[s.key] / total) * 100}%`, background: s.color }} />)}
    </div>
  )
}

const num = (n: number, tone?: 'bad' | 'warn') => (
  <span className="tabular-nums" style={{ color: n === 0 ? 'var(--text-disabled)' : tone ? TONE[tone] : 'var(--text-primary)', fontWeight: n && tone ? 600 : 400 }}>{n === 0 ? '·' : n}</span>
)

/** Visão de capacidade: quanto cada pessoa carrega, semana a semana, contra um limite de tarefas simultâneas. */
export function CapacityView({ tasks, today, onSeePerson }: Props) {
  const [limit, setLimit] = useState<number>(() => {
    try { const v = Number(localStorage.getItem(LIMIT_KEY)); return v >= 1 && v <= 50 ? v : DEFAULT_LIMIT } catch { return DEFAULT_LIMIT }
  })
  useEffect(() => { try { localStorage.setItem(LIMIT_KEY, String(limit)) } catch { /* sem armazenamento */ } }, [limit])

  // Limite individual: quem tem um número próprio usa o dele; os demais seguem o padrão do time.
  const [limits, setLimits] = useState<Record<string, number>>(() => {
    try { const v = JSON.parse(localStorage.getItem(LIMITS_KEY) ?? '{}'); return v && typeof v === 'object' ? v : {} } catch { return {} }
  })
  useEffect(() => { try { localStorage.setItem(LIMITS_KEY, JSON.stringify(limits)) } catch { /* sem armazenamento */ } }, [limits])
  const setPersonLimit = (key: string, v: number) => setLimits((cur) => {
    const next = { ...cur }
    if (!v || v === limit) delete next[key]; else next[key] = v
    return next
  })

  const cap = useMemo(() => buildCapacity(tasks, { today, limit, limits }), [tasks, today, limit, limits])
  const { totals, people, unassigned, weekStarts, insights } = cap

  if (totals.active === 0) {
    return <p className="text-sm py-10 text-center" style={{ color: 'var(--text-tertiary)' }}>Nenhuma tarefa ativa nos filtros atuais.</p>
  }

  const th = 'px-3 py-2 text-[13px] font-medium text-left whitespace-nowrap'
  const weekLabel = (iso: string, i: number) => (i === 0 ? 'Esta sem.' : format(parseISO(iso), 'dd/MM'))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi label="Tarefas ativas" value={totals.active} sub={`${people.length} ${people.length === 1 ? 'pessoa' : 'pessoas'}`} />
        <Kpi label="Atrasadas" value={totals.overdue} tone={totals.overdue ? 'bad' : undefined} sub={totals.active ? `${Math.round((totals.overdue / totals.active) * 100)}% das ativas` : undefined} />
        <Kpi label="Vencem esta semana" value={totals.dueThisWeek} />
        <Kpi label="Sem prazo" value={totals.noDate} tone={totals.noDate ? 'warn' : undefined} sub="não entram no gráfico" />
        <Kpi label="Bloqueadas" value={totals.blocked} tone={totals.blocked ? 'warn' : undefined} />
        <Kpi label="Sem responsável" value={unassigned.active} tone={unassigned.active ? 'warn' : undefined} />
      </div>

      {insights.length > 0 && (
        <ul className="oe-card px-4 py-3 space-y-1.5" aria-label="O que merece atenção">
          {insights.map((i, k) => (
            <li key={k} className="flex items-start gap-2 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
              <span className="mt-1.5 shrink-0 rounded-full" style={{ width: 6, height: 6, background: TONE[i.tone] }} />
              {i.text}
            </li>
          ))}
        </ul>
      )}

      <div className="oe-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3 pb-1">
          <div>
            <h3 className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>Carga por pessoa</h3>
            <p className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>Tarefas em curso em cada semana (as atrasadas contam na semana atual). Só entram usuários do Open; marcos e reuniões ficam de fora.</p>
          </div>
          <label className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
            Limite padrão
            <input
              type="number" min={1} max={50} value={limit}
              onChange={(e) => { const v = Math.round(Number(e.target.value)); if (v >= 1 && v <= 50) setLimit(v) }}
              aria-label="Limite de tarefas simultâneas por pessoa"
              className="w-16 h-8 text-center text-[13px] rounded-[var(--radius-md)] outline-none border border-transparent focus:border-[var(--text-tertiary)]"
              style={{ background: 'var(--surface-subtle)', color: 'var(--text-primary)' }}
            />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ color: 'var(--text-tertiary)' }}>
                <th className={th}>Pessoa</th>
                <th className={th}>Ativas</th>
                <th className={`${th} text-right`}>Atrasadas</th>
                <th className={`${th} text-right`}>Esta semana</th>
                <th className={`${th} text-right`}>Sem prazo</th>
                <th className={`${th} text-right`} title="Tarefas em validação que a pessoa precisa validar">A validar</th>
                <th className={`${th} text-center`} title="Tarefas simultâneas que a pessoa aguenta. Edite para ajustar só para ela.">Limite</th>
                {weekStarts.map((w, i) => <th key={w} className={`${th} text-center`}>{weekLabel(w, i)}</th>)}
                <th className={th} />
              </tr>
            </thead>
            <tbody className="divide-y">
              {people.map((p) => (
                <tr key={p.key} className="group hover:bg-[var(--surface-subtle)] transition-colors">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-[150px]">
                      <Avatar name={p.name} size={26} />
                      <span className="font-medium truncate" style={{ color: 'var(--text-primary)', maxWidth: 170 }} title={p.name}>{p.name}</span>
                      {p.overWeeks.length > 0 && <Badge variant="red" size="sm">Acima do limite</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5"><span className="tabular-nums w-5 text-right">{p.active}</span><StatusMix p={p} /></div>
                  </td>
                  <td className="px-3 py-2.5 text-right">{num(p.overdue, 'bad')}</td>
                  <td className="px-3 py-2.5 text-right">{num(p.dueThisWeek)}</td>
                  <td className="px-3 py-2.5 text-right">{num(p.noDate, 'warn')}</td>
                  <td className="px-3 py-2.5 text-right">{num(p.toValidate)}</td>
                  <td className="px-1 py-2 text-center">
                    <input
                      type="number" min={1} max={50} value={p.limit}
                      onChange={(e) => { const v = Math.round(Number(e.target.value)); if (v >= 1 && v <= 50) setPersonLimit(p.key, v) }}
                      aria-label={`Limite de ${p.name}`}
                      title={limits[p.key] ? 'Limite só desta pessoa (o padrão do time é ' + limit + ')' : 'Segue o limite padrão do time'}
                      className="w-12 h-7 text-center text-[13px] rounded-full outline-none border border-transparent focus:border-[var(--text-tertiary)]"
                      style={{ background: limits[p.key] ? 'var(--badge-gray-bg)' : 'var(--surface-subtle)', color: 'var(--text-primary)', fontWeight: limits[p.key] ? 600 : 400 }}
                    />
                  </td>
                  {p.weeks.map((c, i) => {
                    const lvl = c > p.limit ? 'over' : c / p.limit > 0.75 ? 'high' : c / p.limit > 0.5 ? 'ok' : c > 0 ? 'free' : 'none'
                    return (
                      <td key={i} className="px-1 py-2 text-center">
                        <span
                          className="inline-flex items-center justify-center tabular-nums text-[13px] font-medium"
                          style={{ width: 40, height: 28, borderRadius: 'var(--radius-md)', background: CELL[lvl].bg, color: CELL[lvl].fg }}
                          title={c ? `${c} ${c === 1 ? 'tarefa' : 'tarefas'} em curso (limite ${p.limit})` : 'Nada em curso'}
                        >
                          {c || '·'}
                        </span>
                      </td>
                    )
                  })}
                  <td className="px-3 py-2.5 text-right">
                    <button onClick={() => onSeePerson(p.key)} className="text-[13px] opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                      Ver tarefas →
                    </button>
                  </td>
                </tr>
              ))}
              {unassigned.active > 0 && (
                <tr>
                  <td className="px-3 py-2.5" colSpan={2}><span style={{ color: 'var(--text-tertiary)' }}>Sem responsável do time — {unassigned.active} {unassigned.active === 1 ? 'tarefa' : 'tarefas'}</span></td>
                  <td className="px-3 py-2.5 text-right">{num(unassigned.overdue, 'bad')}</td>
                  <td colSpan={10 + weekStarts.length - 3} />
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 text-[11.5px]" style={{ color: 'var(--text-tertiary)' }}>
          <span>Semana:</span>
          {([['free', 'até 50% do limite'], ['ok', 'até 75%'], ['high', 'até 100%'], ['over', 'acima do limite']] as const).map(([lvl, txt]) => (
            <span key={lvl} className="inline-flex items-center gap-1.5">
              <span style={{ width: 14, height: 14, borderRadius: 5, background: CELL[lvl].bg, boxShadow: lvl === 'free' ? 'inset 0 0 0 1px var(--border-default)' : undefined }} />{txt}
            </span>
          ))}
          <span className="ml-auto flex flex-wrap gap-x-3">
            {STATUS_BAR.map((s) => <span key={s.key} className="inline-flex items-center gap-1.5"><span style={{ width: 8, height: 8, borderRadius: 4, background: s.color }} />{s.label}</span>)}
          </span>
        </div>
      </div>
    </div>
  )
}
