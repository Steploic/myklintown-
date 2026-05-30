import type { Config } from 'tailwindcss';
import preset from '@myklintown/config/tailwind';

const config: Config = {
  presets: [preset as Partial<Config>],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
};

export default config;
