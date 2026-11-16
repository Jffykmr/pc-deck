import { useEffect, useMemo } from "react";
import { exeName, useDeck } from "../store";
import type { AppDef, Profile } from "../types";

const DEFAULT_TINT = "#F26B21"; // lamp orange when no known app is in front

export interface ActiveContext {
  /** Brand color of the foreground app, or the default mint. */
  tint: string;
  app?: AppDef;
  profileKey?: string;
  profile?: Profile;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0");
  const n = parseInt(full.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Lift very dark brand colors so text and strokes stay legible on the dark base. */
function readable([r, g, b]: [number, number, number]): [number, number, number] {
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const mix = lum < 0.45 ? 0.3 : lum < 0.6 ? 0.15 : 0;
  return [r, g, b].map((c) => Math.round(c + (255 - c) * mix)) as [number, number, number];
}

export function useActiveContext(): ActiveContext {
  const { live, config } = useDeck();
  const fg = live.foreground?.process_name?.toLowerCase();

  return useMemo(() => {
    if (!config || !fg) return { tint: DEFAULT_TINT };
    const app = config.apps.find((a) => exeName(a.exe) === fg);
    const profileKey = Object.keys(config.profiles).find((k) => k.toLowerCase() === fg);
    const profile = profileKey ? config.profiles[profileKey] : undefined;
    return { tint: app?.color || profile?.color || DEFAULT_TINT, app, profileKey, profile };
  }, [config, fg]);
}

/**
 * Color rule: the whole deck takes ONE accent at a time, the brand color of the
 * app in the foreground (lamp orange when none).
 */
export function useTintVariables(tint: string) {
  useEffect(() => {
    const raw = hexToRgb(tint);
    const [r, g, b] = readable(raw);
    const s = document.documentElement.style;
    s.setProperty("--tint", raw.join(" "));
    s.setProperty("--accent", `${r} ${g} ${b}`);
    // Ink on the tint field: black on light fields (yellow, orange), white on dark ones.
    const lum = (0.2126 * raw[0] + 0.7152 * raw[1] + 0.0722 * raw[2]) / 255;
    s.setProperty("--on", lum > 0.52 ? "22 22 21" : "255 255 255");
  }, [tint]);
}
