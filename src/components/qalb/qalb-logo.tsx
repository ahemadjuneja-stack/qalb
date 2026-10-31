'use client'

// Qalb — Animated brand logo (header) — v0.5.3 BANNER DESIGN
// ─────────────────────────────────────────────────────────────────
// User ke diye gaye QALB banner jaisa:
//   • GOLD heart (metallic gradient) + PEARL-white inner heart
//   • Center me gold PLAY button
//   • ECG heartbeat line dil ke through — bright pulse daudti rehti hai
//   • Upar chhota GOLD masjid dome + finial
//   • "QALB" pearl-white serif wordmark, gold outline
//   • Sparkles twinkle + dil beat hota hai
//
// PERF: saari animations pure CSS (globals.css → qalb-* keyframes) —
// sirf transform/opacity/stroke-dashoffset animate hote hain →
// Android WebView par bhi 60fps, koi jank nahi.

const HEART_EKG = 'M8 58 H40 L48 48 L54 58 H60 L66 38 L74 72 L80 58 H116'

const SPARK =
  'M0 -7 C0.9 -1.8 1.8 -0.9 7 0 C1.8 0.9 0.9 1.8 0 7 C-0.9 1.8 -1.8 0.9 -7 0 C-1.8 -0.9 -0.9 -1.8 0 -7 Z'

export function QalbLogo({ className = 'h-12 w-auto' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 340 116"
      className={className}
      role="img"
      aria-label="Qalb"
      fill="none"
    >
      <defs>
        {/* metallic gold — banner ke heart jaisa */}
        <linearGradient id="qalbGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--qalb-gold-c)" />
          <stop offset="0.5" stopColor="var(--qalb-gold-b)" />
          <stop offset="1" stopColor="var(--qalb-gold-a)" />
        </linearGradient>
        {/* pearl white — inner heart + wordmark */}
        <linearGradient id="qalbPearl" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--qalb-pearl-c)" />
          <stop offset="0.6" stopColor="var(--qalb-pearl-b)" />
          <stop offset="1" stopColor="var(--qalb-pearl-a)" />
        </linearGradient>
        <radialGradient id="qalbGlowG" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--qalb-gold-b)" stopOpacity="0.45" />
          <stop offset="0.7" stopColor="var(--qalb-gold-b)" stopOpacity="0.12" />
          <stop offset="1" stopColor="var(--qalb-gold-b)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* heart ke peeche golden glow — heartbeat rhythm par pulse */}
      <ellipse
        cx="62"
        cy="60"
        rx="68"
        ry="58"
        fill="url(#qalbGlowG)"
        className="qalb-glow-pulse"
      />

      {/* EKG base line — halki gold, dil ke through */}
      <path
        d={HEART_EKG}
        pathLength={196}
        stroke="var(--qalb-ekg)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.5"
      />
      {/* EKG travelling pulse — bright dash line par daudta hai */}
      <path
        d={HEART_EKG}
        pathLength={196}
        stroke="var(--qalb-ekg-pulse)"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="24 200"
        className="qalb-ekg-pulse"
      />

      {/* masjid dome — heart ke upar, base heart ke peeche chhupta hai */}
      <g className="qalb-beat">
        <path
          d="M62 8 C56 14 51 20 51 26 C51 30 55 32 62 32 C69 32 73 30 73 26 C73 20 68 14 62 8 Z"
          fill="url(#qalbGold)"
        />
        <path
          d="M62 8 L62 3"
          stroke="var(--qalb-gold-b)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="62" cy="2.2" r="1.6" fill="var(--qalb-gold-c)" />
      </g>

      {/* GOLD heart + pearl inner + play button — dil ki beat par dhadakta hai */}
      <g className="qalb-beat">
        {/* outer gold heart */}
        <path
          d="M62 100 C30 76 12 56 12 38 C12 22 24 12 38 12 C48 12 57 17 62 26 C67 17 76 12 86 12 C100 12 112 22 112 38 C112 56 94 76 62 100 Z"
          fill="rgba(212, 175, 55, 0.14)"
          stroke="url(#qalbGold)"
          strokeWidth="7"
          strokeLinejoin="round"
        />
        {/* pearl inner heart */}
        <path
          d="M62 88 C38 69 22 54 22 41 C22 30 31 24 40 24 C47 24 53 27 62 38 C71 27 77 24 84 24 C93 24 102 30 102 41 C102 54 86 69 62 88 Z"
          fill="url(#qalbPearl)"
          opacity="0.95"
        />
        {/* EKG pearl heart ke andar (chhoti line) */}
        <path
          d="M30 56 H46 L52 47 L57 56 H67 L72 40 L78 62 L83 56 H94"
          pathLength={196}
          stroke="var(--qalb-ekg)"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.8"
        />
        {/* gold play button — center */}
        <path
          d="M58 44 L58 68 L80 56 Z"
          fill="url(#qalbGold)"
          stroke="var(--qalb-gold-a)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* Q tail — dil ke neeche flourish */}
        <path
          d="M84 86 L98 101"
          stroke="url(#qalbGold)"
          strokeWidth="6.5"
          strokeLinecap="round"
        />
      </g>

      {/* QALB wordmark — pearl white serif + gold outline (banner jaisa) */}
      <text
        x="122"
        y="88"
        fontFamily="Georgia, 'Times New Roman', 'Noto Serif', serif"
        fontSize="72"
        fontWeight="700"
        letterSpacing="1.5"
        fill="url(#qalbPearl)"
        stroke="var(--qalb-gold-b)"
        strokeWidth="2"
        paintOrder="stroke"
      >
        QALB
      </text>

      {/* sparkles — staggered twinkle */}
      <path
        d={SPARK}
        fill="var(--qalb-gold-c)"
        opacity="0.9"
        className="qalb-spark"
        style={{ animationDelay: '0s' }}
        transform="translate(16 14) scale(0.75)"
      />
      <path
        d={SPARK}
        fill="var(--qalb-pearl-b)"
        opacity="0.85"
        className="qalb-spark"
        style={{ animationDelay: '0.7s' }}
        transform="translate(114 18) scale(0.55)"
      />
      <path
        d={SPARK}
        fill="var(--qalb-gold-c)"
        opacity="0.8"
        className="qalb-spark"
        style={{ animationDelay: '1.4s' }}
        transform="translate(104 96) scale(0.5)"
      />
      <path
        d={SPARK}
        fill="var(--qalb-pearl-b)"
        opacity="0.7"
        className="qalb-spark"
        style={{ animationDelay: '2.1s' }}
        transform="translate(6 84) scale(0.45)"
      />
    </svg>
  )
}
