import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  // Read VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from the .env file at the repo root.
  envDir: '..',
  resolve: {
    alias: {
      // The shared backend client lives in ../src.
      '@margins': fileURLToPath(new URL('../src', import.meta.url)),
      // Use one copy of supabase-js for both the app and the shared client.
      '@supabase/supabase-js': fileURLToPath(new URL('./node_modules/@supabase/supabase-js', import.meta.url)),
    },
  },
  server: { port: 3000, strictPort: true, fs: { allow: ['..'] } },
  preview: { port: 3000 },
});
