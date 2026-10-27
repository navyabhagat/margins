import { createMargins } from '@margins';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configError =
  !url || !key || url.includes('YOUR_PROJECT_REF')
    ? 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to the .env file at the top of the project, then restart the app.'
    : null;

export const margins = createMargins(url ?? 'http://localhost', key ?? 'missing');
export const supabase = margins.supabase;
