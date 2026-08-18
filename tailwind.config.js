/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          50: "#eef2ff",
          100: "#e0e7ff",
          500: "#2f54eb",
          600: "#1d39c4",
          700: "#10239e",
        },
        up: "#12b76a",
        down: "#f04438",
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.08)",
        "card-dark": "0 1px 2px rgba(0,0,0,0.2), 0 8px 24px rgba(0,0,0,0.18)",
      },
    },
  },
  plugins: [],
};
