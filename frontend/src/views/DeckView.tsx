import { PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon, SpeakerHighIcon, SpeakerSlashIcon, WaveformIcon } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { useState } from "react";
import { api, mediaArt } from "../api";
import { Fader } from "../components/Fader";
import { Glyph } from "../components/Glyph";
import { Press } from "../components/Press";
import { useActiveContext } from "../lib/context";
import { useDeck } from "../store";

const AUTO = "__auto__";

/* ------------------------------------------------------------------ keybed */

function Keycap({ glyph, label, hint, keys, onPress }: { glyph?: string; label: string; hint?: string; keys?: string; onPress: () => void }) {
  return (
    <Press onClick={onPress} className="key flex min-h-[112px] flex-col justify-between p-4 text-left">
      <div className="flex items-start justify-between">
        <span className="text-accent">
          <Glyph name={glyph} size={34} weight="bold" />
        </span>
        <span className="lamp" />
      </div>
      <div className="min-w-0">
        <div className="display truncate text-[24px] leading-[1.05]">{label}</div>
        <div className="mt-1 truncate font-mono text-[11px] opacity-60">{keys ?? hint}</div>
      </div>
    </Press>
  );
}

function Keybed() {
  const { config, act } = useDeck();
  const ctx = useActiveContext();
  const [pinned, setPinned] = useState(AUTO);
  const profiles = config?.profiles ?? {};
  const keys = Object.keys(profiles);
  const activeKey = pinned !== AUTO ? pinned : ctx.profileKey;
  const profile = activeKey ? profiles[activeKey] : undefined;

  const caps = profile
    ? profile.commands.map((c) => ({
        id: c.id,
        glyph: c.icon,
        label: c.label,
        hint: c.subtitle,
        keys: c.keys.trim().toLowerCase() !== c.label.trim().toLowerCase() ? c.keys : undefined,
        run: () => act(() => api.runCommand(activeKey!, c.id)),
      }))
    : (config?.shortcuts ?? []).map((s) => ({ id: s.id, glyph: s.icon, label: s.label, hint: s.hint, keys: undefined, run: () => act(() => (s.exe ? api.launchExe(s.exe) : api.sendKeys(s.keys ?? ""))) }));

  // Balance the bed: 6 keys sit as 3x2, 12 as 4x3, never five plus an orphan.
  const rows = Math.max(1, Math.ceil(caps.length / 5));
  const cols = Math.max(1, Math.ceil(caps.length / rows));

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <div className="flex h-9 shrink-0 items-center justify-between gap-4">
        <div className="label">{profile ? `Comandi · ${profile.label}` : "Comandi di sistema"}</div>
        {keys.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto">
            {[AUTO, ...keys].map((k) => (
              <button
                key={k}
                onClick={() => setPinned(k)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-[13px] font-semibold ${pinned === k ? "bg-ink text-bg" : "bg-raised text-muted"}`}
              >
                {k === AUTO ? "Auto" : profiles[k].label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-1.5">
        <motion.div
          key={profile ? `p:${activeKey}` : "shortcuts"}
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.02 } } }}
          className="grid min-h-full auto-rows-[minmax(112px,1fr)] gap-3 pb-1"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {caps.map((c) => (
            <motion.div key={c.id} className="grid" variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.12 } } }}>
              <Keycap glyph={c.glyph} label={c.label} hint={c.hint} keys={c.keys} onPress={c.run} />
            </motion.div>
          ))}
          {profile && profile.commands.length === 0 && (
            <div className="col-span-full flex items-center justify-center text-[15px] text-muted">Nessun comando in questo profilo. Aggiungili da Imposta.</div>
          )}
        </motion.div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ side strip */

function SideStrip() {
  const { live, act } = useDeck();
  const m = live.media;
  const vol = live.volume;
  const has = Boolean(m && (m.title || m.artist));
  const art = m?.art ? mediaArt(m.art) : null;
  const pct = m && m.duration > 0 ? Math.min(100, (m.position / m.duration) * 100) : 0;
  const Mute = vol?.muted ? SpeakerSlashIcon : SpeakerHighIcon;

  return (
    <aside className="panel flex w-[232px] shrink-0 flex-col gap-3 p-3.5 max-lg:w-full max-lg:flex-row">
      <div className="flex min-w-0 flex-col gap-3 max-lg:flex-1">
        <div className="aspect-[3/2] w-full shrink-0 overflow-hidden rounded-[14px] bg-bg max-lg:w-40" style={{ boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.06)" }}>
          {art ? (
            <img src={art} alt="" className="h-full w-full object-cover" draggable={false} />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-faint">
              <WaveformIcon size={44} weight="light" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold leading-tight">{has ? m!.title : "Niente in riproduzione"}</div>
          <div className="mt-0.5 truncate text-[13px] text-muted">{has ? m!.artist || m!.album : "Avvia Spotify o un video"}</div>
          {has && m!.duration > 0 && (
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
              <div className="live-meter h-full origin-left bg-tint" style={{ transform: `scaleX(${pct / 100})`, transition: m!.playing ? "transform 1s linear" : "transform 200ms ease" }} />
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Press aria-label="Precedente" onClick={() => act(() => api.media("prev"))} className="ctl flex h-12 flex-1 items-center justify-center">
            <SkipBackIcon size={20} weight="fill" />
          </Press>
          <Press aria-label={m?.playing ? "Pausa" : "Riproduci"} onClick={() => act(() => api.media("playpause"))} className="ctl flex h-12 flex-[1.4] items-center justify-center">
            {m?.playing ? <PauseIcon size={22} weight="fill" /> : <PlayIcon size={22} weight="fill" />}
          </Press>
          <Press aria-label="Successivo" onClick={() => act(() => api.media("next"))} className="ctl flex h-12 flex-1 items-center justify-center">
            <SkipForwardIcon size={20} weight="fill" />
          </Press>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 max-lg:w-40 max-lg:flex-none">
        <Fader value={vol?.level ?? 0} muted={vol?.muted ?? false} onChange={(v) => act(() => api.setVolume(v))} />
        <Press
          aria-label={vol?.muted ? "Riattiva audio" : "Disattiva audio"}
          onClick={() => act(api.toggleMute)}
          className={`flex h-12 shrink-0 items-center justify-center gap-2 rounded-[14px] text-[14px] font-semibold ${vol?.muted ? "bg-danger text-bg" : "ctl"}`}
        >
          <Mute size={20} weight="bold" />
          {vol?.muted ? "Muto" : "Audio"}
        </Press>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ layout */

export default function DeckView() {
  return (
    <div className="flex h-full gap-3 max-lg:flex-col max-lg:overflow-y-auto">
      <Keybed />
      <SideStrip />
    </div>
  );
}
