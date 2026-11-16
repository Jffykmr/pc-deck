/** Fixed asphalt ground behind every sign. Flat on purpose: nothing animates or blurs here. */
export function Ambient(_: { intensity?: number }) {
  return <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-bg" />;
}
