export function Sparkline({ data, max, className = "" }: { data: number[]; max?: number; className?: string }) {
  const W = 100;
  const H = 32;
  if (data.length < 2) return <svg viewBox={`0 0 ${W} ${H}`} className={className} preserveAspectRatio="none" />;
  const top = Math.max(max ?? 0, ...data, 1);
  const step = W / (data.length - 1);
  const pts = data.map((v, i) => [i * step, H - (v / top) * (H - 2) - 1] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} preserveAspectRatio="none" aria-hidden>
      <path d={`${line} L${W},${H} L0,${H} Z`} fill="rgb(var(--accent) / 0.10)" />
      <path d={line} fill="none" stroke="rgb(var(--accent))" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
