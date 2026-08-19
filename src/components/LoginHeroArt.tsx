export function LoginHeroArt() {
  return (
    <svg className="t2s-hero-art" viewBox="0 0 560 360" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="t2sGrid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#93c5fd" stopOpacity="0.35" />
          <stop offset="1" stopColor="#dbeafe" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="t2sBlueBody" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#60a5fa" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
        <linearGradient id="t2sGoldBody" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f5d76e" />
          <stop offset="1" stopColor="#b8860b" />
        </linearGradient>
      </defs>
      <path d="M40 300 L280 220 L520 300 L520 360 L40 360 Z" fill="url(#t2sGrid)" />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <path
          key={i}
          d={`M${80 + i * 60} 360 L280 ${228 + i * 8}`}
          stroke="#93c5fd"
          strokeOpacity="0.45"
        />
      ))}
      <path d="M40 300 L280 220 L520 300" stroke="#93c5fd" strokeWidth="2" />
      <g transform="translate(168 86)">
        <rect x="8" y="86" width="14" height="46" rx="2" fill="#2563eb" />
        <rect x="30" y="70" width="14" height="62" rx="2" fill="#3b82f6" />
        <rect x="52" y="54" width="14" height="78" rx="2" fill="#2563eb" />
        <rect x="74" y="38" width="14" height="94" rx="2" fill="#1d4ed8" />
        <rect x="96" y="22" width="14" height="110" rx="2" fill="#2563eb" />
        <rect x="118" y="8" width="14" height="124" rx="2" fill="#1d4ed8" />
        <path d="M14 80 L36 64 L58 48 L80 32 L102 18 L150 2" stroke="#2563eb" strokeWidth="4" fill="none" strokeLinecap="round" />
        <polygon points="150,2 132,14 148,22" fill="#2563eb" />
      </g>
      <g transform="translate(70 168)">
        <ellipse cx="88" cy="138" rx="78" ry="14" fill="#bfdbfe" />
        <path d="M48 118 C28 96 36 64 70 58 C78 34 118 28 132 52 C168 48 186 78 170 104 C186 122 168 146 128 148 C92 156 52 142 48 118 Z" fill="url(#t2sBlueBody)" />
        <path d="M70 70 L42 28 L62 40 L70 18 L86 48" fill="#1e40af" />
        <path d="M132 70 L158 24 L146 44 L176 40 L140 78" fill="#1e40af" />
        <circle cx="118" cy="86" r="5" fill="#0f172a" />
        <path d="M128 98 C140 104 148 112 146 118" stroke="#1e3a8a" strokeWidth="3" fill="none" />
        <path d="M48 118 L18 132 L48 128" fill="#1d4ed8" />
        <path d="M170 112 L208 118 L168 124" fill="#1d4ed8" />
      </g>
      <g transform="translate(286 176)">
        <ellipse cx="96" cy="132" rx="74" ry="13" fill="#fde68a" opacity="0.7" />
        <path d="M40 108 C28 78 58 48 92 58 C104 28 156 36 160 68 C196 70 210 104 188 122 C204 146 170 160 128 154 C78 160 44 138 40 108 Z" fill="url(#t2sGoldBody)" />
        <path d="M92 62 L78 18 L96 40 L112 10 L116 52" fill="#92400e" />
        <circle cx="148" cy="88" r="5" fill="#0f172a" />
        <path d="M158 102 C172 112 176 124 168 130" stroke="#92400e" strokeWidth="3" fill="none" />
        <path d="M52 128 C36 148 28 168 48 172 C70 176 86 156 88 140" fill="#b45309" />
        <path d="M40 112 L8 128 L42 122" fill="#b45309" />
        <path d="M188 118 L226 108 L186 128" fill="#b45309" />
      </g>
    </svg>
  );
}
