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
        // Landing: soft, maternal, premium
        'landing-cream': '#FAF8F5',
        'landing-coral': '#C9958A',
        'landing-coral-soft': '#E8C4BC',
        'landing-pink': '#F5E6EC',
        'landing-sage': '#9CAF88',
        'landing-sage-soft': '#B5C4A1',
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'fade-in': 'fadeIn 0.8s ease-out forwards',
        'signal-pulse': 'signalPulse 2.5s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        signalPulse: {
          '0%, 100%': { opacity: '0.4', transform: 'scale(1)' },
          '50%': { opacity: '0.8', transform: 'scale(1.05)' },
        },
      },
    },
  },
  plugins: [],
};
