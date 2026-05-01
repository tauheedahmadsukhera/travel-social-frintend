/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#6366f1",
        bgDark: "#0f172a",
        cardDark: "rgba(30, 41, 59, 0.7)",
      }
    },
  },
  plugins: [],
}
