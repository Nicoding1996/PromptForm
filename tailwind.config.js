/** @type {import('tailwindcss').Config} */
import colors from 'tailwindcss/colors'

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
      // Design System palette mappings
      colors: {
        primary: colors.indigo,
        neutral: colors.slate,
        success: colors.green,
        danger: colors.red,
        warning: colors.amber,
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