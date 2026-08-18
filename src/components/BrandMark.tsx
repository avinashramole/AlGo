import { useId } from "react";

/** stacked — official lockup; horizontal — header; emblem — sidebar / tab */
export type BrandVariant = "stacked" | "horizontal" | "emblem";

type Props = {
  variant?: BrandVariant;
  size?: "sm" | "md" | "lg";
  theme?: "dark" | "light";
  className?: string;
  showWordmark?: "always" | "responsive";
  plate?: boolean;
};

const BLUE = "#2F7BFF";
const GREEN = "#22C55E";
const LIME = "#9AFF3D";
const WHITE = "#F4F7FB";

export function BrandMark({
  variant = "stacked",
  size = "md",
  theme = "dark",
  className = "",
  showWordmark = "responsive",
}: Props) {
  const uid = useId().replace(/:/g, "");

  if (variant === "emblem") {
    const box = size === "sm" ? "h-8 w-8" : size === "lg" ? "h-12 w-12" : "h-10 w-10";
    return (
      <span className={className}>
        <EmblemSvg id={uid} className={box} />
      </span>
    );
  }

  if (variant === "horizontal") {
    const nameSize = size === "sm" ? "text-[11px]" : size === "lg" ? "text-[16px]" : "text-[13px]";
    const trade = theme === "light" ? "#111827" : WHITE;
    const box = size === "sm" ? "h-9 w-9" : size === "lg" ? "h-12 w-12" : "h-10 w-10";
    return (
      <span className={`inline-flex items-center gap-2.5 ${className}`}>
        <EmblemSvg id={uid} className={`shrink-0 ${box}`} />
        <span className={`min-w-0 leading-tight ${showWordmark === "always" ? "block" : "hidden sm:block"}`}>
          <span className={`block font-extrabold uppercase tracking-[0.16em] ${nameSize}`}>
            <span style={{ color: trade }}>TRADE </span>
            <span style={{ color: BLUE }}>2 </span>
            <span style={{ color: GREEN }}>SMART</span>
          </span>
        </span>
      </span>
    );
  }

  const box = size === "sm" ? "w-[220px]" : size === "lg" ? "w-[320px]" : "w-[280px]";
  return <LockupSvg id={uid} className={`${box} ${className}`} />;
}

function LockupSvg({ id, className }: { id: string; className?: string }) {
  return (
    <svg viewBox="0 0 400 430" className={className} role="img" aria-label="Trade 2 Smart">
      <rect width="400" height="430" rx="48" fill="#05070c" />
      <g transform="translate(40 8)">{EmblemArt(id)}</g>
      <text
        x="200"
        y="338"
        textAnchor="middle"
        fontFamily="Inter, Arial Black, sans-serif"
        fontStyle="italic"
        fontWeight="800"
        fontSize="28"
        letterSpacing="3"
      >
        <tspan fill={WHITE}>TRADE </tspan>
        <tspan fill={BLUE}>2 </tspan>
        <tspan fill={GREEN}>SMART</tspan>
      </text>
      <text x="78" y="384" fill={BLUE} fontFamily="Inter, Arial, sans-serif" fontWeight="800" fontSize="16">
        //
      </text>
      <text
        x="200"
        y="384"
        textAnchor="middle"
        fill={WHITE}
        fontFamily="Inter, Arial, sans-serif"
        fontWeight="600"
        fontSize="11"
        letterSpacing="2.2"
      >
        INTELLIGENCE BEHIND EVERY TRADE.
      </text>
      <text x="308" y="384" fill={GREEN} fontFamily="Inter, Arial, sans-serif" fontWeight="800" fontSize="16">
        //
      </text>
    </svg>
  );
}

function EmblemSvg({ id, className }: { id: string; className?: string }) {
  return (
    <svg viewBox="0 0 320 300" className={className} role="img" aria-label="T2S">
      {EmblemArt(id)}
    </svg>
  );
}

function EmblemArt(id: string) {
  const ring = `${id}-ring`;
  const tFill = `${id}-t`;
  const twoFill = `${id}-two`;
  const sFill = `${id}-s`;
  const shadow = `${id}-shadow`;
  return (
    <>
      <defs>
        <linearGradient id={ring} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#1D4ED8" />
          <stop offset="45%" stopColor={BLUE} />
          <stop offset="100%" stopColor={LIME} />
        </linearGradient>
        <linearGradient id={tFill} x1="0.15" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#7DD3FF" />
          <stop offset="55%" stopColor={BLUE} />
          <stop offset="100%" stopColor="#1D4ED8" />
        </linearGradient>
        <linearGradient id={twoFill} x1="0" y1="0" x2="0.2" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="40%" stopColor="#E2E8F0" />
          <stop offset="100%" stopColor="#94A3B8" />
        </linearGradient>
        <linearGradient id={sFill} x1="0.15" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#E8FF7A" />
          <stop offset="45%" stopColor={LIME} />
          <stop offset="100%" stopColor="#16A34A" />
        </linearGradient>
        <filter id={shadow} x="-15%" y="-15%" width="130%" height="140%">
          <feDropShadow dx="3" dy="5" stdDeviation="2" floodColor="#000" floodOpacity="0.55" />
        </filter>
      </defs>

      <path
        d="M 62 214 A 118 118 0 1 1 258 52"
        fill="none"
        stroke={`url(#${ring})`}
        strokeWidth="16"
        strokeLinecap="round"
      />
      <path d="M246 62 L292 18" stroke={LIME} strokeWidth="16" strokeLinecap="round" />
      <polygon points="272,4 312,12 284,44" fill={LIME} />

      <g fill={GREEN}>
        <line x1="112" y1="48" x2="112" y2="92" stroke={GREEN} strokeWidth="3" />
        <rect x="104" y="60" width="16" height="24" rx="2" />
        <line x1="140" y1="38" x2="140" y2="92" stroke={GREEN} strokeWidth="3" />
        <rect x="131" y="50" width="18" height="34" rx="2" />
        <line x1="170" y1="28" x2="170" y2="92" stroke={GREEN} strokeWidth="3" />
        <rect x="161" y="40" width="18" height="44" rx="2" />
        <line x1="200" y1="22" x2="200" y2="92" stroke={GREEN} strokeWidth="3" />
        <rect x="191" y="32" width="18" height="52" rx="2" />
      </g>

      <g
        filter={`url(#${shadow})`}
        fontFamily="Inter, Arial Black, sans-serif"
        fontStyle="italic"
        fontWeight="800"
      >
        <text x="58" y="198" fontSize="108" fill={`url(#${tFill})`}>
          T
        </text>
        <text x="148" y="190" fontSize="74" fill={`url(#${twoFill})`}>
          2
        </text>
        <text x="198" y="198" fontSize="108" fill={`url(#${sFill})`}>
          S
        </text>
      </g>
    </>
  );
}
