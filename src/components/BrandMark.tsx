type Props = {
  variant?: "stacked" | "horizontal" | "emblem";
  size?: "sm" | "md" | "lg";
  theme?: "dark" | "light";
  className?: string;
  showWordmark?: "always" | "responsive";
};

const BLUE = "#2F7BFF";
const GREEN = "#22C55E";
const SILVER = "#6B7280";

const emblemSize = { sm: "h-8 w-8", md: "h-10 w-10", lg: "h-12 w-12" };
const lockupSize = { sm: "w-[188px]", md: "w-[240px]", lg: "w-[280px]" };
const markSize = { sm: "h-[108px] w-[108px]", md: "h-[140px] w-[140px]", lg: "h-[168px] w-[168px]" };

export function BrandMark({
  variant = "stacked",
  size = "md",
  theme = "light",
  className = "",
  showWordmark = "responsive",
}: Props) {
  const trade = theme === "light" ? SILVER : "#E5E7EB";

  if (variant === "stacked") {
    const nameSize = size === "sm" ? "text-[15px]" : size === "lg" ? "text-[22px]" : "text-[18px]";
    const tagSize = size === "sm" ? "text-[8px]" : "text-[9px]";
    return (
      <span className={`flex flex-col items-center text-center ${lockupSize[size]} ${className}`}>
        <Emblem className={markSize[size]} />
        <span className={`mt-2 block font-extrabold italic uppercase tracking-[0.18em] ${nameSize}`}>
          <span style={{ color: SILVER }}>TRADE </span>
          <span style={{ color: BLUE }}>2 </span>
          <span style={{ color: GREEN }}>SMART</span>
        </span>
        <span className={`mt-1.5 inline-flex items-center gap-2 font-semibold uppercase tracking-[0.16em] ${tagSize}`} style={{ color: "#334155" }}>
          <span style={{ color: BLUE }}>//</span>
          Intelligence Behind Every Trade.
          <span style={{ color: GREEN }}>//</span>
        </span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Emblem className={`shrink-0 ${emblemSize[size]}`} />
      {variant === "horizontal" ? (
        <span className={`min-w-0 leading-tight ${showWordmark === "always" ? "block" : "hidden sm:block"}`}>
          <span className={`block font-extrabold italic uppercase tracking-[0.16em] ${size === "lg" ? "text-[16px]" : "text-[13px]"}`}>
            <span style={{ color: trade }}>TRADE </span>
            <span style={{ color: BLUE }}>2 </span>
            <span style={{ color: GREEN }}>SMART</span>
          </span>
        </span>
      ) : null}
    </span>
  );
}

function Emblem({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 280 250" className={className} role="img" aria-label="Trade 2 Smart">
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M107.2 228.2 A 96 96 0 0 1 140 42" stroke={BLUE} strokeWidth="12" />
        <path d="M140 42 A 96 96 0 0 1 218.6 82.9" stroke={GREEN} strokeWidth="12" />
      </g>
      <path d="M218.6 82.9 L258 55" fill="none" stroke={GREEN} strokeWidth="12" strokeLinecap="round" />
      <polygon points="258,55 232,62 240,84" fill={GREEN} />
      <g fill={GREEN}>
        <rect x="92" y="58" width="12" height="20" />
        <rect x="113" y="48" width="13" height="30" />
        <rect x="135" y="38" width="13" height="40" />
        <rect x="157" y="30" width="13" height="48" />
        <rect x="97.5" y="52" width="1.6" height="32" />
        <rect x="119" y="42" width="1.6" height="42" />
        <rect x="141" y="32" width="1.6" height="52" />
        <rect x="163" y="24" width="1.6" height="60" />
      </g>
      <g fontFamily="Inter, Arial Black, sans-serif" fontStyle="italic" fontWeight="800">
        <text x="62" y="176" fontSize="92" fill={BLUE}>
          T
        </text>
        <text x="132" y="168" fontSize="62" fill={SILVER}>
          2
        </text>
        <text x="174" y="176" fontSize="92" fill={GREEN}>
          S
        </text>
      </g>
    </svg>
  );
}
