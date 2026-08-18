import { useId } from "react";

/** stacked — login; horizontal — header; emblem — sidebar / tab */
export type BrandVariant = "stacked" | "horizontal" | "emblem";

type Props = {
  variant?: BrandVariant;
  size?: "sm" | "md" | "lg";
  theme?: "dark" | "light";
  className?: string;
  showWordmark?: "always" | "responsive";
  align?: "start" | "center";
};

const emblemBox: Record<BrandVariant, Record<NonNullable<Props["size"]>, string>> = {
  stacked: { sm: "h-[100px] w-[100px]", md: "h-[148px] w-[148px]", lg: "h-[176px] w-[176px]" },
  horizontal: { sm: "h-9 w-9", md: "h-11 w-11", lg: "h-14 w-14" },
  emblem: { sm: "h-8 w-8", md: "h-10 w-10", lg: "h-12 w-12" },
};

const BLUE = "#007BFF";
const GREEN = "#32CD32";
const LIME = "#ADFF2F";

export function BrandMark({
  variant = "stacked",
  size = "md",
  theme = "dark",
  className = "",
  showWordmark = "responsive",
  align = "center",
}: Props) {
  const uid = useId().replace(/:/g, "");
  const ink = theme === "light" ? "#1e293b" : "#e8eef5";
  const tag = theme === "light" ? "#334155" : "#f8fafc";

  if (variant === "emblem") {
    return (
      <span className={className}>
        <EmblemSvg id={uid} className={emblemBox.emblem[size]} />
      </span>
    );
  }

  if (variant === "horizontal") {
    const nameSize = size === "sm" ? "text-[11px]" : size === "lg" ? "text-[17px]" : "text-[13px]";
    const tagSize = size === "sm" ? "text-[7px]" : "text-[8px]";
    return (
      <span className={`inline-flex items-center gap-2.5 ${className}`}>
        <EmblemSvg id={uid} className={`shrink-0 ${emblemBox.horizontal[size]}`} />
        <span className={`min-w-0 leading-tight ${showWordmark === "always" ? "block" : "hidden sm:block"}`}>
          <Wordmark className={nameSize} ink={ink} />
          <span className={`mt-0.5 block font-semibold uppercase tracking-[0.14em] ${showWordmark === "always" ? "" : "hidden lg:block"} ${tagSize}`} style={{ color: tag }}>
            Intelligence <span style={{ color: GREEN }}>Behind</span> Every Trade.
          </span>
        </span>
      </span>
    );
  }

  const nameSize = size === "sm" ? "text-lg" : size === "lg" ? "text-[28px]" : "text-[22px]";
  const stackedAlign = align === "start" ? "items-start text-left" : "items-center text-center";
  return (
    <span className={`flex flex-col ${stackedAlign} ${className}`}>
      <EmblemSvg id={uid} className={emblemBox.stacked[size]} />
      <Wordmark className={`mt-3 ${nameSize}`} ink={ink} />
      <Tagline id={uid} className="mt-2.5" color={tag} wide={size === "lg"} />
    </span>
  );
}

function Wordmark({ className, ink }: { className?: string; ink: string }) {
  return (
    <span className={`block font-black italic tracking-[0.12em] ${className || ""}`} style={{ textShadow: "0 2px 0 rgba(15,23,42,0.18)" }}>
      <span style={{ color: ink }}>TRADE </span>
      <span style={{ color: BLUE }}>2 </span>
      <span style={{ color: GREEN }}>SMART</span>
    </span>
  );
}

function Tagline({ id, className, color, wide }: { id: string; className?: string; color: string; wide?: boolean }) {
  const bar = `${id}-bar`;
  const w = wide ? 22 : 16;
  return (
    <span className={`flex flex-col items-center ${className || ""}`}>
      <span className="inline-flex items-center gap-2">
        <SlantLines color={BLUE} width={w} />
        <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color }}>
          Intelligence <span style={{ color: GREEN }}>Behind</span> Every Trade.
        </span>
        <SlantLines color={GREEN} width={w} />
      </span>
      <svg className="mt-1.5 w-full max-w-[320px]" height="3" viewBox="0 0 320 3" aria-hidden="true">
        <defs>
          <linearGradient id={bar} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={BLUE} />
            <stop offset="100%" stopColor={LIME} />
          </linearGradient>
        </defs>
        <line x1="8" y1="1.5" x2="312" y2="1.5" stroke={`url(#${bar})`} strokeWidth="2" />
      </svg>
    </span>
  );
}

function SlantLines({ color, width }: { color: string; width: number }) {
  return (
    <svg width={width} height="12" viewBox="0 0 22 12" aria-hidden="true">
      <line x1="1" y1="11" x2="12" y2="1" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      <line x1="9" y1="11" x2="20" y2="1" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function EmblemSvg({ id, className }: { id: string; className?: string }) {
  const ring = `${id}-ring`;
  const tFill = `${id}-t`;
  const twoFill = `${id}-two`;
  const sFill = `${id}-s`;
  const shadow = `${id}-shadow`;
  return (
    <svg viewBox="0 0 280 250" className={className} role="img" aria-label="Trade 2 Smart">
      <defs>
        <linearGradient id={ring} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#0057D9" />
          <stop offset="42%" stopColor={BLUE} />
          <stop offset="70%" stopColor={GREEN} />
          <stop offset="100%" stopColor={LIME} />
        </linearGradient>
        <linearGradient id={tFill} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#7DD3FF" />
          <stop offset="40%" stopColor="#00D4FF" />
          <stop offset="100%" stopColor="#0057D9" />
        </linearGradient>
        <linearGradient id={twoFill} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="35%" stopColor="#F8FAFC" />
          <stop offset="68%" stopColor="#94A3B8" />
          <stop offset="100%" stopColor="#E2E8F0" />
        </linearGradient>
        <linearGradient id={sFill} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#F7FF9A" />
          <stop offset="38%" stopColor={LIME} />
          <stop offset="100%" stopColor="#15803D" />
        </linearGradient>
        <filter id={shadow} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="2" dy="5" stdDeviation="2.4" floodColor="#000000" floodOpacity="0.4" />
        </filter>
      </defs>

      <path
        d="M 104 227 A 100 100 0 1 1 180 43"
        fill="none"
        stroke={`url(#${ring})`}
        strokeWidth="14"
        strokeLinecap="round"
      />
      <path d="M176 48 L232 10" stroke={LIME} strokeWidth="14" strokeLinecap="round" />
      <polygon points="214,2 252,6 228,38" fill={LIME} />
      <polygon points="218,8 244,12 228,30" fill={GREEN} />

      <g fill={GREEN}>
        <line x1="90" y1="44" x2="90" y2="80" stroke={GREEN} strokeWidth="2.4" />
        <rect x="83" y="54" width="14" height="20" rx="1.5" />
        <line x1="112" y1="36" x2="112" y2="80" stroke={GREEN} strokeWidth="2.4" />
        <rect x="104" y="46" width="16" height="28" rx="1.5" />
        <line x1="136" y1="28" x2="136" y2="80" stroke={GREEN} strokeWidth="2.4" />
        <rect x="128" y="36" width="16" height="38" rx="1.5" />
        <line x1="160" y1="22" x2="160" y2="80" stroke={GREEN} strokeWidth="2.4" />
        <rect x="152" y="30" width="16" height="44" rx="1.5" />
      </g>

      <g
        filter={`url(#${shadow})`}
        fontFamily="Inter, Arial Black, sans-serif"
        fontStyle="italic"
        fontWeight="800"
      >
        <text x="42" y="172" fontSize="98" fill="#003A99" opacity="0.35">
          T
        </text>
        <text x="40" y="168" fontSize="98" fill={`url(#${tFill})`}>
          T
        </text>
        <text x="124" y="168" fontSize="66" fill="#64748B" opacity="0.4">
          2
        </text>
        <text x="122" y="164" fontSize="66" fill={`url(#${twoFill})`}>
          2
        </text>
        <text x="166" y="172" fontSize="98" fill="#166534" opacity="0.35">
          S
        </text>
        <text x="164" y="168" fontSize="98" fill={`url(#${sFill})`}>
          S
        </text>
      </g>
    </svg>
  );
}
