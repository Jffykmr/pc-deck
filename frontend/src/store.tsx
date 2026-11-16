import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, checkPaired, getToken } from "./api";
import { diag } from "./lib/diag";
import type { Config, MediaState, SystemStats, VolumeState, WindowInfo } from "./types";

export interface LiveState {
  connected: boolean;
  foreground?: WindowInfo;
  volume?: VolumeState;
  windows: WindowInfo[];
  system?: SystemStats | null;
  media?: MediaState | null;
}

export type History = Record<"cpu" | "ram" | "gpu" | "disk" | "net" | "temp" | "power", number[]>;

interface Toast {
  id: number;
  text: string;
  tone: "error" | "info";
}

interface DeckCtx {
  /** null while checking, false when this device must pair with the PC. */
  paired: boolean | null;
  live: LiveState;
  history: History;
  config: Config | null;
  configError: string | null;
  saveConfig: (next: Config) => Promise<void>;
  reloadConfig: () => void;
  toasts: Toast[];
  notify: (text: string, tone?: Toast["tone"]) => void;
  /** Runs an action, surfacing failures as a toast. */
  act: (fn: () => Promise<unknown>) => Promise<boolean>;
}

const Ctx = createContext<DeckCtx | null>(null);

const HISTORY = 40;
const SHELL = new Set([
  "shellexperiencehost.exe",
  "startmenuexperiencehost.exe",
  "searchhost.exe",
  "searchapp.exe",
  "lockapp.exe",
  "textinputhost.exe",
  "taskmgr.exe",
  "unknown",
]);
const EMPTY_HISTORY: History = { cpu: [], ram: [], gpu: [], disk: [], net: [], temp: [], power: [] };

function useLiveSocket(enabled: boolean, onClosed: () => void) {
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;
  const [live, setLive] = useState<LiveState>({ connected: false, windows: [] });
  const [history, setHistory] = useState<History>(EMPTY_HISTORY);

  useEffect(() => {
    if (!enabled) return;
    let ws: WebSocket | undefined;
    let retry: number | undefined;
    let watchdog: number | undefined;
    let attempt = 0;
    let disposed = false;
    let lastMedia: LiveState["media"] = null;
    let lastFgName = "";
    let mediaSeen = 0;
    let shownFg: WindowInfo | undefined;
    let candidate: WindowInfo | undefined;
    let candidateSince = 0;

    /**
     * The foreground window flips briefly to shell surfaces (taskbar, Start, Alt+Tab,
     * toasts) and while switching apps. Each flip re-tinted the whole deck and
     * re-animated the command grid. Ignore shell processes and only commit a new
     * app once it has stayed in front for a moment.
     */
    function stableForeground(fg: WindowInfo | undefined, now: number): WindowInfo | undefined {
      if (!fg || SHELL.has(fg.process_name.toLowerCase()) || !fg.title) return shownFg;
      if (!shownFg || fg.process_name === shownFg.process_name) {
        shownFg = fg;
        candidate = undefined;
        return shownFg;
      }
      if (!candidate || candidate.process_name !== fg.process_name) {
        candidate = fg;
        candidateSince = now;
      } else if (now - candidateSince >= 900) {
        shownFg = fg;
        candidate = undefined;
      }
      return shownFg;
    }

    let build = "";
    const markStale = (why: string) => {
      diag("stale", why);
      setLive((s) => (s.connected ? { ...s, connected: false } : s));
    };

    function armWatchdog() {
      window.clearTimeout(watchdog);
      // The agent pushes every second. Silence for 5s means the link is dead even
      // if the socket hasn't noticed (common when the tablet wakes from sleep).
      watchdog = window.setTimeout(() => {
        markStale("watchdog 12s");
        ws?.close();
      }, 12000);
    }

    function connect() {
      if (disposed) return;
      window.clearTimeout(retry);
      ws?.close();
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const sock = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(getToken())}`);
      ws = sock;
      armWatchdog();
      sock.onopen = () => diag("ws-open", `attempt ${attempt}`);
      sock.onmessage = (ev) => {
        attempt = 0;
        armWatchdog();
        let data: Partial<LiveState> & { system?: SystemStats | null };
        try {
          data = JSON.parse(ev.data);
        } catch {
          return;
        }
        if ((data as { paired?: boolean }).paired === false) {
          onClosedRef.current(); // token revoked: back to the pairing screen
          return;
        }
        const now = Date.now();
        const incoming = (data as { build?: string }).build;
        if (incoming) {
          if (!build) build = incoming;
          else if (incoming !== build) {
            // A new UI was built on the PC: pick it up without a manual reload.
            diag("reload", "new build");
            window.setTimeout(() => location.reload(), 300);
          }
        }
        if (!data.media && lastMedia) diag("media-gap");
        // Media: a session can vanish for a tick while apps swap tracks. Hold the
        // last one for a few seconds instead of blinking the cover off and on.
        if (data.media) mediaSeen = now;
        const media = data.media ?? (now - mediaSeen < 4000 ? lastMedia : null);
        lastMedia = media;
        const foreground = stableForeground(data.foreground, now);
        if (foreground && foreground.process_name !== lastFgName) {
          diag("foreground", `${lastFgName} -> ${foreground.process_name}`);
          lastFgName = foreground.process_name;
        }
        setLive((prev) => ({
          connected: true,
          windows: data.windows ?? [],
          system: data.system ?? prev.system,
          media,
          // Keep last known values if a single source failed this tick.
          volume: data.volume ?? prev.volume,
          foreground: foreground ?? prev.foreground,
        }));
        const s = data.system;
        if (s) {
          setHistory((h) => {
            const push = (arr: number[], v: number) => [...arr.slice(-(HISTORY - 1)), v];
            return {
              cpu: push(h.cpu, s.cpu),
              ram: push(h.ram, s.ram),
              gpu: s.gpu === null ? h.gpu : push(h.gpu, s.gpu),
              disk: push(h.disk, s.disk_activity_mbps),
              net: push(h.net, s.network_mbps),
              temp: s.gpu_detail ? push(h.temp, s.gpu_detail.temp) : h.temp,
              power: s.gpu_detail ? push(h.power, s.gpu_detail.power) : h.power,
            };
          });
        }
      };
      sock.onclose = () => {
        if (ws !== sock) return;
        markStale("socket closed");
        window.clearTimeout(watchdog);
        if (disposed) return;
        // A revoked device sees only closed sockets: ask the PC once per retry.
        if (attempt % 3 === 0) onClosedRef.current();
        attempt += 1;
        retry = window.setTimeout(connect, Math.min(4000, 500 * attempt));
      };
      sock.onerror = () => sock.close();
    }

    function onVisible() {
      if (document.visibilityState === "visible") connect();
    }

    connect();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", connect);
    return () => {
      disposed = true;
      window.clearTimeout(retry);
      window.clearTimeout(watchdog);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", connect);
      ws?.close();
    };
  }, [enabled]);

  return { live, setLive, history };
}

export function DeckProvider({ children }: { children: ReactNode }) {
  const [paired, setPaired] = useState<boolean | null>(getToken() ? null : false);
  const recheck = useCallback(() => {
    // Unreachable (null) counts as paired: the offline veil handles that case.
    checkPaired().then((ok) => setPaired(ok !== false));
  }, []);
  useEffect(() => {
    if (paired === null) recheck();
  }, [paired, recheck]);
  const { live, history } = useLiveSocket(paired === true, recheck);
  const [config, setConfig] = useState<Config | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const notify = useCallback((text: string, tone: Toast["tone"] = "error") => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const reloadConfig = useCallback(() => {
    api
      .getConfig()
      .then((c) => {
        setConfig(c);
        setConfigError(null);
      })
      .catch((e: Error) => setConfigError(e.message));
  }, []);

  // Load config once, and again whenever the link comes back.
  useEffect(() => {
    if (live.connected && (!config || configError)) reloadConfig();
  }, [live.connected, config, configError, reloadConfig]);

  const saveConfig = useCallback(
    async (next: Config) => {
      setConfig(next);
      try {
        setConfig(await api.putConfig(next));
      } catch (e) {
        notify(`Salvataggio non riuscito: ${(e as Error).message}`);
        reloadConfig();
      }
    },
    [notify, reloadConfig],
  );

  const act = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        return true;
      } catch (e) {
        notify((e as Error).message);
        return false;
      }
    },
    [notify],
  );

  const value = useMemo(
    () => ({ paired, live, history, config, configError, saveConfig, reloadConfig, toasts, notify, act }),
    [paired, live, history, config, configError, saveConfig, reloadConfig, toasts, notify, act],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDeck(): DeckCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDeck outside DeckProvider");
  return ctx;
}

/** Lowercased exe basename, e.g. "C:\\...\\acad.exe" -> "acad.exe". */
export function exeName(path: string): string {
  return (path.split(/[\\/]/).pop() ?? "").toLowerCase();
}
