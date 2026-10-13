type Props = {
  variant?: "stacked" | "horizontal" | "emblem";
  size?: "sm" | "md" | "lg";
  theme?: "dark" | "light";
  className?: string;
  showWordmark?: "always" | "responsive";
};

const FULL = "/t2s-logo.png";
const INNER = "/t2s-emblem.png";

const emblemSize = { sm: "h-9 w-14", md: "h-11 w-[4.4rem]", lg: "h-14 w-24" };
const stackedSize = { sm: "h-[120px] w-[120px]", md: "h-[168px] w-[168px]", lg: "h-[220px] w-[220px]" };
const horizontalSize = { sm: "h-9 w-14", md: "h-11 w-[4.4rem]", lg: "h-12 w-20" };

export function BrandMark({ variant = "stacked", size = "md", className = "" }: Props) {
  if (variant === "stacked") {
    return <img src={FULL} alt="Trade 2 Smart" className={`object-contain ${stackedSize[size]} ${className}`} />;
  }
  return (
    <img
      src={INNER}
      alt="Trade 2 Smart"
      className={`object-contain ${variant === "emblem" ? emblemSize[size] : horizontalSize[size]} ${className}`}
    />
  );
}
