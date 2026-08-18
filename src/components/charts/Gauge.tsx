type Props = {
  score: number;
};

export function Gauge({ score }: Props) {
  const clamped = Math.max(0, Math.min(100, score));
  const angle = -180 + (clamped / 100) * 180;
  const rad = (angle * Math.PI) / 180;
  const cx = 120;
  const cy = 112;
  const r = 78;
  const nx = cx + Math.cos(rad) * (r - 14);
  const ny = cy + Math.sin(rad) * (r - 14);

  const arc = (start: number, end: number, color: string) => {
    const s = ((start - 180) * Math.PI) / 180;
    const e = ((end - 180) * Math.PI) / 180;
    const x1 = cx + Math.cos(s) * r;
    const y1 = cy + Math.sin(s) * r;
    const x2 = cx + Math.cos(e) * r;
    const y2 = cy + Math.sin(e) * r;
    const large = end - start > 180 ? 1 : 0;
    return <path d={`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`} stroke={color} strokeWidth="14" fill="none" strokeLinecap="round" />;
  };

  return (
    <svg viewBox="0 0 240 150" className="mx-auto h-[150px] w-full max-w-[280px]">
      {arc(0, 36, "#f04438")}
      {arc(40, 86, "#f79009")}
      {arc(90, 136, "#15b79e")}
      {arc(140, 180, "#12b76a")}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#111827" className="dark:stroke-white" strokeWidth="3" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="6" fill="#2f54eb" />
      <text x={cx} y={136} textAnchor="middle" className="fill-slate-900 dark:fill-white" fontSize="22" fontWeight="800">
        {clamped}/100
      </text>
    </svg>
  );
}
