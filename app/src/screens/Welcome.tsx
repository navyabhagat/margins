import { useState, type FormEvent } from 'react';
import { margins } from '../lib/margins';
import { useAction } from '../lib/hooks';
import { Logo, Notice, SketchHero } from '../components/bits';

/** Signed-out front door: sign in with a link sent by email. */
export function Welcome() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const address = email.trim();
    const ok = await run(async () => {
      await margins.signInWithEmail(address, name.trim() || undefined, window.location.origin + import.meta.env.BASE_URL);
      return true;
    });
    if (ok) setSentTo(address);
  }

  return (
    <>
      <SketchHero height={560} background />
      <div className="page no-tabs">
        <Logo width={180} />
        {sentTo ? (
          <div className="stack">
            <h1 className="marker-title">check your email</h1>
            <p className="hand">We sent a sign-in link to {sentTo}. Open it on this device and you’ll land back here, signed in.</p>
            <p className="meta">Nothing yet? Check spam, or wait a minute and try again.</p>
            <button className="link" type="button" onClick={() => setSentTo(null)}>Use a different email</button>
          </div>
        ) : (
          <>
            <h1 className="marker-title">find your table</h1>
            <form className="fill-in" onSubmit={submit}>
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
            </form>
          </>
        )}
      </div>
    </>
  );
}
