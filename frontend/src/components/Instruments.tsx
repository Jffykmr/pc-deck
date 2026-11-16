import { animate, useMotionValue, useMotionValueEvent } from "motion/react";
import { useLayoutEffect, useRef } from "react";
import { getPrefs } from "../lib/prefs";

/** Number that glides to its new value instead of jumping. Writes the DOM directly, no re-render. */
export function Counter({ value, digits = 0, className = "" }: { value: number | null | undefined; digits?: number; className?: string }) {
  // The span has no React children on purpose: if React also rendered the number,
  // every live tick would write the new value and the animation would write the
  // old one back, so the digits flashed once per second.
  const ref = useRef<HTMLSpanElement>(null);
  const mv = useMotionValue(value ?? 0);
  // Layout effect: text is in place before the first paint, no empty frame.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value === null || value === undefined) {
      el.textContent = "--";
      return;
    }
    // Lite mode (default on the tablet): no per-frame tweening. A dozen counters
    // each animating for 700ms every second kept the weak tablet CPU busy.
    if (!getPrefs().richEffects || el.textContent === "" || el.textContent === "--") {
      mv.jump(value);
      el.textContent = value.toFixed(digits);
      return;
    }
    const ctrl = animate(mv, value, { duration: 0.7, ease: [0.2, 0.8, 0.2, 1] });
    return () => ctrl.stop();
  }, [value, digits, mv]);
  useMotionValueEvent(mv, "change", (v) => {
    if (ref.current) ref.current.textContent = v.toFixed(digits);
  });
  return <span ref={ref} className={`num ${className}`} />;
}

/** Arc gauge. 270 degree sweep, tint stroke with a soft bloom. */
export function Ring({
  value,
  max = 100,
  size = 72,
  stroke = 6,
  color = "rgb(var(--accent))",
  children,
}: {
  value: number | null | undefined;
  max?: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const sweep = circ * 0.75;
  const pct = Math.max(0, Math.min(1, (value ?? 0) / max));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="rotate-[135deg]" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(255 255 255 / 0.14)" strokeWidth={stroke} strokeLinecap="butt" strokeDasharray={`${sweep} ${circ}`} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="butt"
          strokeDasharray={`${sweep * pct} ${circ}`}
          style={{ transition: "stroke-dasharray 500ms ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

/** Horizontal meter without a heavy track: a hairline plus a lit fill. */
export function Bar({ value, max = 100, color = "rgb(var(--accent))", height = 6 }: { value: number | null | undefined; max?: number; color?: string; height?: number }) {
  const pct = Math.max(0, Math.min(100, ((value ?? 0) / max) * 100));
  return (
    <div className="relative w-full overflow-hidden rounded-[2px] bg-white/[0.12]" style={{ height }}>
      <div
        className="live-meter absolute inset-0 origin-left"
        style={{ transform: `scaleX(${pct / 100})`, background: color, transition: "transform 500ms ease-out" }}
      />
    </div>
  );
}

/** Temperature color: accent when cool, amber when warm, red when hot. */
export function heatColor(temp: number | null | undefined) {
  if (temp === null || temp === undefined) return "rgb(var(--accent))";
  if (temp < 60) return "rgb(var(--ink))";
  if (temp < 75) return "rgb(255 184 76)";
  return "rgb(var(--danger))";
}
