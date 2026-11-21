import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The isolated GitHub Pages preview is hosted under the repository path.
  base: '/attendance-payroll/',
});
