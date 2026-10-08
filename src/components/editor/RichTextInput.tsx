import { Suspense, lazy } from 'react'
import { useTranslation } from 'react-i18next'
import type { LocalEditorProps } from './LocalEditor'

const LocalEditor = lazy(() => import('./LocalEditor'))

/** Campo de texto rico para formulários com "Salvar" (tarefa, risco, atraso…): blocos, comandos `/`, menções e
 *  imagens, entregando Markdown em `onChange`. Para trocar o texto de fora, troque a `key`. */
export default function RichTextInput(props: LocalEditorProps) {
  const { t } = useTranslation()
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: props.minHeight ?? 72, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', background: 'var(--surface-input)',
          }}
        >
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{t('editor.loadingField')}</span>
        </div>
      }
    >
      <LocalEditor {...props} />
    </Suspense>
  )
}
