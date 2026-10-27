import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { RsvpStatus } from '@margins';
import { margins } from '../lib/margins';
import { useAction, useLoad } from '../lib/hooks';
import { initials, meetingDay, monthName } from '../lib/format';
import { useClub } from '../components/ClubLayout';
import { Chevron, FilmPhoto, Loading, Notice } from '../components/bits';

const AVATAR_COLORS = ['#1c1b19', '#a8566d', '#8a4a2e', '#2f4a5a', '#4f6b3a'];

export function ThisMonth() {
  const { club, isAdmin, reloadClub } = useClub();
  const { data, error, loading, reload } = useLoad(async () => {
    const [book, members] = await Promise.all([margins.currentBook(club.id), margins.members(club.id)]);
    const photos = book ? await margins.photos(book.id) : [];
    const cover = photos.find((p) => p.is_cover) ?? photos[0] ?? null;
    return { book, members, cover };
  }, [club.id]);

  if (loading && !data) return <Loading />;
  if (error) return <div className="page"><Notice error>{error}</Notice></div>;
  const { book, members, cover } = data!;

  if (!book) {
    return (
      <div className="page">
        <span className="tape plain">this month</span>
        <h1>{club.name.toLowerCase()}</h1>
        <div className="empty-state">
          <p className="hand">No book this month yet.</p>
          {isAdmin
            ? <Link className="btn" to={`/club/${club.id}/club`}>Add a book</Link>
            : <p className="meta">Your club’s owner or admins will pick one soon.</p>}
        </div>
      </div>
    );
  }

  const style = { '--mood': book.mood_color ?? '#8a4a2e' } as CSSProperties;
  const shown = members.slice(0, 3);

  return (
    <div className="page moody mood-em" style={style}>
      <div className="spread">
        <span className="tape">this month · {monthName(book.month).toLowerCase()}</span>
        <div className="avatars" role="img" aria-label={`${members.length} members`}>
          {shown.map((m, i) => (
            <span key={m.user_id} className="avatar" style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}>
              {initials(m.profile?.display_name)}
            </span>
          ))}
          {members.length > shown.length && (
            <span className="avatar" style={{ background: 'var(--tape)', color: 'var(--ink)', fontSize: 11 }}>
              +{members.length - shown.length}
            </span>
          )}
        </div>
      </div>

      {cover && (
        <FilmPhoto src={cover.url} alt={cover.caption ?? `A photo for ${book.title}`} subtitle={cover.caption}
                   height={210} taped />
      )}

      <div className="stack" style={{ gap: 4 }}>
        <p className="eyebrow mood">now reading</p>
        <h1><em>{book.title.toLowerCase()}</em></h1>
        <p className="meta">{[book.author, book.published_year, book.page_count && `${book.page_count} pages`].filter(Boolean).join(' · ')}</p>
      </div>

      {book.note && <p className="hand">{book.note}</p>}

      <Bookmark bookId={book.id} pageCount={book.page_count} readThrough={book.read_through_page}
                readThroughNote={book.read_through_note} myPage={club.current_page}
                isAdmin={isAdmin} onSaved={async () => { await Promise.all([reload(), reloadClub()]); }} />

      <Meeting bookId={book.id} meetingAt={book.meeting_at} place={book.meeting_place}
               myRsvp={book.my_rsvp} going={book.going_count} onChange={reload} />

      <Link to={`/club/${club.id}/table`} className="list-link" style={{ textDecoration: 'none' }}>
        <span className="stack" style={{ gap: 2, flex: 1 }}>
          <h3>on the <em>table</em></h3>
          <span className="meta">
            {book.open_topic_count === 0 ? 'Nothing yet. Add the first thing to talk about.'
              : `${book.open_topic_count} ${book.open_topic_count === 1 ? 'thing' : 'things'} to talk about`}
          </span>
        </span>
        <Chevron />
      </Link>
    </div>
  );
}

function Bookmark({ bookId, pageCount, readThrough, readThroughNote, myPage, isAdmin, onSaved }: {
  bookId: string; pageCount: number | null; readThrough: number | null; readThroughNote: string | null;
  myPage: number | null; isAdmin: boolean; onSaved: () => Promise<void>;
}) {
  const { club } = useClub();
  const [page, setPage] = useState(myPage?.toString() ?? '');
  const [editing, setEditing] = useState(false);
  const [goal, setGoal] = useState(readThrough?.toString() ?? '');
  const [goalNote, setGoalNote] = useState(readThroughNote ?? '');
  const save = useAction();

  useEffect(() => { setPage(myPage?.toString() ?? ''); }, [myPage]);

  const pct = (n: number | null) => (n != null && pageCount ? Math.min(100, (n / pageCount) * 100) : 0);

  async function saveMine(e: FormEvent) {
    e.preventDefault();
    const n = page === '' ? null : Number(page);
    const ok = await save.run(async () => { await margins.setMyPage(club.id, n); return true; });
    if (ok) await onSaved();
  }

  async function saveGoal(e: FormEvent) {
    e.preventDefault();
    const ok = await save.run(async () => {
      await margins.setReadThrough(bookId, goal === '' ? null : Number(goal), goalNote.trim() || null);
      return true;
    });
    if (ok) { setEditing(false); await onSaved(); }
  }

  return (
    <section className="stack" aria-labelledby="bookmark-h">
      <div className="spread">
        <p className="eyebrow" id="bookmark-h">where we left off</p>
        <span className="meta tabular">
          {readThrough != null ? `read through p. ${readThrough}${pageCount ? ` of ${pageCount}` : ''}` : 'no group bookmark yet'}
        </span>
      </div>
      {pageCount && (
        <div className="progress" aria-hidden="true">
          <div className="fill" style={{ width: `${pct(readThrough)}%` }} />
          {myPage != null && <span className="mark" style={{ left: `${pct(myPage)}%` }} title="you" />}
        </div>
      )}
      {readThroughNote && <p className="hand">{readThroughNote}</p>}

      <form className="inline-form" onSubmit={saveMine}>
        <label className="field">
          <span>I’m on page</span>
          <input id="my-page" className="input tabular" type="number" min={0} max={pageCount ?? undefined}
                 inputMode="numeric" placeholder="—" value={page} onChange={(e) => setPage(e.target.value)} />
        </label>
        <button className="btn ghost small" type="submit" disabled={save.busy}>Save my page</button>
      </form>

      {isAdmin && !editing && (
        <button className="link" type="button" style={{ alignSelf: 'flex-start' }} onClick={() => setEditing(true)}>
          Change the group bookmark
        </button>
      )}
      {isAdmin && editing && (
        <form className="form" onSubmit={saveGoal}>
          <div className="form-grid">
            <label className="field">
              <span>Read through page</span>
              <input id="goal-page" className="input tabular" type="number" min={0} max={pageCount ?? undefined}
                     value={goal} onChange={(e) => setGoal(e.target.value)} />
            </label>
            <label className="field wide">
              <span>Where that is (no spoilers)</span>
              <input id="goal-note" className="input" maxLength={300} value={goalNote}
                     placeholder="e.g. up to the end of chapter 12" onChange={(e) => setGoalNote(e.target.value)} />
            </label>
          </div>
          <div className="row">
            <button className="btn small" type="submit" disabled={save.busy}>Save bookmark</button>
            <button className="btn quiet" type="button" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      )}
      <Notice error>{save.error}</Notice>
    </section>
  );
}

function Meeting({ bookId, meetingAt, place, myRsvp, going, onChange }: {
  bookId: string; meetingAt: string | null; place: string | null; myRsvp: RsvpStatus | null;
  going: number; onChange: () => Promise<void>;
}) {
  const { club } = useClub();
  const act = useAction();
  const when = meetingAt ? meetingDay(meetingAt) : null;

  async function answer(status: RsvpStatus) {
    const ok = await act.run(async () => { await margins.rsvp(club.id, bookId, status); return true; });
    if (ok) await onChange();
  }

  const options: [RsvpStatus, string][] = [['going', 'I’m coming'], ['maybe', 'Maybe'], ['not_going', 'Can’t make it']];

  return (
    <section className="stack" style={{ borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)', padding: '14px 0' }}
             aria-label="Next meeting">
      <div className="row">
        <div style={{ width: 48, textAlign: 'center', fontFamily: 'var(--sans)', lineHeight: 1 }}>
          <div className="eyebrow mood">{when?.month ?? 'tbd'}</div>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 26, fontWeight: 700, marginTop: 3 }}>{when?.day ?? '—'}</div>
        </div>
        <div style={{ flex: 1, minWidth: 0, fontFamily: 'var(--sans)' }}>
          <div style={{ fontWeight: 700 }}>{when ? `${when.weekday} · ${when.time}` : 'Meeting date to be decided'}</div>
          <div className="meta">{place || 'Place to be decided'} · {going} coming</div>
        </div>
      </div>
      <div className="segmented" role="group" aria-label="Are you coming?">
        {options.map(([value, label]) => (
          <button key={value} type="button" aria-pressed={myRsvp === value} disabled={act.busy} onClick={() => answer(value)}>
            {label}
          </button>
        ))}
      </div>
      <Notice error>{act.error}</Notice>
    </section>
  );
}
