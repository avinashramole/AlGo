import { dnaScores } from "../../data/mock";

export function RadarChart() {
  const size = 210;
  const cx = size / 2;
  const cy = size / 2 + 4;
  const radius = 72;
  const n = dnaScores.length;

  const point = (index: number, value: number) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / n;
    return {
      x: cx + Math.cos(angle) * radius * value,
      y: cy + Math.sin(angle) * radius * value,
    };
  };

  const rings = [0.35, 0.65, 1];
  const polygon = dnaScores
    .map((item, i) => {
      const p = point(i, item.value / 100);
      return `${p.x},${p.y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto h-[210px] w-full max-w-[240px]">
      {rings.map((r) => (
        <polygon
          key={r}
          points={dnaScores
            .map((_, i) => {
              const p = point(i, r);
              return `${p.x},${p.y}`;
            })
            .join(" ")}
          fill="none"
          stroke="currentColor"
          className="text-slate-200 dark:text-slate-700"
          strokeWidth="1"
        />
      ))}
      {dnaScores.map((_, i) => {
        const p = point(i, 1);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={p.x}
            y2={p.y}
            stroke="currentColor"
            className="text-slate-200 dark:text-slate-700"
          />
        );
      })}
      <polygon points={polygon} fill="rgba(47,84,235,0.18)" stroke="#2f54eb" strokeWidth="2" />
      {dnaScores.map((item, i) => {
        const p = point(i, item.value / 100);
        return <circle key={item.label} cx={p.x} cy={p.y} r="3" fill="#2f54eb" />;
      })}
      {dnaScores.map((item, i) => {
        const p = point(i, 1.28);
        return (
          <text
            key={item.label}
            x={p.x}
            y={p.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-slate-500 dark:fill-slate-400"
            fontSize="10"
            fontWeight="600"
          >
            {item.label}
          </text>
        );
      })}
    </svg>
  );
}
