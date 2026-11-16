import NoSleep from "nosleep.js";
import { useCallback, useEffect, useState } from "react";
import { getPrefs } from "./prefs";

// iPadOS Safari before 16.4 only has the webkit-prefixed Fullscreen API; iPhone has none.
type WebkitDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type WebkitEl = HTMLElement & { webkitRequestFullscreen?: () => void };

function fsElement(): Element | null {
  return document.fullscreenElement ?? (document as WebkitDoc).webkitFullscreenElement ?? null;
}

function enterFullscreen() {
  const el = document.documentElement as WebkitEl;
  if (el.requestFullscreen) el.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
  else el.webkitRequestFullscreen?.();
}

function exitFullscreen() {
  if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
  else (document as WebkitDoc).webkitExitFullscreen?.();
}

/** Home-screen app on Android or iOS: already without browser bars. */
export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Keeps the tablet screen on and (optionally) enters fullscreen on the first touch.
 *
 * The deck is served over plain http on the LAN, which is not a secure context,
 * so navigator.wakeLock is unavailable there. NoSleep falls back to a silent looping
 * video, which Chrome on Android honours. Both need a user gesture, hence the
 * first-touch hook.
 */
export function useKiosk() {
  useEffect(() => {
    const noSleep = new NoSleep();
    let armed = false;

    async function onFirstTouch() {
      if (armed) return;
      armed = true;
      try {
        await noSleep.enable();
      } catch {
        armed = false;
      }
      if (getPrefs().autoFullscreen && !isStandalone() && !fsElement()) enterFullscreen();
    }

    function onVisible() {
      // Video-based wake locks stop when the page is hidden; re-arm on next touch.
      if (document.visibilityState === "hidden") {
        noSleep.disable();
        armed = false;
      }
    }

    window.addEventListener("pointerdown", onFirstTouch, { capture: true });
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("pointerdown", onFirstTouch, { capture: true });
      document.removeEventListener("visibilitychange", onVisible);
      noSleep.disable();
    };
  }, []);
}

export function useFullscreen() {
  const [on, setOn] = useState(Boolean(fsElement()));
  useEffect(() => {
    const sync = () => setOn(Boolean(fsElement()));
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);
  const toggle = useCallback(() => (fsElement() ? exitFullscreen() : enterFullscreen()), []);
  const el = document.documentElement as WebkitEl;
  const supported = !isStandalone() && (typeof el.requestFullscreen === "function" || typeof el.webkitRequestFullscreen === "function");
  return { on, toggle, supported };
}

export function useClock(): string {
  const fmt = () => new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  const [now, setNow] = useState(fmt);
  useEffect(() => {
    const t = window.setInterval(() => setNow(fmt()), 10_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}
