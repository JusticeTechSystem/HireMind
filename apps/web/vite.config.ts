import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
const pkg = (n: string) => path.resolve(__dirname, `../../packages/${n}/src/index.ts`);
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@hiremind/validation': pkg('validation'), '@hiremind/shared-types': pkg('shared-types') } }, // no pre-build needed for dev/tests
  server: { proxy: { '/api': 'http://localhost:3000', '/socket.io': { target: 'http://localhost:3000', ws: true } } },
  test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'], include: ['src/**/*.test.{ts,tsx}'] },
});
