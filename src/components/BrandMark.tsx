type Props = {
  variant?: "stacked" | "horizontal" | "emblem";
  size?: "sm" | "md" | "lg";
  theme?: "dark" | "light";
  className?: string;
  showWordmark?: "always" | "responsive";
};

const SRC = "/t2s-logo.png";

const emblemSize = { sm: "h-8 w-8", md: "h-10 w-10", lg: "h-12 w-12" };
const stackedSize = { sm: "h-[120px] w-[120px]", md: "h-[168px] w-[168px]", lg: "h-[220px] w-[220px]" };
const horizontalSize = { sm: "h-9 w-9", md: "h-11 w-11", lg: "h-12 w-12" };

export function BrandMark({ variant = "stacked", size = "md", className = "" }: Props) {
  if (variant === "stacked") {
    return <img src={SRC} alt="Trade 2 Smart" className={`object-contain ${stackedSize[size]} ${className}`} />;
  }
  return (
    <img
      src={SRC}
      alt="Trade 2 Smart"
      className={`object-contain ${variant === "emblem" ? emblemSize[size] : horizontalSize[size]} ${className}`}
    />
  );
}
