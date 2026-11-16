import { useSyncExternalStore } from "react";

/** Per-tablet preferences, kept in localStorage (never on the PC). */
export interface Prefs {
  autoFullscreen: boolean;
  richEffects: boolean;
  screenPreview: boolean;
  idleMinutes: number;
}

const KEY = "pc-deck-prefs";
const DEFAULTS: Prefs = { autoFullscreen: true, richEffects: true, screenPreview: true, idleMinutes: 3 };
const listeners = new Set<() => void>();

function read(): Prefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return DEFAULTS;
  }
}

let current = read();

export function getPrefs(): Prefs {
  return current;
}

export function setPrefs(patch: Partial<Prefs>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // storage blocked: keep in memory for this session
  }
  listeners.forEach((l) => l());
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}
