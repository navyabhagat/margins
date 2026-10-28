import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Values from .env.example, used when there's no .env (e.g. a fresh Codespace). */
function exampleEnv(): Record<string, string> {
  const file = `${root}/.env.example`;
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*(VITE_[A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

export default defineConfig(({ mode }) => {
  const env = { ...exampleEnv(), ...loadEnv(mode, root, 'VITE_') };
  return {
    plugins: [react()],
    // Read VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from .env at the repo root,
    // falling back to .env.example.
    envDir: '..',
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL ?? ''),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY ?? ''),
    },
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
  };
});
