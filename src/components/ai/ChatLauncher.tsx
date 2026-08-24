import { useAiStore } from '@/stores/useAiStore'
import { useAiChatStore } from '@/stores/useAiChatStore'
import { useOverlayStore } from '@/stores/useOverlayStore'
import { ChatPanel } from './ChatPanel'

/** Floating action button that opens the AI chat panel — only rendered once
 *  an admin has configured the workspace's shared OpenRouter key (Configurações
 *  → Geral). Sits in the same bottom-right corner as Toaster.tsx, just under
 *  it in z-index so a toast always renders on top if the two ever overlap.
 *  Full-height right-side drawers (CommentsPanel, RiskPanel) occupy that same
 *  corner, so while one is open the button hops to bottom-center instead of
 *  sitting on top of its content. */
export function ChatLauncher() {
  const { hasKey } = useAiStore()
  const { open, toggle } = useAiChatStore()
  const sidePanelOpen = useOverlayStore((s) => s.sidePanelCount > 0)

  if (!hasKey) return null

  return (
    <>
      <button
        onClick={toggle}
        aria-label="Assistente de IA"
        style={{
          position: 'fixed',
          bottom: 24,
          ...(sidePanelOpen
            ? { left: '50%', transform: 'translateX(-50%)' }
            : { right: 24 }),
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: 'var(--oe-primary)',
          color: 'white',
          border: 'none',
          boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 9990,
          transition: 'left 200ms ease, right 200ms ease',
        }}
      >
        {open ? <CloseIcon /> : <ChatIcon />}
      </button>
      <ChatPanel />
    </>
  )
}

function ChatIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 17H7a2 2 0 01-2-2V7a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2l-3 3-3-3z" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
