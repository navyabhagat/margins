import { useCallback, useEffect, useRef, useState } from 'react';
import { MarginsError } from '@margins';

export function messageOf(err: unknown): string {
  if (err instanceof MarginsError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong. Try again.';
}

/** Loads data for a screen, with loading and error states and a reload(). */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const result = await load();
      if (mine === seq.current) { setData(result); setError(null); }
    } catch (err) {
      if (mine === seq.current) setError(messageOf(err));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { setLoading(true); void reload(); }, [reload]);

  return { data, error, loading, reload, setData };
}

/** Runs an action from a button or form, tracking busy and error states. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(messageOf(err));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run, setError };
}
