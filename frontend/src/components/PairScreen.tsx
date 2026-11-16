import { BackspaceIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { pairDevice } from "../api";
import { Press } from "./Press";

function guessName(): string {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch points give it away.
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "iPad";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? "Telefono Android" : "Tablet Android";
  return "Browser";
}

const LEN = 6;

/** First-run screen: the PC shows a 6-digit code, the tablet types it on a keypad. */
export function PairScreen() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pairUrl = `http://localhost${location.port ? `:${location.port}` : ""}/pair`;

  async function submit(full: string) {
    setBusy(true);
    setError(null);
    try {
      await pairDevice(full, guessName());
      location.reload();
    } catch (e) {
      setError((e as Error).message);
      setCode("");
      setBusy(false);
    }
  }

  function press(d: string) {
    if (busy) return;
    setError(null);
    const next = (code + d).slice(0, LEN);
    setCode(next);
    if (next.length === LEN) void submit(next);
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

  return (
    <div
      className="flex h-[100dvh] w-full items-center justify-center gap-10 overflow-auto bg-bg p-6 portrait:flex-col max-md:gap-6"
      style={{ paddingTop: "max(1.5rem, env(safe-area-inset-top))" }}
    >
      <section className="max-w-[420px]">
        <div className="label">Primo avvio</div>
        <h1 className="display mt-2 text-[44px] leading-[0.95]">Abbina questo dispositivo</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-muted">
          Sul PC apri <span className="num text-ink">{pairUrl}</span> e scrivi qui il codice a sei cifre che vedi. Basta farlo una volta sola.
        </p>
        <div className="mt-6 flex gap-2" aria-live="polite">
          {Array.from({ length: LEN }, (_, i) => (
            <div
              key={i}
              className={`num flex h-16 w-12 items-center justify-center rounded-ctl text-[30px] font-semibold ${
                i < code.length ? "bg-raised text-ink" : "bg-surface text-muted"
              }`}
            >
              {code[i] ?? ""}
            </div>
          ))}
        </div>
        <div className="mt-3 h-6 text-[14px]">
          {busy ? <span className="text-muted">Verifico…</span> : error ? <span className="text-[rgb(255_150_140)]">{error}</span> : null}
        </div>
      </section>
      <div className="grid w-[300px] grid-cols-3 gap-3">
        {keys.map((k, i) =>
          k === "" ? (
            <span key={i} />
          ) : (
            <Press
              key={i}
              onClick={() => (k === "del" ? setCode((c) => c.slice(0, -1)) : press(k))}
              className="key flex h-[76px] items-center justify-center"
              aria-label={k === "del" ? "Cancella" : k}
            >
              {k === "del" ? <BackspaceIcon size={28} weight="bold" /> : <span className="display text-[34px]">{k}</span>}
            </Press>
          ),
        )}
      </div>
    </div>
  );
}
