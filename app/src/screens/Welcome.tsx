import { useState, type FormEvent } from 'react';
import { margins } from '../lib/margins';
import { useAction } from '../lib/hooks';
import { FilmPhoto, Logo, Notice } from '../components/bits';

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
      await margins.signInWithEmail(address, name.trim() || undefined, window.location.origin);
      return true;
    });
    if (ok) setSentTo(address);
  }

  return (
    <>
      <FilmPhoto src="/opening.jpg" alt="A corner of a record and book shop with a bookshelf and a piano"
                 subtitle="one book a month, around a long table" height={290} />
      <div className="page no-tabs">
        <Logo width={180} />
        {sentTo ? (
          <div className="stack">
            <h1>check your <em>email</em></h1>
            <p className="hand">We sent a sign-in link to {sentTo}. Open it on this device and you’ll land back here, signed in.</p>
            <p className="meta">Nothing yet? Check spam, or wait a minute and try again.</p>
            <button className="link" type="button" onClick={() => setSentTo(null)}>Use a different email</button>
          </div>
        ) : (
          <>
            <div className="stack">
              <h1>find your <em>table</em></h1>
              <p className="hand">Sign in to see what your club is reading, what’s up for discussion, and every book you’ve finished together.</p>
            </div>
            <form className="form" onSubmit={submit}>
              <label className="field">
                <span>Email</span>
                <input id="signin-email" className="input" type="email" required autoComplete="email"
                       placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label className="field">
                <span>Your name (first time only)</span>
                <input id="signin-name" className="input" autoComplete="given-name" maxLength={60}
                       placeholder="What the club calls you" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <Notice error>{error}</Notice>
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Email me a sign-in link'}</button>
            </form>
          </>
        )}
      </div>
    </>
  );
}
