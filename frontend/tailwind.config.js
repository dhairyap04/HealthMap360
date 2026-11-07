/** @type {import(tailwindcss).Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        medicalBlue: '#1E40AF',
        healthGreen: '#10B981',
        alertOrange: '#F59E0B',
        criticalRed: '#EF4444',
        neutralGray: { 50: '#F3F4F6', 900: '#374151' },
      },
      fontFamily: {
        heading: ['Inter', 'ui-sans-serif', 'system-ui'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular'],
      },
    },
  },
  plugins: [],
}
