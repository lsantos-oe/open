// Links das notificações: sempre levam ao item de que o aviso fala (a tarefa, o comentário, o risco…), não só à tela
// que o contém. Os gatilhos do banco montam os mesmos formatos (ver supabase/migrations/20261104_notification_links.sql).
//   ?task=<id>      abre a tarefa por cima da página (GlobalEntryModal)
//   &comment=<id>   com a tarefa aberta, rola até o comentário e o destaca
//   ?tab=<aba>      abre a aba do projeto
//   &risk=<id>      na aba de riscos, destaca o risco

/** Tarefa de projeto, de incidente ou solta (sem nenhum dos dois). */
export function taskLink(scope: { projectId?: string | null; incidentId?: string | null }, entryId: string): string {
  const base = scope.projectId ? `/projects/${scope.projectId}` : scope.incidentId ? `/support/${scope.incidentId}` : '/tasks'
  return `${base}?task=${entryId}`
}
