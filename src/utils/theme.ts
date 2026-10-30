import { useSyncExternalStore } from 'react'

// Aparência: automático (segue o sistema), claro ou escuro. É uma preferência pessoal, guardada neste navegador.
// O <html> recebe data-theme="light" | "dark"; sem o atributo, vale o tema do sistema (ver index.css).

export type ThemePref = 'auto' | 'light' | 'dark'
const KEY = 'pb-theme'
const EVENT = 'oe-theme-change'

export function getThemePref(): ThemePref {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'auto' } catch { return 'auto' }
}

/** O tema em uso agora (resolve "automático" pelo sistema). */
export function isDarkNow(): boolean {
  const pref = getThemePref()
  if (pref !== 'auto') return pref === 'dark'
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function applyTheme(pref: ThemePref = getThemePref()) {
  const root = document.documentElement
  if (pref === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', pref)
}

export function setThemePref(pref: ThemePref) {
  try { if (pref === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, pref) } catch { /* sem armazenamento */ }
  applyTheme(pref)
  window.dispatchEvent(new Event(EVENT))
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb)
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  mq.addEventListener('change', cb)
  return () => { window.removeEventListener(EVENT, cb); mq.removeEventListener('change', cb) }
}

export const useThemePref = (): ThemePref => useSyncExternalStore(subscribe, getThemePref, () => 'auto' as ThemePref)
export const useIsDark = (): boolean => useSyncExternalStore(subscribe, isDarkNow, () => false)
