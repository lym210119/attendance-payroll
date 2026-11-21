import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Deploy the isolated WorkTime preview at the Vercel project root.
  base: '/',
});
