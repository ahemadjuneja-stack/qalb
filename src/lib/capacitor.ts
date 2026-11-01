// Qalb — Capacitor native-platform helper
// (pehle downloads.ts me rehta tha — downloads feature remove hone ke
// baad bhi OTA updater + profile isko use karte hain, isliye alag lib)

export function isNativeCapacitor(): boolean {
  if (typeof window === 'undefined') return false
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor
  return Boolean(cap?.isNativePlatform?.())
}
