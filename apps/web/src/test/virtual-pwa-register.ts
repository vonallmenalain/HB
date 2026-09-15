/**
 * Ersatz für das virtuelle Modul `virtual:pwa-register`, das sonst vom
 * vite-plugin-pwa bereitgestellt wird. Im Test läuft das Plugin nicht mit –
 * es würde bei jedem Testlauf einen Service Worker bauen.
 */
export function registerSW(): (reloadPage?: boolean) => Promise<void> {
  return () => Promise.resolve()
}
