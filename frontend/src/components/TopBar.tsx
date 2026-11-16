import { iconForApp, iconForPid } from "../api";
import { useActiveContext } from "../lib/context";
import { useClock } from "../lib/kiosk";
import { useDeck } from "../store";
import { ExeIcon } from "./ExeIcon";
import { Glyph } from "./Glyph";
import { Counter, heatColor } from "./Instruments";
import { ScreenLive } from "./ScreenLive";

function pretty(name?: string) {
  if (!name) return "";
  const base = name.replace(/\.exe$/i, "");
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function Vital({ label, value, unit, color }: { label: string; value: number | null | undefined; unit: string; color?: string }) {
  return (
    <div className="flex flex-col items-start leading-none">
      <span className="label !text-[10px]">{label}</span>
      <span className="display mt-1.5 text-[26px]" style={{ color }}>
        <Counter value={value} />
        <span className="ml-0.5 text-[14px] text-muted">{unit}</span>
      </span>
    </div>
  );
}

/** Instrument head: who is in front, the monitor as a thin strip, machine vitals, time. */
export function TopBar() {
  const { live } = useDeck();
  const ctx = useActiveContext();
  const time = useClock();
  const fg = live.foreground;
  const s = live.system;
  const title = ctx.profile?.label ?? ctx.app?.label ?? (fg ? pretty(fg.process_name) : "Pronto");

  return (
    <header className="panel flex h-[84px] shrink-0 items-center gap-5 overflow-hidden px-4">
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[14px] bg-bg" style={{ boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.06)" }}>
          {ctx.app || fg ? (
            <ExeIcon src={ctx.app ? iconForApp(ctx.app.id, 128) : iconForPid(fg!.pid, 64)} glyph={ctx.app?.icon} size={34} />
          ) : (
            <Glyph name="app" size={26} className="text-muted" />
          )}
        </div>
        <div className="min-w-0">
          <div className="label flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-tint" />
            In primo piano
          </div>
          <div className="display mt-1 truncate text-[30px] leading-none">{title}</div>
          <div className="mt-1 truncate text-[12px] text-muted">{fg?.title || "Nessuna finestra attiva sul PC"}</div>
        </div>
      </div>

      {/* The 5120x1440 monitor as a strip, one frame every ~2 s. */}
      <div className="h-[60px] w-[213px] shrink-0 overflow-hidden rounded-[10px] bg-bg max-lg:hidden" style={{ boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.06)" }}>
        <ScreenLive className="h-full w-full" />
      </div>

      <div className="flex shrink-0 items-center gap-6 max-lg:hidden">
        <Vital label="CPU" value={s?.cpu} unit="%" />
        <Vital label="GPU" value={s?.gpu} unit="%" />
        <Vital label="Temp" value={s?.gpu_detail?.temp} unit="°" color={heatColor(s?.gpu_detail?.temp)} />
        <Vital label="RAM" value={s?.ram} unit="%" />
      </div>

      <div className="display num shrink-0 border-l border-white/10 pl-5 text-[44px] leading-none">{time}</div>
    </header>
  );
}
