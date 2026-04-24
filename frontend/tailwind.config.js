/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: "#1A3A5C",
          gold: "#C9A84C",
          sidebar: "#0C1D30",
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        card: '0 0 0 1px rgba(13,20,33,0.05), 0 2px 6px rgba(13,20,33,0.06)',
        'card-hover': '0 0 0 1px rgba(13,20,33,0.07), 0 4px 14px rgba(13,20,33,0.09)',
        dropdown: '0 4px 16px rgba(13,20,33,0.12), 0 1px 4px rgba(13,20,33,0.06)',
      },
      borderRadius: {
        DEFAULT: '8px',
      },
    },
  },
  plugins: [],
}

