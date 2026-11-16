import { MonitorIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { screenFrame } from "../api";
import { usePrefs } from "../lib/prefs";
import { useDeck } from "../store";

/**
 * Live mirror of the PC desktop (one small frame every ~2 s: the tablet Wi-Fi
 * could not carry a frame per second alongside the live data).
 *
 * Frames are fetched and fully decoded off-screen, then painted onto a canvas in
 * one step. Swapping an <img> src instead makes Chrome drop the old bitmap before
 * the new one is ready, which showed up as a blink every second.
 */
export function ScreenLive({ className = "" }: { className?: string }) {
  const { live } = useDeck();
  const { screenPreview } = usePrefs();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hasFrame, setHasFrame] = useState(false);
  const active = live.connected && screenPreview;

  useEffect(() => {
    if (!active) {
      setHasFrame(false);
      return;
    }
    let stop = false;
    let timer: number | undefined;
    let n = 0;

    async function next() {
      if (stop) return;
      const started = performance.now();
      try {
        const res = await fetch(screenFrame(++n), { cache: "no-store" });
        if (res.status === 200) {
          const bitmap = await createImageBitmap(await res.blob());
          const el = canvas.current;
          if (!stop && el) {
            if (el.width !== bitmap.width || el.height !== bitmap.height) {
              el.width = bitmap.width;
              el.height = bitmap.height;
            }
            el.getContext("2d")?.drawImage(bitmap, 0, 0);
            setHasFrame(true);
          }
          bitmap.close();
        }
      } catch {
        // transient network error: try again on the next tick
      }
      // Adaptive pacing: on a slow link wait longer, so frames never queue up
      // behind each other and starve the live data connection.
      const took = performance.now() - started;
      if (!stop) timer = window.setTimeout(next, took > 800 ? Math.min(6000, took * 3) : Math.max(500, 2000 - took));
    }

    function onVisible() {
      if (document.visibilityState === "visible") {
        window.clearTimeout(timer);
        next();
      }
    }

    next();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active]);

  return (
    <div className={`relative overflow-hidden bg-black ${className}`}>
      <canvas
        ref={canvas}
        aria-label="Schermo del PC in diretta"
        className="h-full w-full object-cover transition-opacity duration-500"
        style={{ opacity: active && hasFrame ? 1 : 0 }}
      />
      {!(active && hasFrame) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-faint">
          <MonitorIcon size={34} weight="light" />
          <span className="text-[13px]">{screenPreview ? "Collegamento allo schermo" : "Anteprima schermo disattivata"}</span>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0" style={{ boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.08), inset 0 -40px 60px -30px rgb(0 0 0 / 0.6)" }} />
      {active && hasFrame && (
        <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink">
          <span className="h-1.5 w-1.5 rounded-full bg-danger" style={{ animation: "live-pulse 1.6s ease-in-out infinite" }} />
          Live
        </span>
      )}
    </div>
  );
}
