import { readFileSync } from 'node:fs';
import type { ManifestType } from '@extension/shared';

const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));

const manifest = {
  manifest_version: 3,
  default_locale: 'sk',
  name: '__MSG_extensionName__',
  version: packageJson.version,
  description: '__MSG_extensionDescription__',
  host_permissions: [
    'https://*.nehnutelnosti.sk/*',
    'https://nominatim.openstreetmap.org/*',
    'https://tile.openstreetmap.org/*',
  ],
  permissions: ['storage'],
  background: {
    service_worker: 'background.js',
    type: 'module',
  },
  icons: {
    '16': 'icon-16.png',
    '32': 'icon-32.png',
    '48': 'icon-48.png',
    '128': 'icon-128.png',
  },
  content_scripts: [
    {
      matches: ['https://*.nehnutelnosti.sk/*'],
      js: ['content/nehnutelnosti.iife.js'],
      run_at: 'document_idle',
    },
    {
      matches: ['https://*.nehnutelnosti.sk/*'],
      js: ['content-ui/nehnutelnosti.iife.js'],
      run_at: 'document_idle',
    },
  ],
  web_accessible_resources: [
    {
      resources: ['*.js', '*.css', '*.svg', '*.png'],
      matches: ['https://*.nehnutelnosti.sk/*'],
    },
  ],
} satisfies ManifestType;

export default manifest;
