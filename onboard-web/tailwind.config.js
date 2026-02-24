import animate from 'tailwindcss-animate'

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'SF Pro Display', 'SF Pro Text', 'system-ui', 'sans-serif'],
      },
      maxWidth: {
        layout: '1120px',
      },
      boxShadow: {
        subtle: '0 0 0 1px rgba(0, 0, 0, 0.06), 0 12px 32px rgba(0, 0, 0, 0.06)',
      },
    },
  },
  plugins: [animate],
}
