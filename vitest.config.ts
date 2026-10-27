import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  resolve: { alias: { '@': path.resolve('.') } },
  test: { environment: 'node', setupFiles: ['./tests/setup.ts'], include: ['tests/**/*.test.ts'] },
});
