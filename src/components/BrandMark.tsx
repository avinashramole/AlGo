import { useId } from "react";

/** Logo placement from the brand sheet:
 *  stacked — login / splash (emblem above TRADE 2 SMART + tagline)
 *  horizontal — web header (emblem left, name + tagline right)
 *  emblem — sidebar, favicon, app icon (circle T2S only)
 */
export type BrandVariant = "stacked" | "horizontal" | "emblem";

type Props = {
  variant?: BrandVariant;
  size?: "sm" | "md" | "lg";
  theme?: "dark" | "light";
  className?: string;
};

const emblemBox: Record<BrandVariant, Record<NonNullable<Props["size"]>, string>> = {
  stacked: { sm: "h-[88px] w-[88px]", md: "h-[148px] w-[148px]", lg: "h-[188px] w-[188px]" },
  horizontal: { sm: "h-8 w-8", md: "h-10 w-10", lg: "h-12 w-12" },
  emblem: { sm: "h-8 w-8", md: "h-10 w-10", lg: "h-12 w-12" },
};

export function BrandMark({ variant = "stacked", size = "md", theme = "dark", className = "" }: Props) {
  const uid = useId().replace(/:/g, "");
  const trade = theme === "light" ? "#111827" : "#f4f7fb";
  const tag = theme === "light" ? "#6b7280" : "#c5cddb";
  const glow = variant === "stacked";

  if (variant === "emblem") {
    return (
      <span className={className}>
        <EmblemSvg id={uid} className={emblemBox.emblem[size]} glow={glow} />
      </span>
    );
  }

  if (variant === "horizontal") {
    const nameSize = size === "sm" ? "text-[11px]" : size === "lg" ? "text-[16px]" : "text-[13px]";
    const tagSize = size === "sm" ? "text-[8px]" : "text-[9px]";
    return (
      <span className={`inline-flex items-center gap-2.5 ${className}`}>
        <EmblemSvg id={uid} className={`shrink-0 ${emblemBox.horizontal[size]}`} glow={false} />
        <span className="hidden min-w-0 leading-tight sm:block">
          <span className={`block font-extrabold tracking-[0.14em] ${nameSize}`}>
            <span style={{ color: trade }}>TRADE </span>
            <span style={{ color: "#2f7bff" }}>2 </span>
            <span style={{ color: theme === "light" ? "#6fbf12" : "#b6ff3c" }}>SMART</span>
          </span>
          <span className={`mt-0.5 hidden tracking-wide lg:block ${tagSize}`} style={{ color: tag }}>
            Intelligence Behind Every Trade.
          </span>
        </span>
      </span>
    );
  }

  const nameSize = size === "sm" ? "text-lg" : size === "lg" ? "text-[28px]" : "text-[22px]";
  const tagSize = size === "sm" ? "text-[10px]" : "text-[13px]";
  return (
    <span className={`flex flex-col items-center text-center ${className}`}>
      <EmblemSvg id={uid} className={emblemBox.stacked[size]} glow={glow} />
      <span className={`mt-3 font-extrabold tracking-[0.22em] ${nameSize}`}>
        <span style={{ color: trade }}>TRADE </span>
        <span style={{ color: "#2f7bff" }}>2 </span>
        <span style={{ color: theme === "light" ? "#6fbf12" : "#b6ff3c" }}>SMART</span>
      </span>
      <span className="mt-2 flex items-center gap-3">
        <span className="h-[2px] w-8 rounded-full bg-[#2f7bff]" />
        <span className={tagSize} style={{ color: tag }}>
          Intelligence Behind Every Trade.
        </span>
        <span className="h-[2px] w-8 rounded-full bg-[#b6ff3c]" />
      </span>
    </span>
  );
}

function EmblemSvg({ id, className, glow }: { id: string; className?: string; glow: boolean }) {
  const blue = `${id}-blue`;
  const silver = `${id}-silver`;
  const green = `${id}-green`;
  const arc = `${id}-arc`;
  const glowId = `${id}-glow`;
  return (
    <svg viewBox="0 0 240 240" className={className} role="img" aria-label="T2S">
      <defs>
        <linearGradient id={blue} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8fd0ff" />
          <stop offset="55%" stopColor="#2f7bff" />
          <stop offset="100%" stopColor="#163dcc" />
        </linearGradient>
        <linearGradient id={silver} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#d7dee8" />
          <stop offset="100%" stopColor="#9aa6b5" />
        </linearGradient>
        <linearGradient id={green} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e7ff8a" />
          <stop offset="50%" stopColor="#b6ff3c" />
          <stop offset="100%" stopColor="#6fbf12" />
        </linearGradient>
        <linearGradient id={arc} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2f7bff" />
          <stop offset="100%" stopColor="#b6ff3c" />
        </linearGradient>
        {glow ? (
          <filter id={glowId} x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur stdDeviation="2.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        ) : null}
      </defs>
      <circle
        cx="120"
        cy="120"
        r="104"
        fill="none"
        stroke={`url(#${arc})`}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray="560 92"
        strokeDashoffset="48"
        transform="rotate(-18 120 120)"
        filter={glow ? `url(#${glowId})` : undefined}
      />
      <polygon
        points="188,36 214,28 196,58"
        fill="#b6ff3c"
        filter={glow ? `url(#${glowId})` : undefined}
      />
      <g fill="#b6ff3c" filter={glow ? `url(#${glowId})` : undefined}>
        <rect x="96" y="52" width="10" height="28" rx="1.5" />
        <rect x="94" y="58" width="14" height="3.5" rx="1" />
        <rect x="94" y="72" width="14" height="3.5" rx="1" />
        <rect x="115" y="42" width="10" height="38" rx="1.5" />
        <rect x="113" y="48" width="14" height="3.5" rx="1" />
        <rect x="113" y="72" width="14" height="3.5" rx="1" />
        <rect x="134" y="32" width="10" height="48" rx="1.5" />
        <rect x="132" y="38" width="14" height="3.5" rx="1" />
        <rect x="132" y="72" width="14" height="3.5" rx="1" />
      </g>
      <text
        x="120"
        y="158"
        textAnchor="middle"
        fontFamily="Inter, Arial, sans-serif"
        fontSize="64"
        fontWeight="800"
        letterSpacing="-2"
      >
        <tspan fill={`url(#${blue})`}>T</tspan>
        <tspan fill={`url(#${silver})`}>2</tspan>
        <tspan fill={`url(#${green})`}>S</tspan>
      </text>
    </svg>
  );
}
