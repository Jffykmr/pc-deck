/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        lip: "rgb(var(--lip) / <alpha-value>)",
        raised: "rgb(var(--raised) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        faint: "rgb(var(--faint) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        tint: "rgb(var(--tint) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
        line: "rgb(var(--line) / 0.08)",
      },
      fontFamily: {
        sans: ["'Archivo Variable'", "system-ui", "sans-serif"],
        mono: ["'Geist Mono Variable'", "ui-monospace", "monospace"],
      },
      borderRadius: {
        // Housing sections 22px, keycaps 18px, small controls 12px.
        tile: "22px",
        ctl: "12px",
      },
    },
  },
  plugins: [],
};
