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
  stacked: { sm: "h-[96px] w-[96px]", md: "h-[140px] w-[140px]", lg: "h-[168px] w-[168px]" },
  horizontal: { sm: "h-9 w-9", md: "h-11 w-11", lg: "h-14 w-14" },
  emblem: { sm: "h-8 w-8", md: "h-10 w-10", lg: "h-12 w-12" },
};

const BLUE = "#2f7bff";
const GREEN = "#22c55e";

export function BrandMark({
  variant = "stacked",
  size = "md",
  theme = "dark",
  className = "",
  showWordmark = "responsive",
  align = "center",
}: Props) {
  const uid = useId().replace(/:/g, "");
  const ink = theme === "light" ? "#111827" : "#f4f7fb";
  const tag = theme === "light" ? "#111827" : "#d1d5db";

  if (variant === "emblem") {
    return (
      <span className={className}>
        <EmblemSvg id={uid} className={emblemBox.emblem[size]} />
      </span>
    );
  }

  if (variant === "horizontal") {
    const nameSize = size === "sm" ? "text-[11px]" : size === "lg" ? "text-[17px]" : "text-[13px]";
    const tagSize = size === "sm" ? "text-[8px]" : "text-[9px]";
    return (
      <span className={`inline-flex items-center gap-2.5 ${className}`}>
        <EmblemSvg id={uid} className={`shrink-0 ${emblemBox.horizontal[size]}`} />
        <span className={`min-w-0 leading-tight ${showWordmark === "always" ? "block" : "hidden sm:block"}`}>
          <Wordmark className={nameSize} ink={ink} />
          <span className={`mt-0.5 italic tracking-wide ${showWordmark === "always" ? "block" : "hidden lg:block"} ${tagSize}`} style={{ color: tag }}>
            Intelligence Behind Every Trade.
          </span>
        </span>
      </span>
    );
  }

  const nameSize = size === "sm" ? "text-lg" : size === "lg" ? "text-[26px]" : "text-[22px]";
  const tagSize = size === "sm" ? "text-[10px]" : "text-[12px]";
  const stackedAlign = align === "start" ? "items-start text-left" : "items-center text-center";
  return (
    <span className={`flex flex-col ${stackedAlign} ${className}`}>
      <EmblemSvg id={uid} className={emblemBox.stacked[size]} />
      <Wordmark className={`mt-3 tracking-[0.18em] ${nameSize}`} ink={ink} />
      <Tagline id={uid} className={`mt-2 ${tagSize}`} color={tag} wide={size === "lg"} />
    </span>
  );
}

function Wordmark({ className, ink }: { className?: string; ink: string }) {
  return (
    <span className={`block font-extrabold ${className || ""}`}>
      <span style={{ color: ink }}>TRADE </span>
      <span style={{ color: BLUE }}>2 </span>
      <span style={{ color: GREEN }}>SMART</span>
    </span>
  );
}

function Tagline({ id, className, color, wide }: { id: string; className?: string; color: string; wide?: boolean }) {
  const left = `${id}-tag-l`;
  const right = `${id}-tag-r`;
  return (
    <span className={`inline-flex items-center gap-2 ${className || ""}`} style={{ color }}>
      <svg width={wide ? 42 : 28} height="10" viewBox="0 0 42 10" aria-hidden="true">
        <defs>
          <linearGradient id={left} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={BLUE} />
            <stop offset="100%" stopColor={BLUE} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points="0,5 7,1.5 7,8.5" fill={BLUE} />
        <line x1="7" y1="5" x2="42" y2="5" stroke={`url(#${left})`} strokeWidth="1.6" />
      </svg>
      <span className="italic font-medium whitespace-nowrap">Intelligence Behind Every Trade.</span>
      <svg width={wide ? 42 : 28} height="10" viewBox="0 0 42 10" aria-hidden="true">
        <defs>
          <linearGradient id={right} x1="1" y1="0" x2="0" y2="0">
            <stop offset="0%" stopColor={GREEN} />
            <stop offset="100%" stopColor={GREEN} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" y1="5" x2="35" y2="5" stroke={`url(#${right})`} strokeWidth="1.6" />
        <polygon points="42,5 35,1.5 35,8.5" fill={GREEN} />
      </svg>
    </span>
  );
}

function EmblemSvg({ id, className }: { id: string; className?: string }) {
  const ring = `${id}-ring`;
  const tBlue = `${id}-t`;
  const sGreen = `${id}-s`;
  return (
    <svg viewBox="0 0 280 260" className={className} role="img" aria-label="Trade 2 Smart">
      <defs>
        <linearGradient id={ring} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor={BLUE} />
          <stop offset="55%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor={GREEN} />
        </linearGradient>
        <linearGradient id={tBlue} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor={BLUE} />
        </linearGradient>
        <linearGradient id={sGreen} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#86efac" />
          <stop offset="100%" stopColor={GREEN} />
        </linearGradient>
      </defs>

      <circle
        cx="128"
        cy="142"
        r="96"
        fill="none"
        stroke={`url(#${ring})`}
        strokeWidth="7"
        strokeDasharray="520 83"
        strokeDashoffset="36"
        transform="rotate(-28 128 142)"
      />

      <g fill={GREEN} stroke="#16a34a" strokeWidth="1.2">
        <line x1="86" y1="46" x2="86" y2="78" stroke={GREEN} strokeWidth="2" />
        <rect x="80" y="54" width="12" height="18" rx="1" />
        <line x1="106" y1="38" x2="106" y2="78" stroke={GREEN} strokeWidth="2" />
        <rect x="99" y="46" width="14" height="26" rx="1" />
        <line x1="128" y1="32" x2="128" y2="78" stroke={GREEN} strokeWidth="2" />
        <rect x="121" y="38" width="14" height="34" rx="1" />
        <line x1="150" y1="28" x2="150" y2="78" stroke={GREEN} strokeWidth="2" />
        <rect x="143" y="32" width="14" height="40" rx="1" />
      </g>

      <g stroke={`url(#${tBlue})`} strokeWidth="4" strokeLinecap="round">
        <line x1="22" y1="118" x2="58" y2="118" />
        <line x1="16" y1="134" x2="56" y2="134" />
        <line x1="26" y1="150" x2="60" y2="150" />
      </g>
      <g stroke={`url(#${sGreen})`} strokeWidth="4" strokeLinecap="round">
        <line x1="198" y1="118" x2="236" y2="118" />
        <line x1="196" y1="134" x2="242" y2="134" />
        <line x1="200" y1="150" x2="232" y2="150" />
      </g>

      <text
        x="78"
        y="168"
        fill={`url(#${tBlue})`}
        fontFamily="Inter, Arial Black, sans-serif"
        fontStyle="italic"
        fontWeight="800"
        fontSize="86"
      >
        T
      </text>
      <text
        x="128"
        y="162"
        fill="#111827"
        fontFamily="Inter, Arial Black, sans-serif"
        fontStyle="italic"
        fontWeight="800"
        fontSize="52"
      >
        2
      </text>
      <text
        x="158"
        y="168"
        fill={`url(#${sGreen})`}
        fontFamily="Inter, Arial Black, sans-serif"
        fontStyle="italic"
        fontWeight="800"
        fontSize="86"
      >
        S
      </text>

      <path d="M176 108 L226 52" stroke={GREEN} strokeWidth="12" strokeLinecap="round" />
      <polygon points="214,38 248,34 230,70" fill={GREEN} />
    </svg>
  );
}
