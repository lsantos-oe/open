import { create } from 'zustand'

interface OverlayStore {
  /** Count of currently-mounted full-height right-side drawers (CommentsPanel,
   *  RiskPanel, ...) — a counter (not a bool) so nested/rapid open+close never
   *  desyncs. ChatLauncher reads this to move out of the way instead of
   *  floating on top of the drawer's content. */
  sidePanelCount: number
  openSidePanel: () => void
  closeSidePanel: () => void
}

export const useOverlayStore = create<OverlayStore>((set) => ({
  sidePanelCount: 0,
  openSidePanel: () => set((s) => ({ sidePanelCount: s.sidePanelCount + 1 })),
  closeSidePanel: () => set((s) => ({ sidePanelCount: Math.max(0, s.sidePanelCount - 1) })),
}))
