import { useState, type FormEvent } from 'react';
import { margins } from '../lib/margins';
import { useAction } from '../lib/hooks';
import { Logo, Notice, SketchHero } from '../components/bits';

type Mode = 'link' | 'password';

/** Signed-out front door: a link by email, or a password for returning readers. */
export function Welcome() {
  const [mode, setMode] = useState<Mode>(() => {
    try { return localStorage.getItem('margins-signin-mode') === 'password' ? 'password' : 'link'; } catch { return 'link'; }
  });
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { busy, error, run, setError } = useAction();

  function switchTo(next: Mode) {
    setMode(next);
    setError(null);
    try { localStorage.setItem('margins-signin-mode', next); } catch { /* private mode */ }
  }

  async function sendLink(e: FormEvent) {
    e.preventDefault();
    const address = email.trim();
    const ok = await run(async () => {
      await margins.signInWithEmail(address, name.trim() || undefined, window.location.origin + import.meta.env.BASE_URL);
      return true;
    });
    if (ok) setSentTo(address);
  }

  async function signIn(e: FormEvent) {
    e.preventDefault();
    // On success the auth listener swaps this screen for your clubs.
    await run(async () => { await margins.signInWithPassword(email, password); return true; });
  }

  return (
    <>
      <SketchHero height={520} background />
      <div className="page no-tabs">
        <h1 className="motto">
          <span className="motto-lead">meet me in the</span>
          <span className="motto-logo"><Logo width={224} /></span>
        </h1>
        {sentTo ? (
          <div className="stack">
            <h2 className="marker-title">check your email</h2>
            <p className="hand">We sent a sign-in link to {sentTo}. Open it on this device and you’ll land back here, signed in.</p>
            <p className="meta">Nothing yet? Check spam, or wait a minute and try again.</p>
            <button className="link" type="button" onClick={() => setSentTo(null)}>Use a different email</button>
          </div>
        ) : mode === 'link' ? (
          <form className="fill-in" onSubmit={sendLink}>
            <p className="fill-in-line">
              Hi, I’m{' '}
              <label className="sr-only" htmlFor="signin-name">Your name (first time only)</label>
              <input id="signin-name" className="blank" autoComplete="given-name" maxLength={60}
                     placeholder="your name" value={name} onChange={(e) => setName(e.target.value)}
                     size={Math.max(8, name.length + 1)} />.
            </p>
            <p className="fill-in-line">
              <label htmlFor="signin-email">Send my link to</label>
              <input id="signin-email" className="blank wide" type="email" required autoComplete="email"
                     inputMode="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </p>
            <Notice error>{error}</Notice>
            <button className="tape-btn" type="submit" disabled={busy}>{busy ? 'sending…' : 'send it →'}</button>
            <button className="link" type="button" onClick={() => switchTo('password')}>Been here before? Sign in with your password</button>
          </form>
        ) : (
          <form className="fill-in" onSubmit={signIn}>
            <p className="fill-in-line">
              <label htmlFor="signin-email">I’m back. I’m</label>
              <input id="signin-email" className="blank wide" type="email" required autoComplete="username"
                     inputMode="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </p>
            <p className="fill-in-line">
              <label htmlFor="signin-password">and my password is</label>
              <input id="signin-password" className="blank" type="password" required autoComplete="current-password"
                     placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} size={12} />
            </p>
            <Notice error>{error}</Notice>
            <button className="tape-btn" type="submit" disabled={busy}>{busy ? 'opening…' : 'come in →'}</button>
            <button className="link" type="button" onClick={() => switchTo('link')}>No password yet, or forgot it? Email me a link</button>
          </form>
        )}
      </div>
    </>
  );
}
