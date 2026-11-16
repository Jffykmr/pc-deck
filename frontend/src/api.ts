import type { AppDef, Config, SystemStats, VolumeState, WindowInfo } from "./types";

const TOKEN_KEY = "pc-deck-token";

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // storage blocked: token lives only for this session
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 8000);
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "X-Deck-Token": getToken() },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("PC non raggiungibile");
  } finally {
    window.clearTimeout(timer);
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail || detail;
    } catch {
      // not JSON
    }
    throw new Error(detail);
  }
  return res.json();
}

const q = () => `token=${encodeURIComponent(getToken())}`;

export const iconForPid = (pid: number, size = 64) => `/api/icon?pid=${pid}&size=${size}&${q()}`;
export const mediaArt = (key: string) => `/api/media/art?v=${encodeURIComponent(key)}&${q()}`;
export const screenFrame = (n: number) => `/api/screen.jpg?n=${n}&${q()}`;
export const iconForApp = (id: string, size = 128) => `/api/apps/${encodeURIComponent(id)}/icon?size=${size}&${q()}`;

export interface Device {
  id: string;
  name: string;
  paired_at?: number;
  last_seen?: number;
}

/** Exchanges the code shown on the PC for this device's own token. */
export async function pairDevice(code: string, name: string): Promise<void> {
  const res = await fetch("/api/pair", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, name }),
  }).catch(() => {
    throw new Error("PC non raggiungibile");
  });
  if (!res.ok) throw new Error(res.status === 403 ? "Codice errato o scaduto" : `Errore ${res.status}`);
  setToken((await res.json()).token);
}

/** true = paired, false = the PC rejects this device, null = PC unreachable. */
export async function checkPaired(): Promise<boolean | null> {
  if (!getToken()) return false;
  try {
    const res = await fetch("/api/whoami", { headers: { "X-Deck-Token": getToken() }, cache: "no-store" });
    if (res.status === 401) return false;
    return res.ok ? true : null;
  } catch {
    return null;
  }
}

export const api = {
  whoami: () => request<Device>("GET", "/api/whoami"),
  devices: () => request<Device[]>("GET", "/api/devices"),
  revokeDevice: (id: string) => request<{ ok: boolean }>("DELETE", `/api/devices/${encodeURIComponent(id)}`),

  apps: () => request<AppDef[]>("GET", "/api/apps"),
  launchApp: (id: string) => request<{ ok: boolean; pid: number }>("POST", `/api/apps/${encodeURIComponent(id)}/launch`),
  launchExe: (exe: string) => request<{ ok: boolean }>("POST", "/api/launch", { exe, args: [] }),

  windows: () => request<{ windows: WindowInfo[] }>("GET", "/api/windows"),
  focusWindow: (hwnd: number) => request<{ ok: boolean }>("POST", `/api/windows/${hwnd}/focus`),
  closeWindow: (hwnd: number) => request<{ ok: boolean }>("POST", `/api/windows/${hwnd}/close`),

  setVolume: (level: number) => request<VolumeState>("POST", "/api/volume", { level }),
  toggleMute: () => request<VolumeState>("POST", "/api/volume/mute", {}),

  runCommand: (processName: string, commandId: string) =>
    request<{ ok: boolean }>(
      "POST",
      `/api/profiles/${encodeURIComponent(processName)}/commands/${encodeURIComponent(commandId)}/run`,
    ),
  media: (action: "playpause" | "next" | "prev") => request<{ ok: boolean }>("POST", `/api/media/${action}`),
  sendKeys: (keys: string) => request<{ ok: boolean }>("POST", "/api/keys", { keys }),

  displayStatus: () => request<{ running: boolean; installed?: boolean }>("GET", "/api/display/status"),
  displayStart: () => request<{ ok: boolean }>("POST", "/api/display/start-server"),

  getConfig: () => request<Config>("GET", "/api/config"),
  putConfig: (config: Config) => request<Config>("PUT", "/api/config", config),

  system: () => request<SystemStats>("GET", "/api/system"),
  lock: () => request<{ ok: boolean }>("POST", "/api/power/lock"),
  sleepDisplay: () => request<{ ok: boolean }>("POST", "/api/display/sleep"),
  shutdown: (delay = 15) => request<{ ok: boolean }>("POST", "/api/power/shutdown", { delay_seconds: delay }),
  restart: (delay = 15) => request<{ ok: boolean }>("POST", "/api/power/restart", { delay_seconds: delay }),
  cancelPower: () => request<{ ok: boolean }>("POST", "/api/power/cancel"),
};
