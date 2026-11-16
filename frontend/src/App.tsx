import { WifiSlashIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { Ambient } from "./components/Ambient";
import { BottomBar } from "./components/BottomBar";
import { PairScreen } from "./components/PairScreen";
import { Showcase, useShowcase } from "./components/Showcase";
import { TopBar } from "./components/TopBar";
import { useActiveContext, useTintVariables } from "./lib/context";
import { useKiosk } from "./lib/kiosk";
import { usePrefs } from "./lib/prefs";
import { useDeck } from "./store";
import DeckView from "./views/DeckView";
import SettingsView from "./views/SettingsView";
import SystemView from "./views/SystemView";
import WindowsView from "./views/WindowsView";

function Toasts() {
  const { toasts } = useDeck();
  return (
    <div className="pointer-events-none fixed bottom-28 right-4 z-40 flex flex-col items-end gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ type: "spring", stiffness: 500, damping: 38 }}
            className={`max-w-sm rounded-ctl px-4 py-3 text-[14px] font-medium ${
              t.tone === "error" ? "bg-[rgb(70_26_24)] text-[rgb(255_190_184)]" : "bg-raised text-ink"
            }`}
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function OfflineVeil() {
  const { live } = useDeck();
  return (
    <AnimatePresence>
      {!live.connected && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { delay: 6 } }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-bg/90"
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <WifiSlashIcon size={40} className="text-muted" />
            <div className="text-[19px] font-semibold">PC non raggiungibile</div>
            <div className="max-w-xs text-[14px] text-muted">Riprovo da solo. Controlla che il PC sia acceso e sulla stessa rete.</div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function App() {
  const { paired } = useDeck();
  if (paired === false) return <PairScreen />;
  if (paired === null) return <div className="h-[100dvh] bg-bg" />;
  return <Deck />;
}

function Deck() {
  const location = useLocation();
  const { tint } = useActiveContext();
  const { richEffects } = usePrefs();
  const showcase = useShowcase();
  useKiosk();
  useTintVariables(tint);

  useEffect(() => {
    document.documentElement.dataset.fx = richEffects ? "rich" : "lite";
  }, [richEffects]);

  return (
    <>
      <Ambient intensity={richEffects ? 1 : 0.6} />
      {!showcase.covered && (
        <>
      <div
        className="flex h-[100dvh] w-full flex-col gap-3 overflow-hidden p-3"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <TopBar />
        <main className="relative min-h-0 flex-1">
          {/* One page at a time: the new page replaces the old instantly and eases in. */}
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0.35 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="absolute inset-0"
          >
            <Routes location={location}>
              <Route index element={<DeckView />} />
              <Route path="finestre" element={<WindowsView />} />
              <Route path="sistema" element={<SystemView />} />
              <Route path="impostazioni" element={<SettingsView />} />
            </Routes>
          </motion.div>
        </main>
        <BottomBar />
      </div>
        </>
      )}
      <Toasts />
      <Showcase idle={showcase.idle} onWake={showcase.wake} />
      <OfflineVeil />
    </>
  );
}
