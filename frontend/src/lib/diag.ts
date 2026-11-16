import { getToken } from "../api";

/**
 * Lightweight client timeline sent to the PC (host-agent/diag.log). Used to
 * find what the tablet was doing when a visual glitch happened.
 */
type Event = { t: string; kind: string; detail?: string };

const queue: Event[] = [];
const start = performance.now();

export function diag(kind: string, detail?: unknown) {
  const now = new Date();
  const t = `${now.toLocaleTimeString("it-IT")}.${String(now.getMilliseconds()).padStart(3, "0")}`;
  queue.push({ t, kind, detail: detail === undefined ? undefined : typeof detail === "string" ? detail : JSON.stringify(detail) });
  if (queue.length > 300) queue.splice(0, queue.length - 300);
}

async function flush() {
  if (!queue.length || !getToken()) return;
  const batch = queue.splice(0, queue.length);
  try {
    await fetch("/api/diag", { method: "POST", headers: { "Content-Type": "application/json", "X-Deck-Token": getToken() }, body: JSON.stringify(batch) });
  } catch {
    queue.unshift(...batch.slice(-100));
  }
}

export function startDiagnostics() {
  diag("load", { ua: navigator.userAgent, w: innerWidth, h: innerHeight, dpr: devicePixelRatio, secure: isSecureContext });
  window.setInterval(flush, 5000);

  let lastW = innerWidth;
  let lastH = innerHeight;
  window.addEventListener("resize", () => {
    diag("resize", `${lastW}x${lastH} -> ${innerWidth}x${innerHeight}`);
    lastW = innerWidth;
    lastH = innerHeight;
  });
  document.addEventListener("visibilitychange", () => diag("visibility", document.visibilityState));
  document.addEventListener("fullscreenchange", () => diag("fullscreen", Boolean(document.fullscreenElement)));
  window.addEventListener("error", (e) => diag("js-error", `${e.message} @${e.filename}:${e.lineno}`));
  window.addEventListener("unhandledrejection", (e) => diag("promise-error", String(e.reason)));

  // Frame hitches: a gap this long between animation frames is a visible stutter.
  let prev = performance.now();
  const loop = (ts: number) => {
    if (document.visibilityState === "visible" && ts - prev > 250 && ts - start > 5000) {
      diag("long-frame", `${Math.round(ts - prev)}ms`);
    }
    prev = ts;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
