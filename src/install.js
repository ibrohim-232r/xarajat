// Установка приложения (PWA). Событие beforeinstallprompt приходит рано, поэтому слушаем его с самого старта.
import { useEffect, useState } from 'react'

let deferred = null
const subs = new Set()
const emit = () => subs.forEach(f => f())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; emit() })
  window.addEventListener('appinstalled', () => { deferred = null; emit() })
}

export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export async function installApp() {
  if (!deferred) return false
  deferred.prompt()
  const r = await deferred.userChoice.catch(() => null)
  deferred = null; emit()
  return !!r && r.outcome === 'accepted'
}

// { standalone, canPrompt, ios } - обновляется сам
export function useInstall() {
  const [, tick] = useState(0)
  useEffect(() => { const f = () => tick(n => n + 1); subs.add(f); return () => subs.delete(f) }, [])
  return { standalone: isStandalone(), canPrompt: !!deferred, ios: isIOS() }
}
