import {
  ChartLineIcon,
  CornersInIcon,
  CornersOutIcon,
  GearSixIcon,
  MonitorArrowUpIcon,
  SquaresFourIcon,
  StackIcon,
  type Icon,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { api, iconForApp } from "../api";
import { useFullscreen } from "../lib/kiosk";
import { openSpacedesk } from "../lib/spacedesk";
import { exeName, useDeck } from "../store";
import type { AppDef, WindowInfo } from "../types";
import { ExeIcon } from "./ExeIcon";
import { Press } from "./Press";

const NAV: { to: string; label: string; icon: Icon; end?: boolean }[] = [
  { to: "/", label: "Deck", icon: SquaresFourIcon, end: true },
  { to: "/finestre", label: "Finestre", icon: StackIcon },
  { to: "/sistema", label: "Sistema", icon: ChartLineIcon },
  { to: "/impostazioni", label: "Imposta", icon: GearSixIcon },
];

function AppKey({ app, win }: { app: AppDef; win?: WindowInfo }) {
  const { act } = useDeck();
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    if (win) setLaunching(false);
  }, [win]);
  useEffect(() => {
    if (!launching) return;
    const t = window.setTimeout(() => setLaunching(false), 25_000);
    return () => window.clearTimeout(t);
  }, [launching]);

  async function press() {
    if (win) return void act(() => api.focusWindow(win.hwnd));
    if (launching) return;
    setLaunching(true);
    if (!(await act(() => api.launchApp(app.id)))) setLaunching(false);
  }

  const color = app.color || "#8E8E93";
  return (
    <Press aria-label={app.label} onClick={press} className="key flex h-[64px] w-[72px] shrink-0 flex-col items-center justify-center gap-1.5">
      <ExeIcon src={iconForApp(app.id, 128)} glyph={app.icon} size={32} className={launching ? "animate-pulse" : ""} />
      {/* Lamp strip: lit in the app's own colour while its window is open. */}
      <span className="h-[4px] w-7 rounded-full" style={{ background: win || launching ? color : "rgb(255 255 255 / 0.12)", opacity: launching && !win ? 0.6 : 1 }} />
    </Press>
  );
}

/** Launcher and page switch in one row: apps on the left, destinations on the right. */
export function BottomBar() {
  const { live, config } = useDeck();
  const fs = useFullscreen();
  const byExe = useMemo(() => {
    const map = new Map<string, WindowInfo>();
    for (const w of live.windows) if (!map.has(w.process_name.toLowerCase())) map.set(w.process_name.toLowerCase(), w);
    return map;
  }, [live.windows]);

  return (
    <nav className="panel flex h-[92px] shrink-0 items-center gap-3 px-3.5">
      <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-x-auto py-2 pb-3">
        {config?.apps.map((a) => <AppKey key={a.id} app={a} win={byExe.get(exeName(a.exe))} />)}
      </div>

      <div className="flex shrink-0 items-center gap-1 rounded-[16px] bg-bg p-1.5" style={{ boxShadow: "inset 0 2px 0 rgb(0 0 0 / 0.5)" }}>
        {NAV.map(({ to, label, icon: I, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex h-[60px] min-w-[84px] flex-col items-center justify-center gap-1 rounded-[12px] px-3 ${isActive ? "text-[rgb(var(--on))]" : "text-muted"}`
            }
            style={({ isActive }) => (isActive ? { background: "rgb(var(--tint))" } : undefined)}
          >
            {({ isActive }) => (
              <>
                <I size={24} weight={isActive ? "fill" : "bold"} />
                <span className="text-[12px] font-semibold">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>

      <div className="flex shrink-0 gap-2">
        <Press aria-label="Usa il tablet come secondo schermo" onClick={openSpacedesk} className="ctl flex h-12 w-12 items-center justify-center">
          <MonitorArrowUpIcon size={22} />
        </Press>
        {fs.supported && (
          <Press aria-label={fs.on ? "Esci da schermo intero" : "Schermo intero"} onClick={fs.toggle} className="ctl flex h-12 w-12 items-center justify-center">
            {fs.on ? <CornersInIcon size={22} /> : <CornersOutIcon size={22} />}
          </Press>
        )}
      </div>
    </nav>
  );
}
