import { useEffect, useRef, useState } from "react";

/**
 * Vertical touch fader. Sends throttled updates while dragging so the PC volume
 * follows the finger, and ignores live pushes until the drag ends so the
 * cap never jumps back under the finger.
 */
export function Fader({
  value,
  muted,
  onChange,
}: {
  value: number;
  muted: boolean;
  onChange: (v: number) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const lastSent = useRef(0);
  const pending = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(pending.current), []);

  const shown = drag ?? value;

  function valueAt(clientY: number) {
    const r = track.current!.getBoundingClientRect();
    return Math.round(Math.max(0, Math.min(1, (r.bottom - clientY) / r.height)) * 100);
  }

  function send(v: number, force = false) {
    const now = performance.now();
    window.clearTimeout(pending.current);
    if (force || now - lastSent.current > 90) {
      lastSent.current = now;
      onChange(v);
    } else {
      pending.current = window.setTimeout(() => send(v, true), 90);
    }
  }

  return (
    <div
      ref={track}
      role="slider"
      aria-label="Volume"
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={shown}
      className="relative min-h-[120px] flex-1 touch-none overflow-hidden rounded-[18px] bg-bg"
      style={{ boxShadow: "inset 0 2px 0 rgb(0 0 0 / 0.5), inset 0 0 0 1px rgb(255 255 255 / 0.05)" }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const v = valueAt(e.clientY);
        setDrag(v);
        send(v);
      }}
      onPointerMove={(e) => {
        if (drag === null) return;
        const v = valueAt(e.clientY);
        setDrag(v);
        send(v);
      }}
      onPointerUp={(e) => {
        if (drag === null) return;
        send(valueAt(e.clientY), true);
        // Hold the local value briefly so the next live tick (still old) doesn't flash.
        window.setTimeout(() => setDrag(null), 600);
      }}
      onPointerCancel={() => setDrag(null)}
    >
      {/* Ten detents, like the scale printed beside a real fader. */}
      <div aria-hidden className="absolute inset-y-3 left-3 flex flex-col justify-between">
        {Array.from({ length: 11 }, (_, i) => (
          <span key={i} className={`h-px bg-white/25 ${i % 5 === 0 ? "w-4" : "w-2"}`} />
        ))}
      </div>
      <div
        className="absolute inset-x-0 bottom-0"
        style={{
          height: `${shown}%`,
          background: muted ? "rgb(var(--faint) / 0.5)" : "rgb(var(--tint))",
          transition: drag === null ? "height 200ms ease-out" : "none",
        }}
      />
      <span
        className={`display num pointer-events-none absolute inset-x-0 top-3 text-center text-[34px] leading-none ${
          shown > 88 && !muted ? "text-[rgb(var(--on))]" : "text-ink"
        }`}
      >
        {muted ? "MUTO" : shown}
      </span>
    </div>
  );
}
