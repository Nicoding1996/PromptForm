/** @type {import('tailwindcss').Config} */
export default {
  // Tailwind v4 auto-detects usage; no `content` needed.
  theme: {
    extend: {
      fontFamily: {
        // Visual Foundation: Inter as default sans
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'Noto Sans',
          'Apple Color Emoji',
          'Segoe UI Emoji',
        ],
      },
      // Brand palette: refined indigo + slate usage in app
      colors: {
        brand: {
          50:  '#EEF2FF',
          100: '#E0E7FF',
          200: '#C7D2FE',
          300: '#A5B4FC',
          400: '#818CF8',
          500: '#6366F1',
          600: '#4F46E5', // primary
          700: '#4338CA',
          800: '#3730A3',
          900: '#312E81',
          DEFAULT: '#4F46E5',
        },
      },
      container: {
        center: true,
        screens: {
          '2xl': '1280px',
        },
      },
    },
  },
  plugins: [],
}