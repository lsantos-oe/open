import { useState, ReactNode } from 'react'
import { CollapsibleSection } from '@/components/ui/CollapsibleSection'
import {
  WalletIcon, PortfolioIcon, FolderIcon, SupportIcon, TasksIcon, GearIcon, UsersGroupIcon, GuideIcon,
  RetroIcon, SearchIcon, NoteIcon, ChatBubbleIcon, SpreadsheetIcon, LinkIcon,
} from '@/components/ui/icons'

interface Section {
  id: string
  title: string
  summary: string
  icon: ReactNode
  content: ReactNode
}

function Code({ children }: { children: ReactNode }) {
  return <code className="px-1 py-0.5 rounded text-[12px]" style={{ background: 'var(--surface-subtle)', color: 'var(--text-primary)' }}>{children}</code>
}

function Ul({ children }: { children: ReactNode }) {
  return <ul className="list-disc pl-5 space-y-1">{children}</ul>
}

const SECTIONS: Section[] = [
  {
    id: 'wallet',
    title: 'Carteira (clientes)',
    summary: 'Base de clientes: status, responsáveis (CS), contatos, notas e histórico.',
    icon: <WalletIcon className="w-5 h-5" />,
    content: (
      <>
        <p>É a base de clientes da empresa. Cada cliente tem nome, país, link do registro no Ploomes, <strong>status</strong> (Pré-venda, Implantação ou Sustentação e novos projetos), responsáveis (CS) com o histórico de trocas, contatos e <strong>notas</strong>.</p>
        <p>As notas usam o <strong>editor de blocos</strong> (veja a seção "Editor de blocos e edição em conjunto") e podem ser editadas por várias pessoas ao mesmo tempo.</p>
        <p>É daqui que vêm os clientes disponíveis ao criar um projeto ou um incidente — não existe texto livre de cliente. Para cadastrar muitos de uma vez, use <strong>Importar → Clientes</strong>.</p>
        <p>Na página do cliente você vê os projetos vinculados e a linha do tempo do que aconteceu neles.</p>
      </>
    ),
  },
  {
    id: 'portfolio',
    title: 'Portfólio (projetos)',
    summary: 'Lista ou kanban de projetos, criação (inclusive em branco) e edição em massa.',
    icon: <PortfolioIcon className="w-5 h-5" />,
    content: (
      <>
        <p>Lista todos os projetos, em visão de <strong>lista</strong> ou <strong>kanban</strong> (alternando no topo). O botão <strong>Meus</strong> mostra só os projetos onde você está no time do projeto.</p>
        <p><strong>Novo projeto:</strong> escolha um modelo — <em>Nova Conta</em> ou <em>Novo Projeto</em>, que já vêm com fases e tarefas — ou <strong>Projeto em branco</strong>, sem fases, tarefas nem cronograma, para montar tudo do zero (você ainda escolhe o tipo, que só serve para agrupar).</p>
        <p>No <strong>kanban</strong>, clique duas vezes numa raia (num espaço vazio) para criar um projeto já nesse status.</p>
        <p>Marque as caixinhas nas linhas/cards para abrir a barra de <strong>edição em massa</strong> (arquivar, trocar líder, trocar cliente ou status de vários projetos).</p>
        <p>Projetos arquivados ficam fora da lista principal — veja pelo link "mostrar arquivados" no fim da lista. Para trazer projetos de uma planilha, use <strong>Importar → Projetos</strong>.</p>
      </>
    ),
  },
  {
    id: 'project',
    title: 'Página de um projeto',
    summary: 'Overview, Plano, Tarefas (kanban), Riscos e Diário.',
    icon: <FolderIcon className="w-5 h-5" />,
    content: (
      <>
        <p>A aba <strong>Visão geral</strong> (Overview) concentra o acesso rápido à Proposta e ao Negócio no Ploomes, as <strong>anotações</strong> do projeto, os links, a equipe, os anexos e o <strong>Charter</strong> — sponsor e orçamento mais um documento único (objetivos, escopo, restrições, premissas…) que vem com um modelo pronto. Anotações e Charter são editados com o editor de blocos, ao vivo e por mais de uma pessoa.</p>
        <p>O <strong>Plano</strong> é o cronograma: fases, tarefas, marcos e reuniões, com datas, dependências, baseline e variação. Cada tarefa mostra <strong>sinais</strong> calculados na hora: <em>atrasada</em> (prazo passou e não foi concluída), <em>parada</em> (sem atividade há 5 dias ou mais) e <em>bloqueada</em>. Num projeto em branco o Plano começa vazio: adicione uma fase ou uma tarefa direto.</p>
        <p>A aba <strong>Tarefas</strong> mostra o kanban do projeto (ou uma tabela). Para criar uma tarefa nova: botão <strong>+ Tarefa</strong> na barra ou <strong>duplo clique</strong> numa raia (num espaço vazio) — a tarefa já nasce no projeto e no status da raia. Arrastar um card muda o status.</p>
        <p>A aba <strong>Riscos</strong> lista os riscos do projeto com probabilidade, impacto, score, responsável, prazo e tarefas de mitigação.</p>
        <p>O <strong>Diário</strong> reúne <strong>Pontos em aberto</strong>, <strong>Reuniões</strong> (notas/ata e itens de ação, decisão e informação), <strong>Log de atrasos</strong> e <strong>Histórico</strong> do projeto, com comentários e anexos. Notas de reunião, descrição de ponto em aberto e notas do histórico também usam o editor de blocos.</p>
        <p>Você escolhe qual aba abre primeiro em Configurações → Preferências pessoais.</p>
      </>
    ),
  },
  {
    id: 'support',
    title: 'Sustentação (incidentes)',
    summary: 'Chamados com prioridade, prazo, responsável, tarefas e kanban.',
    icon: <SupportIcon className="w-5 h-5" />,
    content: (
      <>
        <p>Gestão de chamados ligados a um ou mais clientes, com prioridade, impacto, prazo e responsável. Ao criar, cliente e responsável já são pedidos no formulário, e você pode escrever a <strong>descrição</strong> com o editor de blocos.</p>
        <p>A lista de incidentes tem visão de <strong>lista</strong> e de <strong>kanban</strong>. No kanban, <strong>arraste o card para outra raia</strong> para mudar o status do incidente (Aberto, Em andamento, Aguardando cliente, Resolvido, Fechado); clicar no card abre o incidente.</p>
        <p><strong>Ao resolver ou fechar um incidente</strong> (ou concluir um projeto) que ainda tem tarefas abertas, o Open pergunta se elas também devem ser concluídas: abre uma janela com título, datas, responsável e status atual de cada tarefa. Todas vêm marcadas — desmarque as que devem continuar abertas e confirme. As tarefas escolhidas ficam <strong>Concluídas com Fim real = hoje</strong>; marcos e reuniões não entram. "Agora não" mantém tudo como está. Vale em qualquer lugar onde o status muda: kanban, detalhe, edição em lote e ações do assistente.</p>
        <p>Em <strong>Configurações → Templates de incidente</strong> dá para definir prioridade, impacto, tarefas padrão e uma <strong>descrição padrão</strong>; ao escolher o template no formulário, tudo já vem preenchido.</p>
        <p>Cada incidente tem suas próprias tarefas, pontos em aberto e histórico — igual ao Diário de um projeto. As tarefas aparecem em kanban (também com duplo clique numa raia para criar a tarefa já no incidente e no status da raia) ou em tabela. Na visão geral, a descrição é um documento que várias pessoas editam juntas.</p>
        <p>Dá para selecionar vários incidentes e aplicar ações em massa (status, prioridade, responsável, cliente), usar o filtro <strong>Meus</strong> e importar de planilha em <strong>Importar → Incidentes</strong>.</p>
      </>
    ),
  },
  {
    id: 'tasks',
    title: 'Tarefas',
    summary: 'Visão cruzada de tarefas: kanban, tabela e carga por pessoa.',
    icon: <TasksIcon className="w-5 h-5" />,
    content: (
      <>
        <p>Visão cruzada de todas as tarefas — de projetos, de incidentes ou <strong>soltas</strong> (sem projeto nem incidente) — em três modos: <strong>Kanban</strong>, <strong>Tabela</strong> (editável e agrupável) e <strong>Carga</strong> (quanto cada pessoa tem de trabalho).</p>
        <p>Os status são Backlog, <strong>To Do</strong> (o que o time puxou para a semana), Em andamento, Validação/Teste, Concluído e Bloqueado. Os sinais <em>atrasada</em>, <em>parada</em> e <em>bloqueada</em> aparecem nos cards e na tabela, e dá para ordenar por data da tarefa ou do projeto/incidente.</p>
        <p>Para criar: botão <strong>Nova tarefa</strong> ou <strong>duplo clique numa raia</strong> do kanban (cria uma tarefa já naquele status; o campo de projeto aceita "Nenhum" para tarefa solta). Uma <strong>tarefa solta pode ter vários clientes</strong>: no campo Cliente do modal, marque quantos precisar (na tabela, clique na coluna de origem).</p>
        <p>A descrição da tarefa usa o editor de blocos (títulos, listas, tabelas, imagens, menções).</p>
        <p><strong>Projetos em backlog:</strong> se o projeto ainda não começou (status Backlog), as tarefas dele <strong>não aparecem</strong> em Tarefas nem na página inicial — enquanto o projeto não inicia, a tarefa ainda não importa. Para vê-las, ative <strong>Incluir projetos em backlog</strong> (ao lado de "Meus" em Tarefas, ou na lista da página inicial, que avisa quantas estão ocultas). A preferência fica salva neste navegador.</p>
        <p><strong>Comentários:</strong> no fim do modal da tarefa há uma conversa em cadeia, como numa rede social — cada comentário mostra quem escreveu e quando, e você pode <strong>responder</strong> (as respostas ficam aninhadas), <strong>editar</strong> e <strong>excluir</strong> os seus (admins moderam qualquer um). Digite <strong>@</strong> para mencionar alguém: a pessoa recebe uma notificação com link direto para a tarefa, e quem tem o comentário respondido também é avisado. Enter envia, Shift+Enter quebra a linha, e a conversa atualiza sozinha enquanto a tarefa está aberta. Vale para tarefas de projetos, de incidentes e soltas (subtarefas não têm conversa própria).</p>
        <p>Seleção em massa troca responsável ou status de várias tarefas; o filtro <strong>Meus</strong> mostra só as suas. Para criar muitas tarefas de uma vez: <strong>Importar → Tarefas</strong>.</p>
      </>
    ),
  },
  {
    id: 'retros',
    title: 'Retros',
    summary: 'Retrospectivas do time com urna sigilosa, votos, ações e follow-up.',
    icon: <RetroIcon className="w-5 h-5" />,
    content: (
      <>
        <p>Área para retrospectivas do time: o que foi bom, o que pode melhorar e o que fazer a respeito. As retros aparecem no menu lateral quando você está em Retros.</p>
        <p><strong>Criar:</strong> título, data, período avaliado, link da gravação, condutor (opcional), participantes, retro anterior (para o follow-up), se os cards são <strong>anônimos</strong>, quantos <strong>votos</strong> cada pessoa tem e quem pode <strong>criar ações</strong> (só o condutor — padrão — ou todos os participantes).</p>
        <p><strong>Fases:</strong> Rascunho → <em>Urna aberta</em> (cada participante envia cards e só vê os próprios; o condutor vê todos — isso é garantido pelo banco, não só pela tela) → <em>Urna fechada</em> (os cards são revelados) → <em>Discussão</em> → <em>Encerrada</em>. Os participantes recebem aviso quando a urna abre, fecha ou reabre.</p>
        <p>O condutor (ou um admin) pode <strong>reabrir a urna</strong> enquanto a retro não estiver encerrada e a data não tiver passado — para estender a data, edite a retro e reabra.</p>
        <p>Cada card pode ser ligado a <strong>projetos, incidentes ou clientes</strong>. Depois de revelados, os participantes <strong>votam</strong> nos pontos mais importantes (os mais votados sobem na lista).</p>
        <p><strong>Ações:</strong> nascem de um ponto discutido, com responsáveis, envolvidos, indicador (como saber que deu certo), meta, resultado, prazo, status, nota de resolução, subações e comentários. Quem é citado como responsável ou envolvido recebe uma notificação com link direto para a ação.</p>
        <p><strong>Follow-up:</strong> numa retro ligada a uma anterior, o painel de follow-up lista as ações da retro passada para revisar uma a uma — <em>resolvida</em>, <em>descartada</em> ou <em>levada adiante</em> — e guarda o histórico dessas revisões.</p>
      </>
    ),
  },
  {
    id: 'editor',
    title: 'Editor de blocos e edição em conjunto',
    summary: 'Texto rico estilo Notion nos campos longos, com menções e imagens.',
    icon: <NoteIcon className="w-5 h-5" />,
    content: (
      <>
        <p>Os campos de texto longo usam um <strong>editor de blocos</strong>: títulos, listas, listas de tarefas, citações, tabelas, código, imagens e destaques.</p>
        <Ul>
          <li>Digite <strong>/</strong> para abrir o menu de blocos (e modelos, como o do Charter).</li>
          <li>Digite <strong>@</strong> para <strong>mencionar</strong> uma pessoa, projeto, incidente ou cliente. Quem é mencionado recebe uma notificação; menções a projetos, incidentes e clientes viram links clicáveis.</li>
          <li>Cole ou arraste <strong>imagens</strong> para dentro do texto (até 10 MB).</li>
          <li>Selecione um trecho para formatar (negrito, itálico, link…).</li>
        </Ul>
        <p><strong>Edição em conjunto:</strong> nestes campos várias pessoas escrevem ao mesmo tempo e veem o cursor umas das outras, sem botão Salvar: descrição de incidente, notas de cliente, anotações e Charter do projeto, notas de reunião, descrição de ponto em aberto e detalhe de notas do Histórico.</p>
        <p>Nos formulários que têm botão <strong>Salvar</strong> (tarefa, risco, atraso, criação de incidente/reunião/ponto em aberto, ação de retro, template de incidente) o mesmo editor funciona, mas o texto só é gravado ao salvar.</p>
        <p><strong>Comentários</strong> (tarefas, Diário e retros) aceitam formatação simples — nas tarefas, Markdown e <strong>@menções</strong>: <strong>Ctrl/⌘+B</strong> negrito, <strong>Ctrl/⌘+I</strong> itálico, <strong>Ctrl/⌘+E</strong> código e <strong>Ctrl/⌘+K</strong> link — e também listas e links escritos em Markdown.</p>
        <p>O texto é guardado em Markdown, por isso relatórios, exportações e o assistente de IA conseguem lê-lo. Textos antigos, escritos em texto puro, aparecem normalmente (com as quebras de linha preservadas).</p>
      </>
    ),
  },
  {
    id: 'search',
    title: 'Busca rápida (Command+K)',
    summary: 'Encontre e abra qualquer coisa de qualquer tela.',
    icon: <SearchIcon className="w-5 h-5" />,
    content: (
      <>
        <p>Aperte <strong>⌘K</strong> (Mac) ou <strong>Ctrl+K</strong>, ou clique em "Buscar…" no topo. Digite o que procura — a busca ignora acento e maiúsculas e mostra primeiro o que começa com o que você digitou.</p>
        <p>Encontra <strong>projetos, clientes, incidentes, retros</strong> e <strong>tarefas</strong> (inclusive subtarefas, marcos, reuniões e tarefas soltas). Use ↑↓ para navegar e <strong>Enter</strong> ou <strong>clique</strong> para abrir.</p>
        <p>Projeto, cliente, incidente e retro abrem a própria página. Uma <strong>tarefa abre o modal de edição por cima da tela em que você está</strong>, sem tirar você do lugar.</p>
        <p>O botão <strong>+</strong> no topo cria rapidamente tarefa, incidente, projeto, contato ou cliente.</p>
      </>
    ),
  },
  {
    id: 'ai',
    title: 'Assistente de IA',
    summary: 'Pergunte, peça análises e deixe-o criar itens — com histórico e memória.',
    icon: <ChatBubbleIcon className="w-5 h-5" />,
    content: (
      <>
        <p>O botão redondo no canto inferior direito abre o assistente (aparece quando um admin configurou a chave em Configurações). Ele <strong>lê praticamente tudo</strong> no Open — projetos, tarefas (responsáveis, datas, atrasos), riscos, atrasos, pontos em aberto, reuniões, histórico, incidentes, clientes e pessoas — para responder perguntas e dar <strong>insights</strong>: quais projetos estão em risco, quem está sobrecarregado, quem mais contribuiu num projeto, o que foi decidido sobre um assunto, incidentes parados…</p>
        <p>Os números vêm dos dados do Open (ele informa qual métrica usou). Os <strong>retros ficam de fora</strong>, para preservar o sigilo dos cards. Ele analisa o que está carregado na sua sessão — recarregue a página antes de uma análise importante.</p>
        <p><strong>Ações:</strong> criar e editar projetos, tarefas, incidentes, clientes e contatos. Toda escrita aparece num cartão para você <strong>aprovar ou cancelar</strong> antes de executar. Dá para colar um texto, uma imagem ou um PDF (e-mail, conversa, print) e pedir que ele extraia as tarefas.</p>
        <p><strong>Histórico:</strong> as conversas ficam salvas por usuário e a última é retomada quando você abre o painel. No cabeçalho: <strong>+</strong> começa uma conversa nova, <strong>Histórico</strong> lista, abre ou apaga conversas anteriores.</p>
        <p><strong>No Discord:</strong> com o Discord conectado no perfil (Editar perfil → Alertas no Discord), use <strong>/open</strong> seguido da mensagem para falar com o assistente — perguntas, análises e também criar ou alterar itens. Ações de escrita mostram os botões <strong>Confirmar</strong> e <strong>Cancelar</strong> (só quem pediu decide). A resposta aparece onde você usou o comando, num canal ou na mensagem direta com o bot. <strong>/open-novo</strong> começa uma conversa nova. Anexos não são aceitos pelo Discord: cole o texto.</p>
                <p><strong>Memória pessoal:</strong> o assistente guarda notas curtas sobre você — preferências, correções e fatos duradouros — para não recomeçar do zero, e avisa sempre que anota ou esquece algo. Você pode pedir "lembre que…" ou "esqueça isso". Veja, edite, adicione e apague tudo em <strong>Configurações → Memória do assistente</strong>. As memórias são só suas: ninguém do time as vê.</p>
      </>
    ),
  },
  {
    id: 'import',
    title: 'Importação em massa (Excel)',
    summary: 'Baixe o modelo, preencha e importe clientes, projetos, incidentes e tarefas.',
    icon: <SpreadsheetIcon className="w-5 h-5" />,
    content: (
      <>
        <p>Clique em <strong>Importar</strong> no topo (ou em Configurações → Importação em massa) e escolha <strong>Clientes</strong>, <strong>Projetos</strong>, <strong>Incidentes</strong>, <strong>Tarefas</strong> ou <strong>Tudo em um arquivo</strong>.</p>
        <Ul>
          <li><strong>1. Baixe o modelo (.xlsx).</strong> Vem pronto, com todas as colunas, listas suspensas (inclusive com os clientes, responsáveis, projetos e incidentes que já existem no Open), validação de datas e números, uma nota em cada cabeçalho e uma aba <strong>Instruções</strong> explicando como preencher cada coluna, com exemplos.</li>
          <li><strong>2. Preencha</strong> uma linha por item, a partir da linha 2. Não altere o cabeçalho. Datas em DD/MM/AAAA; se não souber a data, deixe em branco.</li>
          <li><strong>3. Envie a planilha</strong> na mesma tela. Nada é gravado ainda: você revisa linha por linha.</li>
          <li><strong>4. Revise e confirme.</strong> Para cada linha escolha <em>Criar</em>, <em>Atualizar</em> ou <em>Ignorar</em>, ajuste o que precisar e importe.</li>
        </Ul>
        <p>O Open reconhece o que já existe pelo <strong>nome</strong> (sem diferenciar acento ou maiúsculas). Só um nome <em>igual</em> sugere "Atualizar"; nome apenas parecido sugere "Criar" e mostra qual é o parecido. Ao atualizar, textos novos são <strong>anexados</strong> ao que já existia — nada é sobrescrito, e nada é apagado.</p>
        <p>No modo <strong>Tudo em um arquivo</strong>, projetos, incidentes e tarefas podem apontar para clientes e projetos criados no mesmo arquivo (pelo nome). Tarefas aceitam responsável, início, fim, duração e fase.</p>
      </>
    ),
  },
  {
    id: 'api',
    title: 'API e conexão com o Claude (MCP)',
    summary: 'Chave pessoal, plugin do Claude, comandos prontos e a API OData para integrações.',
    icon: <LinkIcon className="w-5 h-5" />,
    content: (
      <>
        <p>O Open tem duas portas para ferramentas e agentes de IA acessarem os mesmos dados da tela: a <strong>API OData</strong> (o mesmo padrão da API do Ploomes CRM, para integrações e scripts) e um <strong>servidor MCP</strong>, que conecta o <strong>Claude</strong> ao Open. As duas rodam no endereço do próprio Open (<Code>/api</Code>) e a <strong>documentação interativa</strong>, com todas as rotas e exemplos, fica em <Code>/api/docs</Code>.</p>
        <p><strong>Tudo age como você.</strong> A API e o Claude usam o seu acesso: veem o que você vê, e o que gravarem aparece no Open com o <strong>seu nome</strong> — com as mesmas regras da tela (cascata de datas, etapa automática, caminho crítico, histórico), e com os mesmos avisos (notificações, menções e alertas no Discord). Cada escrita acontece numa transação só: grava tudo ou nada.</p>

        <p><strong>Sua chave pessoal (User-Key):</strong> abra <Code>/api/minha-chave</Code>, entre com o seu Google do Open e clique em <strong>Mostrar</strong> ou <strong>Copiar</strong> (a chave começa com <Code>ouk_</Code>). É ela que vai no cabeçalho <Code>User-Key</Code> das chamadas. Trate como uma senha: quem tem a chave age como você. Para trocar, use <strong>Gerar nova chave</strong> na mesma página — a anterior para de valer na hora. Ali também está <strong>Desconectar apps</strong>, que revoga o acesso de todos os conectores do Claude ligados à sua conta.</p>

        <p><strong>Conectar o Claude (recomendado):</strong></p>
        <Ul>
          <li>Instale o <strong>plugin do Open</strong> (pasta <Code>claude-plugin</Code> do repositório, compactada em .zip): no Claude, Plugins → Adicionar → fazer upload de plugin.</li>
          <li>No plugin, aba <strong>Conectores → open → Vincular</strong>, entre com o Google do Open e clique em <strong>Permitir</strong>. Não há chave dentro do plugin: cada pessoa faz o próprio login. No Claude Code, o mesmo é <Code>/mcp</Code> → open → Authenticate.</li>
          <li>Teste perguntando <em>"quem sou eu no Open?"</em>.</li>
          <li>Onde funciona: Claude Code (terminal, VS Code e a aba Code do app). No <strong>chat</strong> do Claude, o conector só aparece se a organização permitir conectores personalizados (um proprietário da organização precisa adicionar o endereço do MCP).</li>
          <li>Sem o plugin, dá para ligar o Claude Code direto com a chave: <Code>claude mcp add --transport http open https://openploo.vercel.app/api/mcp --header "User-Key: SUA_CHAVE"</Code>.</li>
        </Ul>

        <p><strong>O que dá para pedir ao Claude:</strong> consultar (suas tarefas atrasadas, o status de um projeto, a carga de trabalho do time, o que um cliente tem aberto), cadastrar (projeto a partir de um template, tarefa, incidente, ponto em aberto, ata de reunião, risco), mudar prazos (as tarefas dependentes são empurradas), mudar etapa, comentar e <strong>cadastrar várias demandas de uma vez</strong> a partir de um e-mail, ata ou planilha. O plugin traz comandos prontos:</p>
        <Ul>
          <li><strong>/open:minha-semana</strong> — suas tarefas atrasadas, vencendo e paradas.</li>
          <li><strong>/open:status-projeto</strong> — status report pronto para o cliente.</li>
          <li><strong>/open:cliente</strong> e <strong>/open:preparar-reuniao</strong> — visão 360 do cliente e pauta da reunião com pendências e riscos.</li>
          <li><strong>/open:registrar-reuniao</strong> — ata no diário, com pontos em aberto, tarefas e riscos.</li>
          <li><strong>/open:cadastrar-demanda</strong>, <strong>/open:novo-projeto</strong> e <strong>/open:triagem-incidente</strong> — cadastros.</li>
          <li><strong>/open:encerrar</strong> — conclui um projeto ou incidente e trata as tarefas que ficaram abertas.</li>
          <li><strong>/open:revisar-atrasos</strong> e <strong>/open:carga-time</strong> — atrasos por projeto e por pessoa, e carga de trabalho com sugestões.</li>
        </Ul>

        <p><strong>Segurança e cuidados:</strong></p>
        <Ul>
          <li><strong>Prévia antes de gravar.</strong> As ferramentas de escrita do Claude simulam primeiro (nada é gravado), mostram o resumo e só gravam depois da sua confirmação. Dá para repetir o pedido sem duplicar (chave de idempotência).</li>
          <li>Só contas <strong>@ploomes.com</strong> ativas entram. Quem é desativado no Open perde o acesso na hora, mesmo com uma chave ou conector já ligado.</li>
          <li>Há limite de <strong>120 requisições por minuto</strong> por pessoa (a API responde 429 e diz quando tentar de novo). Cada chamada fica registrada para auditoria (quem, quando, rota e resultado — sem o conteúdo), por 90 dias.</li>
          <li>O que o Claude lê do Open é tratado como <strong>dado</strong>, nunca como instrução: um texto de tarefa dizendo "faça tal coisa" não vira ordem.</li>
          <li>O time técnico tem um interruptor de <strong>somente leitura</strong>: com a escrita desligada, a API e o Claude consultam normalmente, mas gravar devolve "escrita desabilitada".</li>
        </Ul>

        <p><strong>As mesmas regras da tela:</strong> atraso não é etapa (uma tarefa em qualquer etapa pode estar atrasada); tarefas de <strong>projetos em Backlog</strong> ficam fora das listas gerais, como em Tarefas (o Claude só as traz se você pedir ou se for sobre aquele projeto); e, ao <strong>concluir um projeto ou resolver/fechar um incidente</strong>, o Claude lista as tarefas abertas e pergunta se devem ser concluídas também (Fim real = hoje, no fuso de São Paulo), como a janela de encerramento do Open.</p>

        <p><strong>Para quem programa:</strong> a API segue o OData v4 em <Code>/api/odata/v1</Code>: <Code>$filter</Code>, <Code>$select</Code>, <Code>$expand</Code>, <Code>$orderby</Code>, <Code>$top</Code>/<Code>$skip</Code>, <Code>$count</Code>, <Code>$search</Code> e o método QUERY. Os conjuntos são Clients, Contacts, Projects, Phases, Tasks, Comments, Incidents, Risks, OpenPoints, Meetings, History, Users, Notifications e outros. Exemplos:</p>
        <Ul>
          <li>Quem sou eu: <Code>GET /Me</Code> com o cabeçalho <Code>User-Key</Code>.</li>
          <li>Projetos em andamento com saúde: <Code>GET /Projects?$filter=Status eq 'InProgress' and not Archived&$select=Id,Name,Progress,OverdueCount,IsDelayed</Code>.</li>
          <li>Mudar a etapa de uma tarefa: <Code>POST /Tasks(id)/Open.SetStatus</Code> com <Code>{'{"Status":"Validation"}'}</Code>.</li>
          <li>Cadastro em lote: <Code>POST /Open.Intake</Code> — simula por padrão; repita com <Code>"DryRun": false</Code> para gravar.</li>
          <li>Escritas aceitam <Code>Prefer: dry-run</Code> (executa e desfaz), <Code>Idempotency-Key</Code> (repetir não duplica) e <Code>If-Match</Code> (evita sobrescrever uma alteração de outra pessoa). Não há DELETE de dados de negócio.</li>
          <li>Automações: use a chave de um usuário-robô. Admins geram com <Code>POST /api/admin/user-keys/rotate</Code> informando o e-mail.</li>
        </Ul>
      </>
    ),
  },
  {
    id: 'settings',
    title: 'Configurações',
    summary: 'Idioma, feriados, templates, preferências, memória do IA, importação e alertas no Discord.',
    icon: <GearIcon className="w-5 h-5" />,
    content: (
      <>
        <p>Idioma, formato de data, dias úteis, feriados, <strong>templates de projeto</strong> e de <strong>incidente</strong> (com descrição padrão) e a lista de projetos arquivados (com opção de desarquivar ou excluir da lista).</p>
        <p>A seção <strong>Preferências pessoais</strong> guarda sua aba inicial preferida ao abrir um projeto — só neste navegador.</p>
        <p><strong>Memória do assistente</strong> leva à página onde você gerencia o que o assistente de IA guarda sobre você. <strong>Importação em massa</strong> abre a importação por Excel. Admins também configuram aqui a chave do assistente de IA, compartilhada pelo time.</p>
        <p><strong>Alertas no Discord:</strong> em <strong>Editar perfil</strong> (menu do seu avatar), informe seu @ do Discord e clique em <strong>Conectar</strong> — chega uma mensagem de teste. Depois escolha quais avisos quer receber por mensagem direta: quando uma tarefa for <strong>atribuída a você</strong> (ou criada já com você), quando <strong>outra pessoa alterar</strong> uma tarefa sua (status, prazo, nome, descrição, risco ou sua saída da tarefa) e quando uma tarefa sua <strong>vencer</strong> (1 dia antes e no dia, às 8h). Você nunca é avisado do que você mesmo fez. Para funcionar, você precisa estar no servidor do Discord do time e permitir mensagens diretas dos membros dele.</p>
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
