import { useMemo } from "react";

type Props = {
  data: number[];
  up: boolean;
  width?: number;
  height?: number;
};

export function Sparkline({ data, up, width = 88, height = 28 }: Props) {
  const path = useMemo(() => {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const span = max - min || 1;
    return data
      .map((value, index) => {
        const x = (index / (data.length - 1)) * (width - 4) + 2;
        const y = height - 3 - ((value - min) / span) * (height - 8);
        return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }, [data, height, width]);

  const color = up ? "#12b76a" : "#f04438";

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <path d={path} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
