import { useEffect, useState } from "react";
import { heatColor } from "./Instruments";

const C = 360; // dial centre in the 720 viewBox
const SWEEP = 270; // sub-dial needle sweep in degrees

/** Seconds-aware clock state. Re-renders only the dial, once per second. */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

function SubDial({ cx, cy, label, value, unit, color }: { cx: number; cy: number; label: string; value: number | null | undefined; unit: string; color?: string }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  const angle = -SWEEP / 2 + (v / 100) * SWEEP;
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <circle r="66" fill="rgb(var(--bg))" stroke="rgb(255 255 255 / 0.1)" strokeWidth="2" />
      {Array.from({ length: 11 }, (_, i) => (
        <line
          key={i}
          x1="0"
          y1="-60"
          x2="0"
          y2={i % 5 === 0 ? -48 : -54}
          stroke="rgb(255 255 255 / 0.45)"
          strokeWidth={i % 5 === 0 ? 3 : 2}
          transform={`rotate(${-SWEEP / 2 + (i * SWEEP) / 10})`}
        />
      ))}
      <text y="24" textAnchor="middle" className="display" style={{ fill: color ?? "rgb(var(--ink))", fontSize: 34 }}>
        {value == null ? "--" : Math.round(value)}
        <tspan style={{ fontSize: 16, fill: "rgb(var(--muted))" }}>{unit}</tspan>
      </text>
      <text y="48" textAnchor="middle" style={{ fill: "rgb(var(--muted))", fontSize: 13, fontWeight: 600, letterSpacing: "0.14em" }}>
        {label}
      </text>
      <g style={{ transform: `rotate(${angle}deg)` }}>
        <line x1="0" y1="-38" x2="0" y2="-58" style={{ stroke: color ?? "rgb(var(--tint))" }} strokeWidth="4" strokeLinecap="round" />
      </g>
    </g>
  );
}

/**
 * Showpiece dial: a flat analogue clock whose three sub-dials carry the machine's
 * vitals, like a chronograph. Static ticks, hands move by transform once per second.
 */
export function Dial({ cpu, gpu, temp }: { cpu?: number | null; gpu?: number | null; temp?: number | null }) {
  const now = useNow();
  const s = now.getSeconds();
  const m = now.getMinutes() + s / 60;
  const h = (now.getHours() % 12) + m / 60;

  return (
    <svg viewBox="0 0 720 720" className="h-full w-full" role="img" aria-label={now.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}>
      <circle cx={C} cy={C} r="352" fill="rgb(var(--surface))" />
      <circle cx={C} cy={C} r="352" fill="none" stroke="rgb(255 255 255 / 0.07)" strokeWidth="2" />
      {Array.from({ length: 60 }, (_, i) => {
        const major = i % 5 === 0;
        return (
          <line
            key={i}
            x1={C}
            y1="22"
            x2={C}
            y2={major ? 56 : 40}
            stroke={major ? "rgb(var(--ink))" : "rgb(255 255 255 / 0.35)"}
            strokeWidth={major ? 6 : 2.5}
            strokeLinecap="butt"
            transform={`rotate(${i * 6} ${C} ${C})`}
          />
        );
      })}

      <SubDial cx={C - 150} cy={C} label="CPU" value={cpu} unit="%" />
      <SubDial cx={C + 150} cy={C} label="GPU" value={gpu} unit="%" />
      <SubDial cx={C} cy={C + 152} label="TEMP" value={temp} unit="°" color={temp != null ? heatColor(temp) : undefined} />

      {/* Hour and minute hands: flat bars with a short tail. */}
      <g style={{ transformOrigin: `${C}px ${C}px`, transform: `rotate(${h * 30}deg)` }}>
        <rect x={C - 8} y={C - 190} width="16" height="228" rx="8" fill="rgb(var(--ink))" />
      </g>
      <g style={{ transformOrigin: `${C}px ${C}px`, transform: `rotate(${m * 6}deg)` }}>
        <rect x={C - 5.5} y={C - 292} width="11" height="340" rx="5.5" fill="rgb(var(--ink))" />
      </g>
      {/* Second hand in the lamp colour of the app in front. */}
      <g style={{ transformOrigin: `${C}px ${C}px`, transform: `rotate(${s * 6}deg)` }}>
        <rect x={C - 2} y={C - 306} width="4" height="372" fill="rgb(var(--tint))" />
      </g>
      <circle cx={C} cy={C} r="13" fill="rgb(var(--tint))" />
      <circle cx={C} cy={C} r="5" fill="rgb(var(--bg))" />
    </svg>
  );
}
