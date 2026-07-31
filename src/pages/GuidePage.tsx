import { useState, ReactNode } from 'react'
import { CollapsibleSection } from '@/components/ui/CollapsibleSection'

interface Section {
  id: string
  title: string
  icon: string
  content: ReactNode
}

const SECTIONS: Section[] = [
  {
    id: 'wallet',
    title: 'Carteira (clientes)',
    icon: '🗂️',
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
    icon: '📋',
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
    icon: '📁',
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
    icon: '🛠️',
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
    icon: '✅',
    content: (
      <>
        <p>Visão cruzada de todas as tarefas — tanto de projetos quanto de incidentes — em <strong>kanban</strong> ou <strong>tabela</strong>.</p>
        <p>Seleção em massa permite trocar responsável ou status de várias tarefas de uma vez, e o filtro <strong>Meus</strong> mostra só as tarefas onde você é responsável.</p>
      </>
    ),
  },
  {
    id: 'settings',
    title: 'Configurações',
    icon: '⚙️',
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
    icon: '👥',
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
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Guia do open</h1>
      <p className="text-sm mb-4" style={{ color: 'var(--text-tertiary)' }}>
        Um resumo rápido de cada área do sistema e como usá-la.
      </p>

      <div className="mt-4">
        {SECTIONS.map((s) => (
          <CollapsibleSection
            key={s.id}
            id={s.id}
            title={`${s.icon} ${s.title}`}
            open={openIds.has(s.id)}
            onToggle={() => toggle(s.id)}
          >
            <div className="text-sm space-y-2" style={{ color: 'var(--text-secondary)' }}>
              {s.content}
            </div>
          </CollapsibleSection>
        ))}
      </div>
    </div>
  )
}
