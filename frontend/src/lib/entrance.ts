/**
 * Staggered panel entrance, played once per app load. Replaying it on every
 * page change made panels blink out and back in while navigating.
 */
let played = new Set<string>();

export function entrance(page: string, i: number) {
  const first = !played.has(page);
  if (i === 0) queueMicrotask(() => played.add(page));
  return {
    initial: first ? { opacity: 0, y: 14 } : false,
    animate: { opacity: 1, y: 0 },
    transition: { type: "spring" as const, stiffness: 260, damping: 30, delay: 0.05 * i },
  };
}

export function resetEntrances() {
  played = new Set();
}
