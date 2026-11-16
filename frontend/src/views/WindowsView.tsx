import { XIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { api, iconForPid } from "../api";
import { ExeIcon } from "../components/ExeIcon";
import { Press } from "../components/Press";
import { useDeck } from "../store";
import type { WindowInfo } from "../types";

function CloseButton({ win }: { win: WindowInfo }) {
  const { act } = useDeck();
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 3000);
    return () => window.clearTimeout(t);
  }, [armed]);

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (armed) {
          setArmed(false);
          act(() => api.closeWindow(win.hwnd));
        } else {
          setArmed(true);
        }
      }}
      aria-label={`Chiudi ${win.title}`}
      className={`flex h-11 shrink-0 items-center justify-center rounded-full text-[13px] font-medium transition-all ${
        armed ? "bg-danger/20 px-4 text-danger" : "w-11 text-faint active:bg-raised"
      }`}
    >
      {armed ? "Chiudi" : <XIcon size={18} />}
    </button>
  );
}

export default function WindowsView() {
  const { live, act } = useDeck();
  const fgHwnd = live.foreground?.hwnd;

  return (
    <section className="panel flex h-full min-h-0 flex-col p-3">
      <header className="flex items-baseline justify-between px-1.5 pb-3 pt-2">
        <h2 className="text-[19px] font-semibold tracking-tight">Finestre aperte</h2>
        <span className="num text-[13px] text-faint">{live.windows.length}</span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {live.windows.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[15px] text-muted">
            Nessuna finestra aperta sul PC.
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-2">
            {live.windows.map((w) => {
              const active = w.hwnd === fgHwnd;
              return (
                <div
                  key={w.hwnd}
                  className="ctl flex items-center pr-1.5"
                  style={active ? { boxShadow: "inset 0 0 0 1.5px rgb(var(--accent) / 0.8)" } : undefined}
                >
                  <Press
                    onClick={() => act(() => api.focusWindow(w.hwnd))}
                    className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 text-left"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-ctl bg-bg">
                      <ExeIcon src={iconForPid(w.pid, 64)} size={30} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-medium leading-snug">{w.title}</div>
                      <div className={`truncate text-[12px] ${active ? "text-accent" : "text-faint"}`}>
                        {active ? "In primo piano" : w.process_name}
                      </div>
                    </div>
                  </Press>
                  <CloseButton win={w} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
