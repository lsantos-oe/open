import { Suspense, lazy, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { DocFieldRef, useAppStore } from '@/store/useAppStore'
import { supabase } from '@/lib/supabase'
import { DOC_FIELDS, DocFieldKind, docIdFor } from '@/utils/docFields'
import { legacyTextToMarkdown } from '@/utils/docText'
import type { EditorTemplate } from './editorCommon'

// O editor de blocos (BlockNote + Yjs) é pesado: só carrega quando um campo-documento aparece na tela.
const CollabEditor = lazy(() => import('./CollabEditor'))

interface Props {
  kind: DocFieldKind
  /** Registro dono do campo (e, para pontos em aberto/histórico/reuniões, onde ele mora na memória). */
  target: DocFieldRef
  /** Valor atual da coluna (Markdown, ou texto puro antigo). Semeia o documento na primeira abertura. */
  value: string | undefined
  templates?: EditorTemplate[]
  compact?: boolean
  minHeight?: number
}

/** Campo de texto colaborativo de um registro existente: abre o documento vivo e grava a projeção em Markdown
 *  na coluna do campo. Várias pessoas podem editar ao mesmo tempo; não há botão Salvar. */
export default function DocField({ kind, target, value, templates, compact = true, minHeight }: Props) {
  const { t } = useTranslation()
  const setDocField = useAppStore((s) => s.setDocField)
  const { id, scope, projectId } = target
  const scopeType = scope?.type
  const scopeId = scope?.id

  const save = useCallback(
    (md: string) => { void setDocField(kind, { id, projectId, scope: scopeType && scopeId ? { type: scopeType, id: scopeId } : undefined }, md) },
    [setDocField, kind, id, projectId, scopeType, scopeId],
  )
  // A semente só é lida quando o documento ainda não existe; recalcular a cada render é barato.
  const seed = useMemo(() => legacyTextToMarkdown(value), [value])
  // Na primeira abertura o texto vem direto da coluna: a memória desta tela pode estar atrás de uma edição feita
  // por outra pessoa (ou pela IA) depois que a página carregou.
  const fetchSeed = useCallback(async () => {
    const { table, column } = DOC_FIELDS[kind]
    const { data, error } = await supabase.from(table).select(column).eq('id', id).maybeSingle()
    if (error || !data) return undefined
    return legacyTextToMarkdown((data as unknown as Record<string, string | null>)[column])
  }, [kind, id])

  return (
    <Suspense fallback={<p className="text-xs py-4 text-center" style={{ color: 'var(--text-tertiary)' }}>{t('editor.loading')}</p>}>
      <CollabEditor
        docId={docIdFor(kind, id)}
        seedMarkdown={seed}
        fetchSeed={fetchSeed}
        onMarkdownChange={save}
        templates={templates}
        compact={compact}
        minHeight={minHeight}
      />
    </Suspense>
  )
}
