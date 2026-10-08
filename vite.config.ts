import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Local-time assertions (midnight, DST) depend on a fixed zone.
    env: { TZ: 'Europe/Berlin' },
  },
});
