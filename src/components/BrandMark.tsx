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
const LIME = "#84FF3D";
const WHITE = "#FFFFFF";

export function BrandMark({
  variant = "stacked",
  size = "md",
  theme = "dark",
  className = "",
  showWordmark = "responsive",
  plate = false,
}: Props) {
  const uid = useId().replace(/:/g, "");

  if (variant === "emblem") {
    const box = size === "sm" ? "h-8 w-8" : size === "lg" ? "h-12 w-12" : "h-10 w-10";
    return (
      <span className={className}>
        <T2SLetters id={uid} className={box} />
      </span>
    );
  }

  if (variant === "horizontal") {
    const nameSize = size === "sm" ? "text-[11px]" : size === "lg" ? "text-[17px]" : "text-[13px]";
    const trade = theme === "light" ? "#111827" : WHITE;
    const box = size === "sm" ? "h-9 w-9" : size === "lg" ? "h-14 w-14" : "h-11 w-11";
    return (
      <span className={`inline-flex items-center gap-2.5 ${className}`}>
        <T2SLetters id={uid} className={`shrink-0 ${box}`} />
        <span className={`min-w-0 leading-tight ${showWordmark === "always" ? "block" : "hidden sm:block"}`}>
          <Wordmark className={nameSize} trade={trade} />
          <span className={`mt-0.5 hidden font-medium uppercase tracking-[0.12em] text-[8px] lg:block`} style={{ color: theme === "light" ? "#64748b" : "#cbd5e1" }}>
            Intelligence Behind Every Trade.
          </span>
        </span>
      </span>
    );
  }

  const chart = size === "sm" ? "h-14 w-20" : size === "lg" ? "h-24 w-36" : "h-20 w-28";
  const letters = size === "sm" ? "h-12 w-28" : size === "lg" ? "h-[72px] w-[220px]" : "h-16 w-44";
  const nameSize = size === "sm" ? "text-[16px]" : size === "lg" ? "text-[28px]" : "text-[20px]";
  const lockup = (
    <span className={`flex flex-col items-center text-center ${className}`}>
      <ChartGlyph id={uid} className={chart} />
      <T2SLetters id={`${uid}l`} className={`${letters} mt-1`} />
      <Wordmark className={`mt-3 ${nameSize}`} trade={WHITE} />
      <Tagline className="mt-3" />
    </span>
  );

  if (!plate) return lockup;
  return <span className={`t2s-logo-plate t2s-logo-plate-${size}`}>{lockup}</span>;
}

function Wordmark({ className, trade }: { className?: string; trade: string }) {
  return (
    <span className={`block font-extrabold uppercase tracking-[0.18em] ${className || ""}`}>
      <span style={{ color: trade }}>TRADE </span>
      <span style={{ color: BLUE }}>2 </span>
      <span style={{ color: GREEN }}>SMART</span>
    </span>
  );
}

function Tagline({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className || ""}`}>
      <span className="font-black tracking-tighter" style={{ color: BLUE }}>
        //
      </span>
      <span className="whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.16em] text-white">
        Intelligence Behind Every Trade.
      </span>
      <span className="font-black tracking-tighter" style={{ color: GREEN }}>
        //
      </span>
    </span>
  );
}

function ChartGlyph({ id, className }: { id: string; className?: string }) {
  const ring = `${id}-arc`;
  return (
    <svg viewBox="0 0 180 110" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={ring} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor={BLUE} />
          <stop offset="100%" stopColor={LIME} />
        </linearGradient>
      </defs>
      <path d="M18 92 A 78 78 0 0 1 162 28" fill="none" stroke={`url(#${ring})`} strokeWidth="10" strokeLinecap="round" />
      <path d="M150 34 L168 12" stroke={LIME} strokeWidth="10" strokeLinecap="round" />
      <polygon points="156,6 176,10 164,32" fill={LIME} />
      <g fill={GREEN}>
        <rect x="62" y="58" width="12" height="22" rx="2" />
        <rect x="82" y="46" width="12" height="34" rx="2" />
        <rect x="102" y="34" width="12" height="46" rx="2" />
      </g>
    </svg>
  );
}

function T2SLetters({ id, className }: { id: string; className?: string }) {
  const tFill = `${id}-t`;
  const twoFill = `${id}-two`;
  const sFill = `${id}-s`;
  return (
    <svg viewBox="0 0 280 120" className={className} role="img" aria-label="T2S">
      <defs>
        <linearGradient id={tFill} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#7DD3FF" />
          <stop offset="100%" stopColor={BLUE} />
        </linearGradient>
        <linearGradient id={twoFill} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#94A3B8" />
        </linearGradient>
        <linearGradient id={sFill} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor={LIME} />
          <stop offset="100%" stopColor={GREEN} />
        </linearGradient>
      </defs>
      <text
        x="8"
        y="96"
        fontFamily="Inter, Arial Black, sans-serif"
        fontStyle="italic"
        fontWeight="800"
        fontSize="100"
        fill={`url(#${tFill})`}
      >
        T
      </text>
      <text
        x="108"
        y="92"
        fontFamily="Inter, Arial Black, sans-serif"
        fontStyle="italic"
        fontWeight="800"
        fontSize="72"
        fill={`url(#${twoFill})`}
      >
        2
      </text>
      <text
        x="168"
        y="96"
        fontFamily="Inter, Arial Black, sans-serif"
        fontStyle="italic"
        fontWeight="800"
        fontSize="100"
        fill={`url(#${sFill})`}
      >
        S
      </text>
    </svg>
  );
}
