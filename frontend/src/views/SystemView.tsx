import { ArrowClockwiseIcon, LockSimpleIcon, MonitorIcon, MoonIcon, PowerIcon } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../api";
import { HoldButton } from "../components/HoldButton";
import { Bar, Counter, heatColor, Ring } from "../components/Instruments";
import { Press } from "../components/Press";
import { Sparkline } from "../components/Sparkline";
import { entrance } from "../lib/entrance";
import { openSpacedesk } from "../lib/spacedesk";
import { useDeck } from "../store";

const POWER_DELAY = 15;

const rise = (i: number) => entrance("system", i);

function formatUptime(sec: number) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return d > 0 ? `${d}g ${h}h` : `${h}h ${m}m`;
}

function Card({ title, subtitle, children, i, className = "" }: { title: string; subtitle?: string; children: ReactNode; i: number; className?: string }) {
  return (
    <motion.section {...rise(i)} className={`panel flex min-h-0 flex-col overflow-hidden p-4 ${className}`}>
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="label">{title}</h2>
        {subtitle && <span className="truncate text-[12px] text-faint">{subtitle}</span>}
      </header>
      {children}
    </motion.section>
  );
}

function Readout({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">{label}</span>
      <span className="text-[26px] display leading-none">{children}</span>
    </div>
  );
}

function Cpu() {
  const { live, history } = useDeck();
  const s = live.system;
  const cores = s?.cores ?? [];
  return (
    <Card title="Processore" subtitle={s?.cpu_name} i={0}>
      <div className="flex min-h-0 flex-1 items-center gap-5">
        <Ring value={s?.cpu} size={132} stroke={10}>
          <span className="text-[34px] display leading-none">
            <Counter value={s?.cpu} />
            <span className="text-[15px] text-faint">%</span>
          </span>
          <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-faint">carico</span>
        </Ring>
        <div className="flex h-full min-h-[96px] flex-1 items-end gap-1.5">
          {cores.map((c, i) => (
            <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
              <div className="relative w-full flex-1 overflow-hidden rounded-[3px] bg-white/[0.05]">
                <div
                  className="live-meter absolute inset-0 origin-bottom rounded-[3px]"
                  style={{
                    transform: `scaleY(${Math.max(3, c) / 100})`,
                    background: "rgb(var(--accent))",
                    transition: "transform 500ms ease-out",
                  }}
                />
              </div>
              <span className="num text-[10px] text-faint">{i + 1}</span>
            </div>
          ))}
        </div>
      </div>
      <Sparkline data={history.cpu} max={100} className="-mx-4 -mb-4 mt-3 h-14 w-[calc(100%+2rem)]" />
    </Card>
  );
}

function Gpu() {
  const { live, history } = useDeck();
  const s = live.system;
  const g = s?.gpu_detail;
  if (!g) {
    return (
      <Card title="Scheda video" i={1}>
        <div className="flex flex-1 items-center justify-center text-[14px] text-muted">Dati GPU non disponibili</div>
      </Card>
    );
  }
  return (
    <Card title="Scheda video" subtitle={s?.gpu_name ?? undefined} i={1}>
      <div className="flex min-h-0 flex-1 items-center gap-5">
        <Ring value={g.temp} max={95} size={132} stroke={10} color={heatColor(g.temp)}>
          <span className="text-[34px] display leading-none" style={{ color: heatColor(g.temp) }}>
            <Counter value={g.temp} />
            <span className="text-[15px] text-faint">°C</span>
          </span>
          <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-faint">temperatura</span>
        </Ring>
        <div className="grid flex-1 grid-cols-2 gap-x-5 gap-y-4">
          <Readout label="Utilizzo">
            <Counter value={g.util} />
            <span className="text-[13px] text-faint">%</span>
          </Readout>
          <Readout label="Ventole">
            {g.fan === null ? "--" : <Counter value={g.fan} />}
            <span className="text-[13px] text-faint">%</span>
          </Readout>
          <div className="col-span-2 flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between text-[12px]">
              <span className="font-semibold uppercase tracking-[0.1em] text-faint">Potenza</span>
              <span className="num text-muted">
                {g.power.toFixed(0)} / {g.power_limit} W
              </span>
            </div>
            <Bar value={g.power} max={g.power_limit} />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between text-[12px]">
              <span className="font-semibold uppercase tracking-[0.1em] text-faint">VRAM</span>
              <span className="num text-muted">
                {g.vram_used.toFixed(1)} / {g.vram_total.toFixed(0)} GB
              </span>
            </div>
            <Bar value={g.vram_used} max={g.vram_total} />
          </div>
        </div>
      </div>
      <Sparkline data={history.power} max={g.power_limit} className="-mx-4 -mb-4 mt-3 h-14 w-[calc(100%+2rem)]" />
    </Card>
  );
}

function Memory() {
  const { live } = useDeck();
  const s = live.system;
  return (
    <Card title="Memoria e disco" i={2}>
      <div className="flex flex-1 flex-col justify-center gap-5">
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[30px] display leading-none">
              <Counter value={s?.ram_used} digits={1} />
              <span className="text-[14px] text-faint"> / {s?.ram_total ?? "--"} GB</span>
            </span>
            <span className="num text-[13px] text-muted">RAM</span>
          </div>
          <Bar value={s?.ram} height={8} />
        </div>
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[30px] display leading-none">
              <Counter value={s?.disk} />
              <span className="text-[14px] text-faint">% occupato</span>
            </span>
            <span className="num text-[13px] text-muted">C:</span>
          </div>
          <Bar value={s?.disk} height={8} color={s && s.disk > 90 ? "rgb(var(--danger))" : undefined} />
        </div>
      </div>
    </Card>
  );
}

function Traffic() {
  const { live, history } = useDeck();
  const s = live.system;
  return (
    <Card title="Attività" subtitle={s ? `${s.processes ?? "--"} processi, acceso da ${formatUptime(s.uptime_seconds)}` : undefined} i={3}>
      <div className="grid flex-1 grid-cols-2 gap-3">
        {[
          { label: "Disco", value: s?.disk_activity_mbps, unit: "MB/s", data: history.disk },
          { label: "Rete", value: s?.network_mbps, unit: "Mb/s", data: history.net },
        ].map((x) => (
          <div key={x.label} className="flex min-h-0 flex-col overflow-hidden rounded-ctl bg-white/[0.03]">
            <div className="flex items-baseline justify-between px-3 pt-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">{x.label}</span>
              <span className="text-[22px] display leading-none">
                <Counter value={x.value} digits={1} />
                <span className="text-[11px] text-faint"> {x.unit}</span>
              </span>
            </div>
            <Sparkline data={x.data} className="mt-2 min-h-12 w-full flex-1" />
          </div>
        ))}
      </div>
    </Card>
  );
}

function Power() {
  const { act } = useDeck();
  const [pending, setPending] = useState<{ kind: "shutdown" | "restart"; left: number } | null>(null);
  const tick = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearInterval(tick.current), []);

  async function schedule(kind: "shutdown" | "restart") {
    const ok = await act(() => (kind === "shutdown" ? api.shutdown(POWER_DELAY) : api.restart(POWER_DELAY)));
    if (!ok) return;
    setPending({ kind, left: POWER_DELAY });
    window.clearInterval(tick.current);
    tick.current = window.setInterval(() => {
      setPending((p) => {
        if (!p || p.left <= 1) {
          window.clearInterval(tick.current);
          return null;
        }
        return { ...p, left: p.left - 1 };
      });
    }, 1000);
  }

  async function cancel() {
    window.clearInterval(tick.current);
    setPending(null);
    await act(api.cancelPower);
  }

  if (pending) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-ctl bg-danger/10 p-6 text-center">
        <div className="text-[15px] text-danger">{pending.kind === "shutdown" ? "Spegnimento tra" : "Riavvio tra"}</div>
        <div className="num text-[72px] display leading-none">{pending.left}</div>
        <Press onClick={cancel} className="rounded-full bg-ink px-8 py-3.5 text-[16px] font-semibold text-bg">
          Annulla
        </Press>
      </div>
    );
  }

  const row = "ctl flex h-[60px] w-full items-center gap-3 px-4 text-left text-[16px] font-medium";
  return (
    <div className="grid gap-2">
      <Press className={row} onClick={() => act(api.lock)}>
        <LockSimpleIcon size={22} className="text-accent" /> Blocca il PC
      </Press>
      <Press className={row} onClick={() => act(api.sleepDisplay)}>
        <MoonIcon size={22} className="text-accent" /> Spegni i monitor
      </Press>
      <HoldButton className={row} onConfirm={() => schedule("restart")}>
        <span className="flex items-center gap-3">
          <ArrowClockwiseIcon size={22} className="text-muted" /> Riavvia
          <span className="text-[12px] font-normal text-faint">tieni premuto</span>
        </span>
      </HoldButton>
      <HoldButton className={row} onConfirm={() => schedule("shutdown")}>
        <span className="flex items-center gap-3 text-danger">
          <PowerIcon size={22} /> Spegni
          <span className="text-[12px] font-normal text-faint">tieni premuto</span>
        </span>
      </HoldButton>
    </div>
  );
}

function SecondScreen() {
  const { act, live } = useDeck();
  const [running, setRunning] = useState<boolean | null>(null);
  const [installed, setInstalled] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!live.connected) return;
    let alive = true;
    const check = () => api.displayStatus().then((r) => { if (!alive) return; setRunning(r.running); setInstalled(r.installed !== false); }).catch(() => {});
    check();
    const t = window.setInterval(check, 5000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [live.connected]);

  return (
    <div className="ctl flex items-center gap-3 p-3 pl-4">
      <MonitorIcon size={22} className="shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-medium">Secondo schermo</div>
        <div className={`text-[13px] ${running ? "text-accent" : "text-faint"}`}>
          {!installed ? "spacedesk non installato sul PC" : running === null ? "Controllo spacedesk" : running ? "spacedesk attivo" : "spacedesk spento"}
        </div>
      </div>
      {installed && running && (
        <Press className="rounded-full bg-ink px-4 py-2.5 text-[14px] font-semibold text-bg" onClick={openSpacedesk}>
          Collega tablet
        </Press>
      )}
      {installed && running === false && (
        <Press
          disabled={busy}
          className="rounded-full bg-ink px-4 py-2.5 text-[14px] font-semibold text-bg"
          onClick={async () => {
            setBusy(true);
            await act(api.displayStart);
            window.setTimeout(() => setBusy(false), 2000);
          }}
        >
          {busy ? "Avvio" : "Avvia"}
        </Press>
      )}
    </div>
  );
}

export default function SystemView() {
  return (
    <div className="grid h-full gap-2.5 max-lg:overflow-y-auto lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.78fr)] lg:grid-rows-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <Cpu />
      <Gpu />
      <motion.section {...rise(4)} className="panel flex min-h-0 flex-col gap-2 p-4 lg:row-span-2">
        <h2 className="label mb-1">Alimentazione</h2>
        <Power />
        <div className="mt-auto pt-2">
          <SecondScreen />
        </div>
      </motion.section>
      <Memory />
      <Traffic />
    </div>
  );
}
