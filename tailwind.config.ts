import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        custom: {
          black: '#000000',
          darkGrey: '#1a1a1a',
          cyan: '#00ceff',
        },
      },
    },
  },
  plugins: [],
};

export default config;
