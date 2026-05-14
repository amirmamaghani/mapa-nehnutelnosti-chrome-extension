import globalConfig from '@extension/tailwindcss-config';
import type { Config } from 'tailwindcss';

export default {
  content: ['src/**/*.tsx'],
  presets: [globalConfig],
} satisfies Config;
