/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Escala curta do sistema: 11,5 · 13 · 15 · 20 · 26 (o resto converge para estes).
      fontSize: {
        xs: ['11.5px', '1.45'],
        sm: ['13px', '1.5'],
        base: ['15px', '1.5'],
        lg: ['15px', '1.45'],
        xl: ['20px', '1.3'],
        '2xl': ['20px', '1.3'],
        '3xl': ['26px', '1.2'],
      },
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          900: '#1e3a8a',
        },
      },
    },
  },
  plugins: [],
}
