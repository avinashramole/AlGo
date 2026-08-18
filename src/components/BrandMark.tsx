const svgSize = {
  sm: "mx-auto h-[108px] w-full max-w-[160px]",
  md: "mx-auto h-[168px] w-full max-w-[220px]",
  lg: "mx-auto mb-2 h-48 w-full max-w-[280px] sm:h-56",
};

export function BrandMark({ className = "", size = "lg" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  return (
    <div className={className}>
      <svg viewBox="0 0 520 500" className={svgSize[size]} role="img" aria-label="Trade 2 Smart">
        <defs>
          <linearGradient id="t2s-blue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8fd0ff" />
            <stop offset="50%" stopColor="#2f7bff" />
            <stop offset="100%" stopColor="#163dcc" />
          </linearGradient>
          <linearGradient id="t2s-silver" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="55%" stopColor="#d7dee8" />
            <stop offset="100%" stopColor="#9aa6b5" />
          </linearGradient>
          <linearGradient id="t2s-green" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e7ff8a" />
            <stop offset="50%" stopColor="#b6ff3c" />
            <stop offset="100%" stopColor="#6fbf12" />
          </linearGradient>
          <linearGradient id="t2s-arc" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#2f7bff" />
            <stop offset="100%" stopColor="#b6ff3c" />
          </linearGradient>
          <filter id="t2s-glow" x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle
          cx="260"
          cy="148"
          r="116"
          fill="none"
          stroke="url(#t2s-arc)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray="620 110"
          strokeDashoffset="70"
          transform="rotate(-28 260 148)"
          filter="url(#t2s-glow)"
        />
        <polygon points="368,58 402,42 372,86" fill="#b6ff3c" filter="url(#t2s-glow)" />

        <g fill="#b6ff3c" filter="url(#t2s-glow)">
          <rect x="232" y="62" width="9" height="26" rx="1.5" />
          <rect x="230" y="68" width="13" height="3.5" rx="1" />
          <rect x="230" y="80" width="13" height="3.5" rx="1" />
          <rect x="250" y="50" width="9" height="38" rx="1.5" />
          <rect x="248" y="56" width="13" height="3.5" rx="1" />
          <rect x="248" y="80" width="13" height="3.5" rx="1" />
          <rect x="268" y="38" width="9" height="50" rx="1.5" />
          <rect x="266" y="44" width="13" height="3.5" rx="1" />
          <rect x="266" y="80" width="13" height="3.5" rx="1" />
          <rect x="286" y="26" width="9" height="62" rx="1.5" />
          <rect x="284" y="32" width="13" height="3.5" rx="1" />
          <rect x="284" y="80" width="13" height="3.5" rx="1" />
        </g>

        <text x="262" y="188" textAnchor="middle" fontFamily="Inter, Arial, sans-serif" fontSize="88" fontWeight="800" letterSpacing="-2">
          <tspan fill="url(#t2s-blue)">T</tspan>
          <tspan fill="url(#t2s-silver)">2</tspan>
          <tspan fill="url(#t2s-green)">S</tspan>
        </text>

        <text x="260" y="338" textAnchor="middle" fontFamily="Inter, Arial, sans-serif" fontSize="34" fontWeight="800" letterSpacing="5">
          <tspan fill="#f4f7fb">TRADE </tspan>
          <tspan fill="#2f7bff">2 </tspan>
          <tspan fill="#b6ff3c">SMART</tspan>
        </text>
        <line x1="78" y1="368" x2="168" y2="368" stroke="#2f7bff" strokeWidth="2" />
        <line x1="352" y1="368" x2="442" y2="368" stroke="#b6ff3c" strokeWidth="2" />
        <text x="260" y="376" textAnchor="middle" fill="#f4f7fb" fontFamily="Inter, Arial, sans-serif" fontSize="15">
          Intelligence Behind Every Trade.
        </text>
      </svg>
    </div>
  );
}
