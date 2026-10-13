// Catálogo dos modelos de importação (layout das planilhas). É a fonte única de: quais colunas cada entidade tem,
// o que cada uma significa, quais valores aceita e como preencher — usada para montar o .xlsx de modelo
// (importTemplate.ts) com listas suspensas e instruções. Os NOMES de coluna e os rótulos de lista precisam bater com o
// que o leitor (importStaging.ts) reconhece.

export type ImportEntity = 'clientes' | 'projetos' | 'incidentes' | 'tarefas'

export const IMPORT_ENTITIES: ImportEntity[] = ['clientes', 'projetos', 'incidentes', 'tarefas']

/** De onde vêm as opções de uma coluna de referência (listas do próprio Open, na aba "Listas"). */
export type RefList = 'clients' | 'users' | 'projects' | 'incidents' | 'countries' | 'origins'

export interface LayoutColumn {
  /** Cabeçalho exato da coluna (é por ele que o Open lê a planilha). */
  key: string
  required?: boolean
  description: string
  example: string
  kind: 'text' | 'longtext' | 'date' | 'number' | 'enum' | 'ref'
  /** enum: valores aceitos (rótulos em português, como aparecem na lista suspensa). */
  options?: string[]
  /** ref: lista do Open usada na lista suspensa. Aceita digitar outro valor (ex.: cliente novo). */
  refList?: RefList
  width: number
}

export interface EntityLayout {
  entity: ImportEntity
  /** Nome da aba de dados (o Open procura por esse nome). */
  sheet: string
  title: string
  summary: string
  columns: LayoutColumn[]
  /** Regras específicas desta entidade, mostradas na aba de instruções. */
  notes: string[]
}

export const CLIENT_STATUS_LABELS = ['Pré-venda', 'Implantação', 'Sustentação e novos projetos']
export const PROJECT_TYPE_LABELS = ['Nova Conta', 'Novo Projeto']
export const PROJECT_STATUS_LABELS = ['Backlog', 'Planejamento', 'Em andamento', 'Concluído']
export const LEVEL_LABELS = ['Alta', 'Média', 'Baixa']
export const INCIDENT_STATUS_LABELS = ['Aberto', 'Em andamento', 'Aguardando cliente', 'Resolvido', 'Fechado']
export const TASK_STATUS_LABELS = ['Backlog', 'To Do', 'Em andamento', 'Validação/Teste', 'Concluído', 'Bloqueado']
export const TASK_ORIGIN_LABELS = ['Projeto', 'Incidente', 'Solta']

export const LAYOUTS: Record<ImportEntity, EntityLayout> = {
  clientes: {
    entity: 'clientes',
    sheet: 'Clientes',
    title: 'Clientes (Carteira)',
    summary: 'Uma linha por cliente. Se o nome já existir no Open, a linha é sugerida como "Atualizar"; senão, como "Criar".',
    columns: [
      { key: 'nome', required: true, kind: 'text', width: 34, description: 'Nome do cliente (é por ele que o Open reconhece um cliente que já existe).', example: 'Lockton México' },
      { key: 'pais', kind: 'ref', refList: 'countries', width: 18, description: 'País do cliente. Aceita o nome (Brasil) ou o código (BR).', example: 'México' },
      { key: 'status', kind: 'enum', options: CLIENT_STATUS_LABELS, width: 28, description: 'Fase do cliente na Carteira. Em branco = "Sustentação e novos projetos".', example: 'Implantação' },
      { key: 'link_ploomes', kind: 'text', width: 34, description: 'Link do registro do cliente no Ploomes.', example: 'https://app10.ploomes.com/...' },
      { key: 'responsavel', kind: 'ref', refList: 'users', width: 24, description: 'Responsável (CS) pelo cliente — um usuário do Open.', example: 'Ana Souza' },
      { key: 'notas', kind: 'longtext', width: 44, description: 'Observações livres sobre o cliente.', example: 'Prefere reuniões às terças.' },
    ],
    notes: ['Clientes novos criados aqui já ficam disponíveis para os Projetos, Incidentes e Tarefas importados no mesmo arquivo.'],
  },
  projetos: {
    entity: 'projetos',
    sheet: 'Projetos',
    title: 'Projetos',
    summary: 'Uma linha por projeto. Projetos novos entram com as fases e tarefas do template padrão do tipo escolhido.',
    columns: [
      { key: 'cliente', required: true, kind: 'ref', refList: 'clients', width: 28, description: 'Cliente do projeto. Escolha um da lista; se digitar um nome que não existe, a tela de revisão pede para você escolher ou criar o cliente.', example: 'Lockton México' },
      { key: 'nome', required: true, kind: 'text', width: 36, description: 'Nome do projeto (é por ele que o Open reconhece um projeto que já existe).', example: 'Integração AdminSE' },
      { key: 'tipo', kind: 'enum', options: PROJECT_TYPE_LABELS, width: 16, description: 'Nova Conta ou Novo Projeto. Em branco = Novo Projeto.', example: 'Novo Projeto' },
      { key: 'pm', kind: 'ref', refList: 'users', width: 24, description: 'Líder do projeto — um usuário do Open.', example: 'Ana Souza' },
      { key: 'status', kind: 'enum', options: PROJECT_STATUS_LABELS, width: 16, description: 'Etapa do projeto. Em branco = Backlog.', example: 'Em andamento' },
      { key: 'data_go_live', kind: 'date', width: 16, description: 'Data prevista de go-live (DD/MM/AAAA). Deixe em branco se não souber — não chute.', example: '30/11/2026' },
      { key: 'descricao', kind: 'longtext', width: 44, description: 'Descrição / contexto do projeto (vai para as anotações do projeto).', example: 'Integra o AdminSE com o Ploomes.' },
      { key: 'link_referencia', kind: 'text', width: 30, description: 'Link de referência (proposta, documento, pasta).', example: 'https://drive.google.com/...' },
      { key: 'notas', kind: 'longtext', width: 36, description: 'Observações livres.', example: '' },
    ],
    notes: [
      'Para criar um projeto e já importar tarefas dele, use o MESMO nome do projeto na coluna origem_nome da aba Tarefas.',
      'Projeto em branco (sem fases e tarefas) não é criado por importação — crie pelo botão "Novo projeto" e escolha "Projeto em branco".',
    ],
  },
  incidentes: {
    entity: 'incidentes',
    sheet: 'Incidentes',
    title: 'Incidentes (Sustentação)',
    summary: 'Uma linha por incidente. Se o título já existir para o cliente, a linha é sugerida como "Atualizar".',
    columns: [
      { key: 'cliente', required: true, kind: 'ref', refList: 'clients', width: 28, description: 'Cliente do incidente (um da lista).', example: 'Lockton México' },
      { key: 'titulo', required: true, kind: 'text', width: 40, description: 'Título do incidente.', example: 'Webhook de contatos devolve erro 500' },
      { key: 'prioridade', kind: 'enum', options: LEVEL_LABELS, width: 14, description: 'Urgência de resolução. Em branco = Média.', example: 'Alta' },
      { key: 'impacto', kind: 'enum', options: LEVEL_LABELS, width: 14, description: 'Quanto afeta a operação do cliente. Em branco = Média.', example: 'Média' },
      { key: 'prazo', kind: 'date', width: 14, description: 'Prazo para resolver (DD/MM/AAAA).', example: '20/10/2026' },
      { key: 'status', kind: 'enum', options: INCIDENT_STATUS_LABELS, width: 20, description: 'Situação do incidente. Em branco = Aberto.', example: 'Aberto' },
      { key: 'responsavel', kind: 'ref', refList: 'users', width: 24, description: 'Responsável pelo incidente — um usuário do Open.', example: 'Bruno Lima' },
      { key: 'projeto_relacionado', kind: 'ref', refList: 'projects', width: 30, description: 'Projeto relacionado (opcional) — pelo nome.', example: 'Integração AdminSE' },
      { key: 'descricao', kind: 'longtext', width: 44, description: 'Descrição do incidente.', example: 'Desde 08/10 o webhook responde 500 ao criar contato.' },
      { key: 'link_evidencia', kind: 'text', width: 30, description: 'Link de evidência (print, log, chamado).', example: '' },
      { key: 'notas', kind: 'longtext', width: 36, description: 'Observações livres.', example: '' },
    ],
    notes: [],
  },
  tarefas: {
    entity: 'tarefas',
    sheet: 'Tarefas',
    title: 'Tarefas',
    summary: 'Uma linha por tarefa. Cada tarefa pertence a um projeto, a um incidente ou fica "solta" (sem projeto nem incidente).',
    columns: [
      { key: 'origem_tipo', required: true, kind: 'enum', options: TASK_ORIGIN_LABELS, width: 14, description: 'Onde a tarefa vive: Projeto, Incidente ou Solta.', example: 'Projeto' },
      { key: 'origem_nome', kind: 'ref', refList: 'origins', width: 32, description: 'Nome do projeto ou do incidente (obrigatório para Projeto/Incidente; vazio se Solta). Pode ser um projeto/incidente que está sendo criado no mesmo arquivo.', example: 'Integração AdminSE' },
      { key: 'cliente', kind: 'ref', refList: 'clients', width: 26, description: 'Só para tarefas Soltas: cliente a que a tarefa se refere (opcional).', example: '' },
      { key: 'nome', required: true, kind: 'text', width: 40, description: 'Nome da tarefa.', example: 'Mapear campos personalizados' },
      { key: 'responsavel', kind: 'ref', refList: 'users', width: 24, description: 'Executor da tarefa — um usuário do Open (ou um nome livre).', example: 'Ana Souza' },
      { key: 'status', kind: 'enum', options: TASK_STATUS_LABELS, width: 18, description: 'Em branco = Backlog (o time tria depois).', example: 'To Do' },
      { key: 'prioridade_ref', kind: 'enum', options: LEVEL_LABELS, width: 14, description: 'Prioridade de referência — vira o sinal de risco da tarefa (Alta = crítico, Média = atenção, Baixa = nenhum).', example: 'Alta' },
      { key: 'inicio', kind: 'date', width: 14, description: 'Início planejado (DD/MM/AAAA). Opcional.', example: '12/10/2026' },
      { key: 'fim', kind: 'date', width: 14, description: 'Fim planejado (DD/MM/AAAA). Opcional.', example: '16/10/2026' },
      { key: 'duracao_dias', kind: 'number', width: 14, description: 'Duração em dias úteis. Opcional.', example: '5' },
      { key: 'fase', kind: 'text', width: 22, description: 'Nome da fase do projeto onde a tarefa entra. Se não existir (ou ficar em branco), a tarefa entra em "Sem fase".', example: 'Implantação' },
      { key: 'descricao', kind: 'longtext', width: 44, description: 'Descrição da tarefa.', example: '' },
      { key: 'link_evidencia', kind: 'text', width: 30, description: 'Link de referência.', example: '' },
      { key: 'notas', kind: 'longtext', width: 36, description: 'Observações livres.', example: '' },
    ],
    notes: [
      'Datas incertas ficam em branco — o Open não adivinha prazos.',
      'Se você informar início e fim, o fim não pode ser anterior ao início.',
    ],
  },
}

export const GENERAL_RULES: string[] = [
  'Preencha a aba da entidade, uma linha por item, começando na linha 2. A linha 1 (cabeçalho) não pode ser alterada, apagada nem renomeada — é por ela que o Open lê cada coluna.',
  'Colunas com cabeçalho colorido e "obrigatório" na tabela abaixo precisam estar preenchidas; as demais podem ficar em branco.',
  'Onde houver lista suspensa (seta na célula), escolha uma opção. Nos campos que referenciam coisas do Open (cliente, responsável, projeto) você também pode digitar outro valor — a tela de revisão avisa o que não foi encontrado.',
  'Datas no formato DD/MM/AAAA. Se não souber a data, deixe em branco.',
  'A aba "Listas" traz as opções válidas e os nomes que já existem no Open (clientes, usuários, projetos, incidentes). Não edite essa aba.',
  'Depois de preencher, salve como .xlsx e envie em Importação em massa. Nada é gravado antes da tela de revisão: você vê cada linha, escolhe Criar / Atualizar / Ignorar e só então confirma.',
]

export const MATCHING_RULES: string[] = [
  'O Open reconhece o que já existe pelo NOME (sem diferenciar maiúsculas, minúsculas ou acentos). Se encontrar um único item com aquele nome, sugere "Atualizar"; se não encontrar, sugere "Criar"; se encontrar mais de um, pede para você escolher na revisão.',
  'Nada é apagado por importação: ela só cria ou atualiza.',
]

export const MAX_ROWS = 1000

export const importFileName = (entity: ImportEntity | 'tudo') => `open-modelo-importacao-${entity === 'tudo' ? 'completo' : entity}.xlsx`
