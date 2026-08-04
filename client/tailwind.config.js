/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        body: ['Outfit', 'sans-serif'],
      },
      colors: {
        darkBg: '#0a0718',
        cardBg: 'rgba(18, 12, 38, 0.75)',
        accentViolet: '#8b5cf6',
        accentMagenta: '#ec4899',
        accentPink: '#f43f5e',
        accentCyan: '#38bdf8',
        accentRed: '#ff2b43',
      },
      animation: {
        'pulse-glow': 'pulseGlow 3s ease-in-out infinite',
        'shimmer': 'shimmer 1.8s infinite linear',
        'float-gentle': 'floatGentle 4s ease-in-out infinite',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { opacity: '0.7', filter: 'drop-shadow(0 0 15px rgba(236, 72, 153, 0.5))' },
          '50%': { opacity: '1', filter: 'drop-shadow(0 0 30px rgba(139, 92, 246, 0.8))' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' }
        },
        floatGentle: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' }
        }
      }
    },
  },
  plugins: [],
}
