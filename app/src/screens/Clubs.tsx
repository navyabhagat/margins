import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { margins } from '../lib/margins';
import { useAction, useLoad } from '../lib/hooks';
import { meetingDay } from '../lib/format';
import { Chevron, Loading, Logo, Notice, SketchHero } from '../components/bits';

/** Signed in: your clubs, join with a code, or start a new club. */
export function Clubs() {
  const navigate = useNavigate();
  const { data: clubs, error: loadError, loading } = useLoad(() => margins.myClubs(), []);
  const [code, setCode] = useState('');
  const [newName, setNewName] = useState('');
  const join = useAction();
  const create = useAction();

  async function onJoin(e: FormEvent) {
    e.preventDefault();
    const club = await join.run(() => margins.joinClub(code));
    if (club) navigate(`/club/${club.id}`);
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const club = await create.run(() => margins.createClub(newName.trim()));
    if (club) navigate(`/club/${club.id}/club`);
  }

  if (loading && !clubs) return <Loading />;

  return (
    <>
      <SketchHero height={230} />
      <div className="page no-tabs">
        <div className="spread">
          <Logo width={150} />
          <button className="btn quiet" type="button" onClick={() => margins.signOut()}>Sign out</button>
        </div>

        <Notice error>{loadError}</Notice>

        {clubs && clubs.length > 0 && (
          <section className="stack" aria-labelledby="your-clubs">
            <h2 id="your-clubs">your <em>clubs</em></h2>
            <div className="list">
              {clubs.map((c) => (
                <Link key={c.id} to={`/club/${c.id}`} className="list-link">
                  <span className="stack" style={{ gap: 3, flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 18, fontWeight: 700, textTransform: 'lowercase' }}>{c.name}</span>
                    <span className="meta">
                      {c.current_book_title ? `Reading ${c.current_book_title}` : 'No book this month yet'}
                      {(c.next_meeting_at ?? c.current_meeting_at) ? ` · meets ${meetingDay((c.next_meeting_at ?? c.current_meeting_at)!).month} ${meetingDay((c.next_meeting_at ?? c.current_meeting_at)!).day}` : ''}
                      {` · ${c.member_count} ${c.member_count === 1 ? 'member' : 'members'}`}
                    </span>
                  </span>
                  <Chevron />
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="stack" aria-labelledby="join-heading">
          <h2 id="join-heading">join a <em>club</em></h2>
          <form className="inline-form" onSubmit={onJoin}>
            <label className="field">
              <span>Invite code</span>
              <input id="join-code" className="input" required placeholder="e.g. K7QM3XPA" autoCapitalize="characters"
                     value={code} onChange={(e) => setCode(e.target.value)} />
            </label>
            <button className="btn" type="submit" disabled={join.busy}>{join.busy ? 'Joining…' : 'Join club'}</button>
          </form>
          <Notice error>{join.error}</Notice>
        </section>

        <details>
          <summary>Start a new book club</summary>
          <form className="inline-form" onSubmit={onCreate} style={{ marginTop: 14 }}>
            <label className="field">
              <span>Club name</span>
              <input id="new-club-name" className="input" required maxLength={80} placeholder="Second Chapter Book Club"
                     value={newName} onChange={(e) => setNewName(e.target.value)} />
            </label>
            <button className="btn" type="submit" disabled={create.busy}>{create.busy ? 'Starting…' : 'Start club'}</button>
          </form>
          <Notice error>{create.error}</Notice>
        </details>

        <SignInPassword />
      </div>
    </>
  );
}

/** Lets a reader set a password so they can sign in without an emailed link. */
function SignInPassword() {
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const save = useAction();

  async function onSave(e: FormEvent) {
    e.preventDefault();
    const ok = await save.run(async () => { await margins.setPassword(password); return true; });
    if (ok) { setPassword(''); setDone(true); }
  }

  return (
    <details>
      <summary>Sign-in password</summary>
      <p className="meta" style={{ marginTop: 10 }}>
        Set a password to sign in without waiting for an email, on any device.
      </p>
      <form className="inline-form" onSubmit={onSave} style={{ marginTop: 10 }}>
        <label className="field">
          <span>New password</span>
          <input id="new-password" className="input" type="password" required minLength={8} autoComplete="new-password"
                 placeholder="at least 8 characters" value={password}
                 onChange={(e) => { setPassword(e.target.value); setDone(false); }} />
        </label>
        <button className="btn" type="submit" disabled={save.busy}>{save.busy ? 'Saving…' : 'Save password'}</button>
      </form>
      {done && <p className="hand" style={{ marginTop: 8 }}>Saved. Next time, choose “sign in with your password.”</p>}
      <Notice error>{save.error}</Notice>
    </details>
  );
}
