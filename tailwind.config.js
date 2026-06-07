/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Score colors
        'score-high': '#22c55e',    // green-500
        'score-mid': '#eab308',     // yellow-500
        'score-low': '#ef4444',     // red-500
      },
    },
  },
  plugins: [],
}
