import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { margins } from '../lib/margins';
import { useAction, useLoad } from '../lib/hooks';
import { meetingDay } from '../lib/format';
import { Chevron, FilmPhoto, Loading, Logo, Notice } from '../components/bits';

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
      <FilmPhoto src="/opening.jpg" alt="A corner of a record and book shop with a bookshelf and a piano"
                 subtitle="one book a month, around a long table" height={230} />
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
                      {c.current_meeting_at ? ` · meets ${meetingDay(c.current_meeting_at).month} ${meetingDay(c.current_meeting_at).day}` : ''}
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
      </div>
    </>
  );
}
