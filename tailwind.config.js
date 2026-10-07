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
          50: "#eef3ff",
          100: "#dbe6ff",
          500: "#1d4ed8",
          600: "#1e3a8a",
          700: "#071833",
        },
        navy: {
          800: "#0c2348",
          900: "#071833",
        },
        accent: "#fd6b01",
        up: "#0f9d58",
        down: "#d93025",
      },
      boxShadow: {
        card: "0 1px 2px rgba(7,24,51,0.04), 0 10px 28px rgba(7,24,51,0.05)",
        "card-dark": "0 1px 2px rgba(0,0,0,0.2), 0 12px 32px rgba(0,0,0,0.28)",
      },
    },
  },
  plugins: [],
};
