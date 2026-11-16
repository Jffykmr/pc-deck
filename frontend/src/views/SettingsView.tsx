import { CaretDownIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, setToken, type Device } from "../api";
import { Glyph, GLYPH_NAMES } from "../components/Glyph";
import { Press } from "../components/Press";
import { setPrefs, usePrefs } from "../lib/prefs";
import { useDeck } from "../store";
import type { AppDef, Command, Config, Profile } from "../types";

function uniqueId(base: string, taken: Iterable<string>) {
  const set = new Set(taken);
  let id = base;
  let n = 2;
  while (set.has(id)) id = `${base}-${n++}`;
  return id;
}

/** Local draft of the config, persisted with a debounce so typing doesn't PUT per keystroke. */
function useDraft() {
  const { config, saveConfig } = useDeck();
  const [draft, setDraft] = useState<Config | null>(config);
  const [saved, setSaved] = useState(true);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef<Config | null>(null);

  useEffect(() => {
    if (saved) setDraft(config);
  }, [config, saved]);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      if (latest.current) saveConfig(latest.current);
    },
    [saveConfig],
  );

  function update(next: Config) {
    setDraft(next);
    setSaved(false);
    latest.current = next;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      latest.current = null;
      await saveConfig(next);
      setSaved(true);
    }, 700);
  }

  return { draft, update, saved };
}

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function IconPicker({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink">
        <Glyph name={value} size={18} />
      </span>
      <select value={value || "app"} onChange={(e) => onChange(e.target.value)} className="field appearance-none pl-10 pr-9">
        {GLYPH_NAMES.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <CaretDownIcon size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-faint" />
    </div>
  );
}

function Remove({ onClick, label }: { onClick: () => void; label: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 3000);
    return () => window.clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => (armed ? onClick() : setArmed(true))}
      className={`flex h-11 shrink-0 items-center justify-center rounded-full text-[13px] font-medium ${
        armed ? "bg-danger/20 px-4 text-danger" : "w-11 text-faint active:bg-raised"
      }`}
    >
      {armed ? "Elimina" : <TrashIcon size={18} />}
    </button>
  );
}

function AddRow({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <Press onClick={onClick} className="flex h-12 w-full items-center justify-center gap-2 rounded-ctl text-[15px] font-medium text-muted" style={{ boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.08)" }}>
      <PlusIcon size={18} /> {children}
    </Press>
  );
}

function AppsEditor({ config, update }: { config: Config; update: (c: Config) => void }) {
  const patch = (id: string, p: Partial<AppDef>) =>
    update({ ...config, apps: config.apps.map((a) => (a.id === id ? { ...a, ...p } : a)) });

  return (
    <div className="flex flex-col gap-2">
      {config.apps.map((app) => (
        <div key={app.id} className="ctl grid grid-cols-2 gap-3 p-3.5">
          <Field label="Nome">
            <input className="field" value={app.label} onChange={(e) => patch(app.id, { label: e.target.value })} />
          </Field>
          <Field label="Sottotitolo">
            <input className="field" value={app.subtitle ?? ""} onChange={(e) => patch(app.id, { subtitle: e.target.value })} />
          </Field>
          <Field label="Percorso eseguibile" className="col-span-2">
            <input
              className="field num text-[13px]"
              value={app.exe}
              placeholder="C:\Program Files\...\app.exe"
              onChange={(e) => patch(app.id, { exe: e.target.value })}
            />
          </Field>
          <div className="col-span-2 flex items-end gap-2">
            <Field label="Icona di riserva" className="flex-1">
              <IconPicker value={app.icon} onChange={(icon) => patch(app.id, { icon })} />
            </Field>
            <Remove label={`Elimina ${app.label}`} onClick={() => update({ ...config, apps: config.apps.filter((a) => a.id !== app.id) })} />
          </div>
        </div>
      ))}
      <AddRow
        onClick={() =>
          update({
            ...config,
            apps: [...config.apps, { id: uniqueId("app", config.apps.map((a) => a.id)), label: "Nuova app", exe: "", icon: "app" }],
          })
        }
      >
        Aggiungi app
      </AddRow>
    </div>
  );
}

function ProfileEditor({
  pkey,
  profile,
  config,
  update,
}: {
  pkey: string;
  profile: Profile;
  config: Config;
  update: (c: Config) => void;
}) {
  const [keyDraft, setKeyDraft] = useState(pkey);
  const setProfile = (p: Partial<Profile>) =>
    update({ ...config, profiles: { ...config.profiles, [pkey]: { ...profile, ...p } } });
  const patchCmd = (id: string, p: Partial<Command>) =>
    setProfile({ commands: profile.commands.map((c) => (c.id === id ? { ...c, ...p } : c)) });

  function renameKey() {
    const next = keyDraft.trim().toLowerCase();
    if (!next || next === pkey || config.profiles[next]) {
      setKeyDraft(pkey);
      return;
    }
    const entries = Object.entries(config.profiles).map(([k, v]) => (k === pkey ? [next, v] : [k, v]));
    update({ ...config, profiles: Object.fromEntries(entries) });
  }

  return (
    <div className="ctl flex flex-col gap-3 p-3.5">
      <div className="flex items-end gap-2">
        <Field label="Nome profilo" className="flex-1">
          <input className="field" value={profile.label} onChange={(e) => setProfile({ label: e.target.value })} />
        </Field>
        <Field label="Processo" className="flex-1">
          <input className="field num text-[13px]" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} onBlur={renameKey} placeholder="blender.exe" />
        </Field>
        <Remove
          label={`Elimina profilo ${profile.label}`}
          onClick={() => {
            const { [pkey]: _gone, ...rest } = config.profiles;
            update({ ...config, profiles: rest });
          }}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        {profile.commands.map((cmd) => (
          <div key={cmd.id} className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto] items-center gap-2 rounded-ctl bg-bg/60 p-2">
            <input className="field" value={cmd.label} aria-label="Nome comando" onChange={(e) => patchCmd(cmd.id, { label: e.target.value })} />
            <input
              className="field num text-[13px]"
              value={cmd.keys}
              aria-label="Tasti"
              placeholder="ctrl+s  oppure  comando"
              onChange={(e) => patchCmd(cmd.id, { keys: e.target.value })}
            />
            <IconPicker value={cmd.icon} onChange={(icon) => patchCmd(cmd.id, { icon })} />
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => patchCmd(cmd.id, { press_enter: !cmd.press_enter })}
                className={`h-11 rounded-full px-3 text-[12px] font-medium ${cmd.press_enter ? "bg-accent/15 text-accent" : "text-faint"}`}
              >
                Invio
              </button>
              <Remove label={`Elimina ${cmd.label}`} onClick={() => setProfile({ commands: profile.commands.filter((c) => c.id !== cmd.id) })} />
            </div>
          </div>
        ))}
      </div>
      <AddRow
        onClick={() =>
          setProfile({
            commands: [
              ...profile.commands,
              { id: uniqueId("cmd", profile.commands.map((c) => c.id)), label: "Nuovo comando", keys: "", icon: "sparkles" },
            ],
          })
        }
      >
        Aggiungi comando
      </AddRow>
    </div>
  );
}

function Toggle({ title, hint, on, onChange }: { title: string; hint: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex items-center justify-between gap-3 text-left">
      <span>
        <span className="block text-[15px] font-medium">{title}</span>
        <span className="block text-[13px] text-muted">{hint}</span>
      </span>
      <span className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-white/10"}`}>
        <span className={`absolute top-1 h-6 w-6 rounded-full bg-ink transition-transform ${on ? "translate-x-7" : "translate-x-1"}`} />
      </span>
    </button>
  );
}

function Devices() {
  const { act } = useDeck();
  const [list, setList] = useState<Device[] | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const load = () => {
    api.devices().then(setList).catch(() => setList([]));
    api.whoami().then((d) => setMe(d.id)).catch(() => {});
  };
  useEffect(load, []);
  const fmt = (t?: number) => (t ? new Date(t * 1000).toLocaleDateString("it-IT", { day: "numeric", month: "short" }) : "");
  return (
    <Field label="Dispositivi abbinati">
      <div className="flex flex-col gap-2">
        {(list ?? []).map((d) => (
          <div key={d.id} className="flex items-center justify-between gap-3 rounded-ctl bg-black/20 px-3 py-2.5">
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-medium">
                {d.name}
                {d.id === me && <span className="ml-2 text-[12px] text-accent">questo</span>}
              </span>
              <span className="block text-[12px] text-muted">
                abbinato {fmt(d.paired_at)} · visto {fmt(d.last_seen)}
              </span>
            </span>
            <Press
              className="shrink-0 rounded-ctl px-3 py-2 text-[13px] font-medium text-muted"
              style={{ boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.1)" }}
              onClick={() =>
                act(async () => {
                  await api.revokeDevice(d.id);
                  if (d.id === me) {
                    setToken("");
                    location.reload();
                  } else load();
                })
              }
            >
              {d.id === me ? "Disabbina" : "Rimuovi"}
            </Press>
          </div>
        ))}
        {list && list.length === 0 && <span className="text-[13px] text-muted">Nessun dispositivo in elenco.</span>}
      </div>
    </Field>
  );
}

function TabletPrefs() {
  const prefs = usePrefs();
  return (
    <div className="ctl flex flex-col gap-4 p-3.5">
      <Toggle title="Schermo intero al primo tocco" hint="Nasconde la barra del browser. Su iPad meglio Condividi > Aggiungi a Home" on={prefs.autoFullscreen} onChange={(v) => setPrefs({ autoFullscreen: v })} />
      <Toggle title="Effetti grafici completi" hint="Sfocature e luci in movimento. Spegnili se il tablet rallenta" on={prefs.richEffects} onChange={(v) => setPrefs({ richEffects: v })} />
      <Toggle title="Schermo del PC in diretta" hint="Anteprima dei monitor nel Deck e in vetrina" on={prefs.screenPreview} onChange={(v) => setPrefs({ screenPreview: v })} />
      <div className="flex items-center justify-between gap-3">
        <span>
          <span className="block text-[15px] font-medium">Vetrina dopo</span>
          <span className="block text-[13px] text-muted">Orologio grande e schermo live quando nessuno tocca</span>
        </span>
        <div className="flex shrink-0 gap-1 rounded-full bg-black/30 p-1">
          {[0, 1, 3, 10].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setPrefs({ idleMinutes: m })}
              className={`rounded-full px-3 py-1.5 text-[13px] font-medium ${prefs.idleMinutes === m ? "bg-white/15 text-ink" : "text-muted"}`}
            >
              {m === 0 ? "Mai" : `${m} min`}
            </button>
          ))}
        </div>
      </div>
      <Devices />
    </div>
  );
}

export default function SettingsView() {
  const { configError, reloadConfig } = useDeck();
  const { draft, update, saved } = useDraft();

  return (
    <section className="panel flex h-full min-h-0 flex-col p-3">
      <header className="flex items-baseline justify-between px-1.5 pb-3 pt-2">
        <h2 className="text-[19px] font-semibold tracking-tight">Impostazioni</h2>
        <span className={`text-[13px] ${saved ? "text-faint" : "text-muted"}`}>{saved ? "Salvato" : "Salvataggio"}</span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!draft ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-[15px] text-muted">
            {configError ? (
              <>
                Configurazione non caricata: {configError}
                <Press className="ctl px-4 py-2.5 text-[14px] font-medium text-ink" onClick={reloadConfig}>
                  Riprova
                </Press>
              </>
            ) : (
              "Caricamento"
            )}
          </div>
        ) : (
          <div className="grid gap-6 pb-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <h3 className="px-1.5 text-[15px] font-semibold text-muted">App nel deck</h3>
                <AppsEditor config={draft} update={update} />
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="px-1.5 text-[15px] font-semibold text-muted">Questo tablet</h3>
                <TabletPrefs />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="px-1.5 text-[15px] font-semibold text-muted">Comandi per app</h3>
              <p className="px-1.5 text-[13px] leading-relaxed text-faint">
                Compaiono nel Deck quando quell'app è in primo piano. Tasti: una combinazione come ctrl+shift+s,
                oppure una parola da digitare. Il punto e virgola separa più passaggi confermati con Invio.
              </p>
              {Object.entries(draft.profiles).map(([k, p]) => (
                <ProfileEditor key={k} pkey={k} profile={p} config={draft} update={update} />
              ))}
              <AddRow
                onClick={() => {
                  const key = uniqueId("app.exe", Object.keys(draft.profiles));
                  update({ ...draft, profiles: { ...draft.profiles, [key]: { label: "Nuovo profilo", commands: [] } } });
                }}
              >
                Aggiungi profilo
              </AddRow>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
