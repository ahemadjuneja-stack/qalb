'use client'

// Qalb — Square (1:1) Thumbnail with YouTube letterbox-bar crop
// ─────────────────────────────────────────────────────────────────
// User requirement: "Thumbnails 1:1 me bade nazar aane chahiye."
//
// hqdefault.jpg (480×360) me 16:9 videos ke upar/neeche BLACK BARS hote
// hain (asli video content 480×270 center me hai). Ye component image ko
// 133.33% scale karke center-align karta hai → bars crop ho jaate hain aur
// 1:1 square me sirf paak content dikhta hai (Spotify album-art feel).
//
// Kisi bhi size me use ho sakta hai: className="h-14 w-14" / full width.

export function QalbThumb({
  src,
  alt = '',
  className = '',
  rounded = 'rounded-lg',
  fallbackEmoji = '🕌',
}: {
  src: string | null | undefined
  alt?: string
  className?: string // size classes — hamesha square (h-14 w-14 / aspect-square)
  rounded?: string
  fallbackEmoji?: string
}) {
  return (
    <span
      className={`relative block shrink-0 overflow-hidden bg-emerald-950 ${rounded} ${className}`}
      aria-hidden={alt === '' ? true : undefined}
    >
      {src ? (
        // 480×360 → bars (top/bottom 12.5% each) hatao: height 133.33%,
        // center align → square me sirf central 16:9 content dikhta hai
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="absolute left-1/2 top-1/2 h-[133.33%] w-auto max-w-none min-w-full -translate-x-1/2 -translate-y-1/2 object-cover"
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center">{fallbackEmoji}</span>
      )}
    </span>
  )
}
