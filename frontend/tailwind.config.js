/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'tier-3': '#DC2626',
        'tier-2': '#EA580C',
        'tier-1': '#CA8A04',
        'tier-0': '#16A34A',
        'bg': '#0F172A',
        'surface': '#1E293B',
        'text-primary': '#F1F5F9',
        'accent': '#3B82F6',
        // Pregnancy / maternal theme (warm rose-red)
        'pregnancy': '#B85050',
        'pregnancy-light': '#D4566A',
        'pregnancy-dark': '#9A4040',
        'pregnancy-text': '#2D0F0F',   // very dark red for text on white
      },
    },
  },
  plugins: [],
};
