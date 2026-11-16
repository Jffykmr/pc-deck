import { useEffect, useState } from "react";
import { Glyph } from "./Glyph";

/**
 * Real Windows icon extracted by the agent, with a glyph fallback.
 * When src changes, the previous icon stays on screen until the new one has
 * loaded, so switching apps never shows an empty frame.
 */
export function ExeIcon({
  src,
  glyph,
  size,
  className = "",
}: {
  src: string;
  glyph?: string;
  size: number;
  className?: string;
}) {
  const [shown, setShown] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setShown(src);
      setFailed(false);
    };
    img.onerror = () => {
      if (!cancelled) setFailed(true);
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (failed || !shown) {
    return (
      <span className={`flex items-center justify-center text-muted ${className}`} style={{ width: size, height: size }}>
        {failed && <Glyph name={glyph} size={Math.round(size * 0.62)} />}
      </span>
    );
  }
  return (
    <img
      src={shown}
      alt=""
      width={size}
      height={size}
      draggable={false}
      className={`object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
