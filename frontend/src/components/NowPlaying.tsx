import { PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon, WaveformIcon } from "@phosphor-icons/react";
import { api, mediaArt } from "../api";
import { useDeck } from "../store";
import { Press } from "./Press";

function time(sec: number) {
  if (!Number.isFinite(sec) || sec <= 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function Equalizer({ on }: { on: boolean }) {
  return (
    <span className="flex h-3.5 items-end gap-[3px]" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="w-[3px] origin-bottom bg-accent"
          style={{
            height: "100%",
            animation: on ? `eq ${0.7 + i * 0.13}s ease-in-out ${i * 0.09}s infinite` : "none",
            transform: on ? undefined : "scaleY(0.25)",
          }}
        />
      ))}
    </span>
  );
}

export function NowPlaying({ size = "md" }: { size?: "md" | "lg" }) {
  const { live, act } = useDeck();
  const m = live.media;
  const has = Boolean(m && (m.title || m.artist));
  const artUrl = m?.art ? mediaArt(m.art) : null;
  const big = size === "lg";
  const artSize = big ? 220 : 104;
  const pct = m && m.duration > 0 ? Math.min(100, (m.position / m.duration) * 100) : 0;

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div className={`relative flex min-h-0 flex-1 items-center ${big ? "gap-8" : "gap-4"}`}>
        <div
          className="relative shrink-0 overflow-hidden rounded-[8px] bg-white/[0.08]"
          style={{ width: artSize, height: artSize }}
        >
          {artUrl ? (
            <img src={artUrl} alt="" className="h-full w-full object-cover" draggable={false} />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-faint">
              <WaveformIcon size={big ? 72 : 38} weight="light" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.08em] text-muted">
            {has && <Equalizer on={Boolean(m?.playing)} />}
            <span className="truncate">{has ? m!.source || "In riproduzione" : "Musica"}</span>
          </div>
          <div className={`display truncate leading-tight ${big ? "text-[56px]" : "text-[30px]"}`}>
            {has ? m!.title : "Niente in riproduzione"}
          </div>
          <div className={`truncate text-muted ${big ? "mt-1 text-[24px]" : "text-[15px]"}`}>
            {has ? m!.artist || m!.album : "Avvia Spotify o un video nel browser"}
          </div>

          {has && m!.duration > 0 && (
            <div className={big ? "mt-6" : "mt-3"}>
              <div className="h-1.5 overflow-hidden bg-white/15">
                <div
                  className="live-meter h-full origin-left bg-ink"
                  style={{ transform: `scaleX(${pct / 100})`, transition: m!.playing ? "transform 1s linear" : "transform 200ms ease" }}
                />
              </div>
              <div className="num mt-1.5 flex justify-between text-[11px] text-muted">
                <span>{time(m!.position)}</span>
                <span>{time(m!.duration)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {!big && (
        <div className="relative mt-3 flex items-center justify-center gap-3">
          <Press aria-label="Precedente" onClick={() => act(() => api.media("prev"))} className="flex h-12 w-14 items-center justify-center rounded-[10px] text-ink/90 active:bg-white/10">
            <SkipBackIcon size={24} weight="fill" />
          </Press>
          <Press
            aria-label={m?.playing ? "Pausa" : "Riproduci"}
            onClick={() => act(() => api.media("playpause"))}
            className="flex h-14 w-14 items-center justify-center rounded-[10px] bg-ink text-bg"
          >
            {m?.playing ? <PauseIcon size={24} weight="fill" /> : <PlayIcon size={24} weight="fill" />}
          </Press>
          <Press aria-label="Successivo" onClick={() => act(() => api.media("next"))} className="flex h-12 w-14 items-center justify-center rounded-[10px] text-ink/90 active:bg-white/10">
            <SkipForwardIcon size={24} weight="fill" />
          </Press>
        </div>
      )}
    </div>
  );
}
