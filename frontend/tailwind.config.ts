import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-body)", "Inter", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Manrope", "system-ui", "sans-serif"]
      },
      colors: {
        ink: "#18181B",
        surface: "#FFFFFF",
        "surface-muted": "#F4F4F5",
        border: "#E4E4E7",
        accent: "#2563EB",
        success: "#16A34A",
        warning: "#CA8A04",
        danger: "#DC2626"
      },
      boxShadow: {
        panel: "0 18px 40px rgba(24, 24, 27, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
