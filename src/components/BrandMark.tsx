type Props = {
  variant?: "stacked" | "horizontal" | "emblem";
  size?: "sm" | "md" | "lg";
  theme?: "dark" | "light";
  className?: string;
  showWordmark?: "always" | "responsive";
};

const lockup = "/t2s-lockup.png";
const emblem = "/t2s-emblem.png";

const emblemSize = { sm: "h-8 w-8", md: "h-10 w-10", lg: "h-12 w-12" };
const lockupSize = { sm: "w-[200px]", md: "w-[260px]", lg: "w-[320px]" };

export function BrandMark({
  variant = "stacked",
  size = "md",
  className = "",
  showWordmark = "responsive",
}: Props) {
  if (variant === "stacked") {
    return (
      <img
        src={lockup}
        alt="Trade 2 Smart"
        className={`block h-auto ${lockupSize[size]} ${className}`}
      />
    );
  }

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <img src={emblem} alt="" className={`shrink-0 object-contain ${emblemSize[size]}`} />
      {variant === "horizontal" ? (
        <span className={`min-w-0 leading-tight ${showWordmark === "always" ? "block" : "hidden sm:block"}`}>
          <span className={`block font-extrabold uppercase tracking-[0.16em] ${size === "lg" ? "text-[16px]" : "text-[13px]"}`}>
            <span className="text-slate-900 dark:text-white">TRADE </span>
            <span className="text-[#2F7BFF]">2 </span>
            <span className="text-[#22C55E]">SMART</span>
          </span>
        </span>
      ) : null}
    </span>
  );
}
