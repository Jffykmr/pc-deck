import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { WaveformIcon } from "@phosphor-icons/react";
import { mediaArt } from "../api";
import { diag } from "../lib/diag";
import { useClock } from "../lib/kiosk";
import { usePrefs } from "../lib/prefs";
import { useDeck } from "../store";
import { Dial } from "./Dial";

/**
 * "Vetrina": after a few idle minutes the deck becomes a full-screen display
 * piece (big clock, now playing, live desktop, machine vitals). The first touch
 * only dismisses it, it never reaches the controls underneath.
 */
/** Idle state for the "vetrina". `covered` turns true once the fade-in has finished. */
export function useShowcase() {
  const { idleMinutes } = usePrefs();
  const [idle, setIdle] = useState(false);
  const [covered, setCovered] = useState(false);

  useEffect(() => {
    if (!idleMinutes) return;
    let t: number | undefined;
    const arm = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        diag("showcase", "on");
        setIdle(true);
      }, idleMinutes * 60_000);
    };
    arm();
    window.addEventListener("pointerdown", arm, { capture: true });
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pointerdown", arm, { capture: true });
    };
  }, [idleMinutes]);

  useEffect(() => {
    if (!idle) {
      setCovered(false);
      return;
    }
    const t = window.setTimeout(() => setCovered(true), 1300);
    return () => window.clearTimeout(t);
  }, [idle]);

  const wake = () => {
    diag("showcase", "off");
    setIdle(false);
  };
  return { idle, covered, wake };
}

/**
 * "Vetrina": after a few idle minutes the deck becomes a full-screen display
 * piece. The layer is fully opaque and the deck underneath is unmounted once it
 * is covered: before, the whole deck kept repainting behind a 96% layer and the
 * page showed a second live screen stream, which flickered on the tablet.
 */
export function Showcase({ idle, onWake }: { idle: boolean; onWake: () => void }) {
  return (
    <AnimatePresence>
      {idle && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.25 } }}
          transition={{ duration: 1.2 }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onWake();
          }}
          className="fixed inset-0 z-[60] overflow-hidden bg-bg"
        >
          <ShowcaseBody />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ShowcaseBody() {
  const { live } = useDeck();
  const time = useClock();
  const s = live.system;
  const m = live.media;
  const has = Boolean(m && (m.title || m.artist));
  const art = m?.art ? mediaArt(m.art) : null;
  const pct = m && m.duration > 0 ? Math.min(100, (m.position / m.duration) * 100) : 0;
  const now = new Date();
  const weekday = now.toLocaleDateString("it-IT", { weekday: "long" });
  const rest = now.toLocaleDateString("it-IT", { day: "numeric", month: "long" });

  return (
    <div className="flex h-full items-center gap-14 p-10 max-lg:flex-col max-lg:gap-6 max-lg:p-6">
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2, duration: 1 }} className="aspect-square h-full max-h-[720px] shrink-0 max-lg:h-auto max-lg:w-full max-lg:max-w-[520px]">
        <Dial cpu={s?.cpu} gpu={s?.gpu} temp={s?.gpu_detail?.temp} />
      </motion.div>

      <motion.div initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5, duration: 1 }} className="flex h-full min-w-0 flex-1 flex-col justify-between max-lg:w-full">
        <div>
          <div className="label flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-tint" />
            {time}
          </div>
          <div className="display mt-3 text-[64px] capitalize leading-[0.95]">{weekday}</div>
          <div className="display text-[64px] capitalize leading-[0.95] text-muted">{rest}</div>
        </div>

        {/* Always mounted: toggling it on short media gaps made the middle blink. */}
        <div style={{ opacity: has ? 1 : 0.4, transition: "opacity 600ms ease" }} className="min-w-0">
          <div className="aspect-square w-[min(300px,30vh)] overflow-hidden rounded-[18px] bg-surface">
            {art ? (
              <img src={art} alt="" className="h-full w-full object-cover" draggable={false} />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-faint">
                <WaveformIcon size={72} weight="light" />
              </div>
            )}
          </div>
          <div className="display mt-4 truncate text-[40px] leading-[1.05]">{has ? m!.title : "Niente in riproduzione"}</div>
          <div className="mt-1 truncate text-[20px] text-muted">{has ? m!.artist || m!.album : "Avvia Spotify o un video"}</div>
          {has && m!.duration > 0 && (
            <div className="mt-4 h-1.5 w-[min(300px,30vh)] overflow-hidden rounded-full bg-white/10">
              <div className="live-meter h-full origin-left bg-tint" style={{ transform: `scaleX(${pct / 100})`, transition: m!.playing ? "transform 1s linear" : "transform 200ms ease" }} />
            </div>
          )}
        </div>

        <div className="label">Tocca per tornare al deck</div>
      </motion.div>
    </div>
  );
}
