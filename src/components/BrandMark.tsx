import { useId } from "react";

/** stacked — login; horizontal — header; emblem — sidebar / tab */
export type BrandVariant = "stacked" | "horizontal" | "emblem";

type Props = {
  variant?: BrandVariant;
  size?: "sm" | "md" | "lg";
  theme?: "dark" | "light";
  className?: string;
  showWordmark?: "always" | "responsive";
};

const emblemBox: Record<BrandVariant, Record<NonNullable<Props["size"]>, string>> = {
  stacked: { sm: "h-[88px] w-[88px]", md: "h-[132px] w-[132px]", lg: "h-[168px] w-[168px]" },
  horizontal: { sm: "h-8 w-8", md: "h-10 w-10", lg: "h-12 w-12" },
  emblem: { sm: "h-8 w-8", md: "h-10 w-10", lg: "h-12 w-12" },
};

export function BrandMark({ variant = "stacked", size = "md", theme = "dark", className = "", showWordmark = "responsive" }: Props) {
  const uid = useId().replace(/:/g, "");
  const trade = theme === "light" ? "#111827" : "#f4f7fb";
  const tag = theme === "light" ? "#6b7280" : "#9aa3b5";
  const smart = theme === "light" ? "#5ea80e" : "#b6ff3c";

  if (variant === "emblem") {
    return (
      <span className={className}>
        <EmblemSvg id={uid} className={emblemBox.emblem[size]} />
      </span>
    );
  }

  if (variant === "horizontal") {
    const nameSize = size === "sm" ? "text-[11px]" : size === "lg" ? "text-[16px]" : "text-[13px]";
    const tagSize = size === "sm" ? "text-[8px]" : "text-[9px]";
    return (
      <span className={`inline-flex items-center gap-2.5 ${className}`}>
        <EmblemSvg id={uid} className={`shrink-0 ${emblemBox.horizontal[size]}`} />
        <span className={`min-w-0 leading-tight ${showWordmark === "always" ? "block" : "hidden sm:block"}`}>
          <span className={`block font-extrabold tracking-[0.16em] ${nameSize}`}>
            <span style={{ color: trade }}>TRADE </span>
            <span style={{ color: "#2f7bff" }}>2 </span>
            <span style={{ color: smart }}>SMART</span>
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
      <EmblemSvg id={uid} className={emblemBox.stacked[size]} />
      <span className={`mt-3 font-extrabold tracking-[0.22em] ${nameSize}`}>
        <span style={{ color: trade }}>TRADE </span>
        <span style={{ color: "#2f7bff" }}>2 </span>
        <span style={{ color: smart }}>SMART</span>
      </span>
      <span className={`mt-1.5 ${tagSize}`} style={{ color: tag }}>
        Intelligence Behind Every Trade.
      </span>
    </span>
  );
}

function EmblemSvg({ id, className }: { id: string; className?: string }) {
  const blue = `${id}-blue`;
  const silver = `${id}-silver`;
  const green = `${id}-green`;
  const edge = `${id}-edge`;
  return (
    <svg viewBox="0 0 240 240" className={className} role="img" aria-label="Trade 2 Smart">
      <defs>
        <linearGradient id={blue} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7ec8ff" />
          <stop offset="100%" stopColor="#2f7bff" />
        </linearGradient>
        <linearGradient id={silver} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#c9d2de" />
        </linearGradient>
        <linearGradient id={green} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ddff7a" />
          <stop offset="100%" stopColor="#b6ff3c" />
        </linearGradient>
        <linearGradient id={edge} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2f7bff" />
          <stop offset="100%" stopColor="#b6ff3c" />
        </linearGradient>
      </defs>
      <rect x="14" y="14" width="212" height="212" rx="56" fill="#080b12" stroke={`url(#${edge})`} strokeWidth="7" />
      <text x="120" y="122" textAnchor="middle" fontFamily="Inter, Arial, sans-serif" fontSize="70" fontWeight="800" letterSpacing="-4">
        <tspan fill={`url(#${blue})`}>T</tspan>
        <tspan fill={`url(#${silver})`}>2</tspan>
        <tspan fill={`url(#${green})`}>S</tspan>
      </text>
      <path
        d="M58 174 H104 V152 H150 V130 H186"
        fill="none"
        stroke="#b6ff3c"
        strokeWidth="8"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <circle cx="186" cy="130" r="7" fill="#2f7bff" />
    </svg>
  );
}
