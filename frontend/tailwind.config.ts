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
      colors: {
        ink: "#161616",
        sand: "#f4f0e8",
        ember: "#b54830",
        pine: "#245f50",
        gold: "#c58f3d"
      },
      boxShadow: {
        panel: "0 20px 45px rgba(22, 22, 22, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
