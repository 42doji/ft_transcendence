/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        "pong-black": "#000000",
        "pong-white": "#FFFFFF",
      },
      fontFamily: {
        pixel: ["VT323", "monospace"],
      },
    },
  },
  plugins: [],
};
