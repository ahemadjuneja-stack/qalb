'use client'

// Qalb — Animated brand logo (header)
// Uploaded logo jaisa: red glowing heart (jo "Q" banta hai) + EKG heartbeat
// line + "ALB" serif wordmark gold edge ke sath + twinkling sparkles.
//
// PERF: saari animations pure CSS hain (globals.css → qalb-* keyframes) —
// sirf transform/opacity/stroke-dashoffset animate hote hain (compositor
// friendly, koi JS animation loop nahi) → scroll/interaction pe koi jank nahi.

const HEART_EKG = 'M0 50 H40 L48 38 L56 50 H64 L72 26 L82 66 L90 50 H122'

const SPARK =
  'M0 -7 C0.9 -1.8 1.8 -0.9 7 0 C1.8 0.9 0.9 1.8 0 7 C-0.9 1.8 -1.8 0.9 -7 0 C-1.8 -0.9 -0.9 -1.8 0 -7 Z'

export function QalbLogo({ className = 'h-12 w-auto' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 110"
      className={className}
      role="img"
      aria-label="Qalb"
      fill="none"
    >
      <defs>
        <linearGradient id="qalbRed" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--qalb-red-c)" />
          <stop offset="0.55" stopColor="var(--qalb-red-b)" />
          <stop offset="1" stopColor="var(--qalb-red-a)" />
        </linearGradient>
        <radialGradient id="qalbGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--qalb-red-b)" stopOpacity="0.5" />
          <stop offset="0.7" stopColor="var(--qalb-red-b)" stopOpacity="0.14" />
          <stop offset="1" stopColor="var(--qalb-red-b)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* heart ke peeche red glow — heartbeat rhythm pe pulse karta hai */}
      <ellipse
        cx="62"
        cy="52"
        rx="66"
        ry="58"
        fill="url(#qalbGlow)"
        className="qalb-glow-pulse"
      />

      {/* heart = Q (dil ki beat pe thoda sa dilation/construction hota hai) */}
      <g className="qalb-beat">
        <path
          d="M62 96 C30 72 12 52 12 34 C12 18 24 8 38 8 C48 8 57 13 62 22 C67 13 76 8 86 8 C100 8 112 18 112 34 C112 52 94 72 62 96 Z"
          fill="rgba(230,57,70,0.10)"
          stroke="url(#qalbRed)"
          strokeWidth="7"
          strokeLinejoin="round"
        />
        {/* Q ki tail */}
        <path
          d="M88 78 L104 96"
          stroke="url(#qalbRed)"
          strokeWidth="7"
          strokeLinecap="round"
        />
      </g>

      {/* EKG base line — halki si static */}
      <path
        d={HEART_EKG}
        stroke="var(--qalb-ekg)"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.45"
      />
      {/* EKG travelling pulse — bright dash jo line pe daudta hai */}
      <path
        d={HEART_EKG}
        stroke="var(--qalb-ekg-pulse)"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="24 200"
        className="qalb-ekg-pulse"
      />

      {/* ALB wordmark — serif red, gold edge (paint-order: stroke) */}
      <text
        x="122"
        y="84"
        fontFamily="Georgia, 'Times New Roman', 'Noto Serif', serif"
        fontSize="82"
        fontWeight="700"
        letterSpacing="2"
        fill="url(#qalbRed)"
        stroke="var(--gold)"
        strokeWidth="1.5"
        paintOrder="stroke"
      >
        ALB
      </text>

      {/* sparkles — staggered twinkle */}
      <path
        d={SPARK}
        fill="var(--gold)"
        opacity="0.9"
        className="qalb-spark"
        style={{ animationDelay: '0s' }}
        transform="translate(14 12) scale(0.75)"
      />
      <path
        d={SPARK}
        fill="var(--qalb-ekg)"
        opacity="0.85"
        className="qalb-spark"
        style={{ animationDelay: '0.7s' }}
        transform="translate(118 16) scale(0.55)"
      />
      <path
        d={SPARK}
        fill="var(--gold)"
        opacity="0.8"
        className="qalb-spark"
        style={{ animationDelay: '1.4s' }}
        transform="translate(104 92) scale(0.5)"
      />
      <path
        d={SPARK}
        fill="var(--qalb-ekg)"
        opacity="0.7"
        className="qalb-spark"
        style={{ animationDelay: '2.1s' }}
        transform="translate(4 80) scale(0.45)"
      />
    </svg>
  )
}
