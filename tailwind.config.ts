import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        hextech: {
          dark: "#050811",
          card: "#091428",
          cardHover: "#0e1e38",
          border: "#1e3a5f",
          gold: "#c8aa6e",
          goldHover: "#e4c688",
          goldMuted: "#785a28",
          blue: "#0ac8b9",
          blueDark: "#005a82",
          accent: "#0397ab",
          victory: "#10b981",
          defeat: "#ef4444",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "'Segoe UI'",
          "Roboto",
          "'Helvetica Neue'",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "'JetBrains Mono'",
          "'Fira Code'",
          "Consolas",
          "monospace",
        ],
      },
      boxShadow: {
        glow: "0 0 20px rgba(10, 200, 185, 0.25)",
        goldGlow: "0 0 20px rgba(200, 170, 110, 0.3)",
      },
    },
  },
  plugins: [],
} satisfies Config;
