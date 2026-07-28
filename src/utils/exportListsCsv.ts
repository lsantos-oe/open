import { Client, Incident } from '@/types'
import { findCountry } from '@/data/countries'

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

function cell(v: string | number | undefined | null): string {
  const s = String(v ?? '')
  return `"${s.replace(/"/g, '""')}"`
}

function triggerCsvDownload(rows: string[][], filename: string): void {
  const csv = '﻿' + rows.map((r) => r.join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const CLIENT_STATUS_LABEL: Record<string, string> = {
  pre_venda: 'Pré-venda',
  implantacao: 'Implantação',
  sustentacao_novos_projetos: 'Sustentação / Novos projetos',
}

export function exportClientsCsv(clients: Client[], projectCount: (clientId: string) => number): void {
  const header = ['Nome', 'País', 'Status', 'Owner', 'CS atual', 'Projetos', 'Criado em']
  const rows = clients.map((c) => {
    const currentCs = [...c.csHistory].sort((a, b) => b.assignedAt.localeCompare(a.assignedAt))[0]?.owner.name ?? ''
    return [
      cell(c.name),
      cell(findCountry(c.country)?.name ?? ''),
      cell(CLIENT_STATUS_LABEL[c.status] ?? c.status),
      cell(c.owners.map((o) => o.name).join('; ')),
      cell(currentCs),
      cell(projectCount(c.id)),
      cell(c.createdAt.slice(0, 10)),
    ]
  })
  triggerCsvDownload([header, ...rows], `carteira-${todayISO()}.csv`)
}

const INCIDENT_STATUS_LABEL: Record<string, string> = {
  open: 'Aberto',
  in_progress: 'Em andamento',
  waiting_on_client: 'Aguardando cliente',
  resolved: 'Resolvido',
  closed: 'Fechado',
}

const PRIORITY_LABEL: Record<string, string> = { low: 'Baixa', medium: 'Média', high: 'Alta' }

export function exportIncidentsCsv(incidents: Incident[], clients: Client[]): void {
  const header = ['Título', 'Clientes', 'Status', 'Prioridade', 'Impacto', 'Responsável', 'Prazo', 'Criado em']
  const rows = incidents.map((i) => [
    cell(i.title),
    cell(i.clientIds.map((id) => clients.find((c) => c.id === id)?.name).filter(Boolean).join('; ')),
    cell(INCIDENT_STATUS_LABEL[i.status] ?? i.status),
    cell(PRIORITY_LABEL[i.priority] ?? i.priority),
    cell(PRIORITY_LABEL[i.impact] ?? i.impact),
    cell(i.owner?.name ?? ''),
    cell(i.deadline ?? ''),
    cell(i.createdAt.slice(0, 10)),
  ])
  triggerCsvDownload([header, ...rows], `sustentacao-${todayISO()}.csv`)
}
