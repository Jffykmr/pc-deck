import { useEffect, useRef, useState, type ReactNode } from "react";

const HOLD_MS = 1100;

/** Destructive actions fire only after a sustained press, never on a stray tap. */
export function HoldButton({
  onConfirm,
  children,
  className = "",
}: {
  onConfirm: () => void;
  children: ReactNode;
  className?: string;
}) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function start() {
    setHolding(true);
    timer.current = window.setTimeout(() => {
      setHolding(false);
      navigator.vibrate?.(30);
      onConfirm();
    }, HOLD_MS);
  }

  function stop() {
    window.clearTimeout(timer.current);
    setHolding(false);
  }

  return (
    <button
      type="button"
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative touch-none select-none overflow-hidden outline-none ${className}`}
    >
      <span
        aria-hidden
        className="absolute inset-0 origin-left bg-danger/25"
        style={{
          transform: `scaleX(${holding ? 1 : 0})`,
          transition: holding ? `transform ${HOLD_MS}ms linear` : "transform 180ms ease-out",
        }}
      />
      <span className="relative">{children}</span>
    </button>
  );
}
