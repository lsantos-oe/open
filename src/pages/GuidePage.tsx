import { useState, ReactNode } from 'react'
import { CollapsibleSection } from '@/components/ui/CollapsibleSection'
import { AnchorNav } from '@/components/ui/AnchorNav'
import {
  WalletIcon, PortfolioIcon, FolderIcon, SupportIcon, TasksIcon, GearIcon, UsersGroupIcon, GuideIcon,
} from '@/components/ui/icons'

interface Section {
  id: string
  title: string
  summary: string
  icon: ReactNode
  content: ReactNode
}

const SECTIONS: Section[] = [
  {
    id: 'wallet',
    title: 'Carteira (clientes)',
    summary: 'Base de clientes: contatos, país e histórico de CS.',
    icon: <WalletIcon className="w-5 h-5" />,
    content: (
      <>
        <p>É a base de clientes da empresa — nome, país, link do card no Ploomes, contatos e histórico de troca de CS.</p>
        <p>É daqui que vêm os clientes disponíveis ao criar um projeto ou um incidente — não existe mais texto livre de cliente.</p>
      </>
    ),
  },
  {
    id: 'portfolio',
    title: 'Portfólio (projetos)',
    summary: 'Lista de projetos em lista ou kanban, com edição em massa.',
    icon: <PortfolioIcon className="w-5 h-5" />,
    content: (
      <>
        <p>Lista todos os projetos, em visão de <strong>lista</strong> ou <strong>kanban</strong> (alternando no topo).</p>
        <p>O botão <strong>Meus</strong> filtra para mostrar só os projetos onde você está no time vinculado (não conta PM/Dev Lead em texto livre).</p>
        <p>Marque as caixinhas de seleção nas linhas/cards pra abrir uma barra de <strong>edição em massa</strong> (arquivar, trocar PM, trocar cliente, trocar status de vários projetos de uma vez).</p>
        <p>Projetos arquivados ficam ocultos da lista principal — acesse pelo link "mostrar arquivados" embaixo da lista, ou vá em Configurações pra excluir de vez (isso só oculta, os dados continuam no banco).</p>
      </>
    ),
  },
  {
    id: 'project',
    title: 'Página de um projeto',
    summary: 'Overview, Plano, Kanban e Diário — e qual aba abre primeiro.',
    icon: <FolderIcon className="w-5 h-5" />,
    content: (
      <>
        <p>A aba <strong>Overview</strong> concentra: botões de acesso rápido à Proposta e ao Negócio no Ploomes, notas do projeto, links externos, o Charter (sponsor, orçamento, escopo, critérios de sucesso) e os metadados básicos.</p>
        <p>Você pode escolher qual aba abre primeiro ao entrar num projeto — Overview, Plano, Kanban ou Diário — em Configurações → Preferências pessoais. Essa preferência fica só neste navegador.</p>
      </>
    ),
  },
  {
    id: 'support',
    title: 'Sustentação (incidentes)',
    summary: 'Chamados com prioridade, prazo e responsável.',
    icon: <SupportIcon className="w-5 h-5" />,
    content: (
      <>
        <p>Gestão de chamados/incidentes ligados a um ou mais clientes, com prioridade, impacto, prazo e responsável.</p>
        <p>Ao criar um incidente, cliente e responsável já são pedidos no formulário — não dá mais pra criar um incidente "solto".</p>
        <p>Cada incidente tem suas próprias tarefas, pontos em aberto e histórico — igual ao Diário de um projeto.</p>
        <p>Também dá pra selecionar vários incidentes e aplicar ações em massa (status, prioridade, responsável, vincular cliente), e usar o filtro <strong>Meus</strong> pra ver só os que você é owner ou stakeholder.</p>
      </>
    ),
  },
  {
    id: 'tasks',
    title: 'Tarefas',
    summary: 'Visão cruzada de tarefas de projetos e incidentes.',
    icon: <TasksIcon className="w-5 h-5" />,
    content: (
      <>
        <p>Visão cruzada de todas as tarefas — de projetos, de incidentes, ou soltas (sem projeto/incidente vinculado) — em <strong>kanban</strong> ou <strong>tabela</strong>.</p>
        <p>Uma tarefa solta usa o mesmo modal de criação/edição das demais — o campo de projeto simplesmente aceita "Nenhum".</p>
        <p>Seleção em massa permite trocar responsável ou status de várias tarefas de uma vez, e o filtro <strong>Meus</strong> mostra só as tarefas onde você é responsável.</p>
      </>
    ),
  },
  {
    id: 'settings',
    title: 'Configurações',
    summary: 'Idioma, feriados, templates e preferências pessoais.',
    icon: <GearIcon className="w-5 h-5" />,
    content: (
      <>
        <p>Idioma, formato de data, dias úteis, feriados, templates de projeto e a lista de projetos arquivados (com opção de desarquivar ou excluir da lista).</p>
        <p>A seção <strong>Preferências pessoais</strong> guarda sua aba inicial preferida ao abrir um projeto — só neste navegador.</p>
      </>
    ),
  },
  {
    id: 'users',
    title: 'Usuários (administradores)',
    summary: 'Papéis, convites e revogação de acesso.',
    icon: <UsersGroupIcon className="w-5 h-5" />,
    content: (
      <>
        <p>Visível só pra quem tem papel de <strong>admin</strong>. Mostra todo mundo que já entrou no sistema, com opção de trocar o papel (admin/membro) ou revogar o acesso de alguém.</p>
        <p>Dá pra convidar alguém antes mesmo do primeiro login, informando e-mail, nome e papel — quando essa pessoa entrar com Google usando esse e-mail, o nome e o papel do convite já são aplicados automaticamente.</p>
        <p>O acesso em si continua liberado por domínio de e-mail corporativo — o convite só define nome/papel com antecedência, não é obrigatório pra alguém conseguir entrar.</p>
      </>
    ),
  },
]

export default function GuidePage() {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set([SECTIONS[0].id]))

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="px-8 pt-8 pb-4">
        <div className="flex items-center gap-2.5 mb-1.5">
          <span
            className="w-8 h-8 rounded-[var(--radius-md)] flex items-center justify-center shrink-0"
            style={{ background: 'var(--oe-primary-light)', color: 'var(--oe-primary)' }}
          >
            <GuideIcon className="w-4 h-4" />
          </span>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Guia do open</h1>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
          Um resumo rápido de cada área do sistema e como usá-la.
        </p>
      </div>

      <div className="px-8">
        <AnchorNav
          items={SECTIONS.map((s) => ({ id: s.id, label: s.title }))}
          onNavigate={(id) => setOpenIds((prev) => new Set(prev).add(id))}
        />
      </div>

      <div className="px-8 pb-8">
        {SECTIONS.map((s) => (
          <CollapsibleSection
            key={s.id}
            id={s.id}
            title={
              <span className="flex items-center gap-2.5">
                <span className="shrink-0" style={{ color: 'var(--text-tertiary)' }}>{s.icon}</span>
                <span className="flex flex-col">
                  <span>{s.title}</span>
                  {!openIds.has(s.id) && (
                    <span className="text-xs font-normal mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{s.summary}</span>
                  )}
                </span>
              </span>
            }
            open={openIds.has(s.id)}
            onToggle={() => toggle(s.id)}
          >
            <div className="text-sm space-y-2.5 leading-relaxed pl-[30px]" style={{ color: 'var(--text-secondary)' }}>
              {s.content}
            </div>
          </CollapsibleSection>
        ))}
      </div>
    </div>
  )
}
