import { useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { margins } from '../lib/margins';
import { useAction, useLoad } from '../lib/hooks';
import { meetingDay, monthName } from '../lib/format';
import { useClub } from '../components/ClubLayout';
import { BackArrow, FilmPhoto, Loading, Notice } from '../components/bits';

/** One book's record: rating, what we talked about, notes, lines, photos. */
export function BookPage() {
  const { bookId = '' } = useParams();
  const { club, me, isAdmin } = useClub();
  const { data, error, loading, reload } = useLoad(() => margins.bookRecord(bookId), [bookId]);

  if (loading && !data) return <Loading />;
  if (error) return <div className="page"><Notice error>{error}</Notice></div>;
  const { book, topics, quotes, photos, ratings } = data!;
  const cover = photos.find((p) => p.is_cover) ?? photos[0];
  const discussed = topics.filter((t) => t.status === 'discussed');
  const style = { '--mood': book.mood_color ?? '#8a4a2e' } as CSSProperties;
  const statusLabel = book.status === 'current' ? 'reading now' : book.status === 'upcoming' ? 'coming up' : 'finished';

  return (
    <div style={style}>
      <div style={{ position: 'relative' }}>
        <FilmPhoto src={cover?.url} alt={cover?.caption ?? `A photo for ${book.title}`} subtitle={cover?.caption} height={240} />
        <Link to={`/club/${club.id}/shelf`} aria-label="Back to our shelf"
              style={{ position: 'absolute', top: 26, left: 12, zIndex: 4, width: 44, height: 44, display: 'flex',
                       alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,.9)' }}>
          <BackArrow />
        </Link>
        <span className="tape" style={{ position: 'absolute', right: 14, top: 28, zIndex: 4, transform: 'rotate(-3deg)' }}>
          {monthName(book.month).toLowerCase()} · {statusLabel}
        </span>
      </div>

      <div className="page moody mood-em">
        <div className="stack" style={{ gap: 4 }}>
          <h1>{book.title.toLowerCase()}</h1>
          <p className="meta">
            {book.author}
            {book.meeting_at ? ` · ${book.status === 'finished' ? 'met' : 'meets'} ${meetingDay(book.meeting_at).weekday}, ${meetingDay(book.meeting_at).month} ${meetingDay(book.meeting_at).day}` : ''}
          </p>
        </div>

        <div className="stats">
          <div><b>{book.avg_rating ?? '—'}</b><span className="eyebrow">average rating</span></div>
          <div><b>{book.discussed_topic_count}</b><span className="eyebrow">talked about</span></div>
          <div><b>{book.quote_count}</b><span className="eyebrow">lines kept</span></div>
        </div>

        {book.status !== 'upcoming' && (
          <Ratings clubId={club.id} bookId={book.id} mine={book.my_rating} average={book.avg_rating}
                   ratings={ratings} me={me} memberCount={club.member_count} onChange={reload} />
        )}

        <section className="stack" aria-labelledby="talked-h">
          <h2 id="talked-h">what we <em>talked about</em></h2>
          {discussed.length === 0 ? (
            <p className="meta">Topics ticked off at the meeting show up here.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {discussed.map((t) => (
                <li key={t.id} className="row" style={{ alignItems: 'flex-start' }}>
                  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--mood)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 3 }}><path d="M5 12l5 5 9-10" /></svg>
                  <span>{t.body}{t.page != null && <span className="meta"> · p. {t.page}</span>}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Quotes clubId={club.id} bookId={book.id} quotes={quotes} me={me} isAdmin={isAdmin} onChange={reload} />
      </div>
    </div>
  );
}

const STAR = 'M12 2.8l2.8 6 6.5.6-4.9 4.3 1.5 6.4L12 16.8l-5.9 3.3 1.5-6.4-4.9-4.3 6.5-.6z';

/** Five stars filled to a value (half stars allowed). */
function Stars({ value, size = 16, label }: { value: number; size?: number; label?: string }) {
  return (
    <span className="row" style={{ gap: 1, color: 'var(--mood)' }} role="img" aria-label={label ?? `${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((s) => <StarIcon key={s} n={s} value={value} size={size} />)}
    </span>
  );
}

function StarIcon({ n, value, size }: { n: number; value: number; size: number }) {
  const fill = value >= n ? 1 : value >= n - 0.5 ? 0.5 : 0;
  const clip = `star-${n}-${fill}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs><clipPath id={clip}><rect x="0" y="0" width={24 * fill} height="24" /></clipPath></defs>
      <path d={STAR} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d={STAR} fill="currentColor" clipPath={`url(#${clip})`} />
    </svg>
  );
}

/** Everyone rates the book on their own; the club sees each rating and the average. */
function Ratings({ clubId, bookId, mine, average, ratings, me, memberCount, onChange }: {
  clubId: string; bookId: string; mine: number | null; average: number | null;
  ratings: { user_id: string; stars: number; display_name?: string | null }[];
  me: string; memberCount: number; onChange: () => Promise<void>;
}) {
  const act = useAction();
  const value = mine ?? 0;
  const others = ratings.filter((r) => r.user_id !== me);

  async function pick(star: number) {
    // Tapping the star you're already on knocks off half a star.
    const next = value === star ? star - 0.5 : star;
    if (next < 0.5) return;
    const ok = await act.run(async () => { await margins.rate(clubId, bookId, next); return true; });
    if (ok) await onChange();
  }
  async function clear() {
    const ok = await act.run(async () => { await margins.clearMyRating(bookId); return true; });
    if (ok) await onChange();
  }

  return (
    <section className="stack" aria-labelledby="ratings-h">
      <h2 id="ratings-h">everyone’s <em>ratings</em></h2>

      <div className="spread">
        <div className="stack" style={{ gap: 2 }}>
          <span className="eyebrow">average</span>
          <span className="meta">{ratings.length} of {memberCount} rated</span>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <b style={{ fontSize: 26 }} className="tabular">{average ?? '—'}</b>
          <Stars value={average ?? 0} size={20} label={average ? `Average ${average} out of 5` : 'No ratings yet'} />
        </div>
      </div>

      <div className="spread" style={{ borderTop: '1px solid var(--rule)', paddingTop: 12 }}>
        <div className="stack" style={{ gap: 2 }}>
          <span style={{ fontWeight: 700 }}>You</span>
          <span className="meta">
            {mine ? `${mine} ${mine === 1 ? 'star' : 'stars'}` : 'Tap to rate. Tap again for half.'}
            {mine && <> · <button className="link" type="button" onClick={clear} style={{ fontSize: 13 }}>clear</button></>}
          </span>
        </div>
        <div className="stars" role="group" aria-label="Your rating">
          {[1, 2, 3, 4, 5].map((s) => (
            <button key={s} type="button" aria-label={`Rate ${s} ${s === 1 ? 'star' : 'stars'}`} disabled={act.busy} onClick={() => pick(s)}>
              <StarIcon n={s} value={value} size={26} />
            </button>
          ))}
        </div>
      </div>

      {others.map((r) => (
        <div key={r.user_id} className="spread" style={{ borderTop: '1px solid var(--rule)', paddingTop: 10 }}>
          <span>{r.display_name ?? 'A member'}</span>
          <span className="row" style={{ gap: 8 }}>
            <span className="meta tabular">{r.stars}</span>
            <Stars value={r.stars} size={18} />
          </span>
        </div>
      ))}
      <Notice error>{act.error}</Notice>
    </section>
  );
}

type SectionProps = { clubId: string; bookId: string; me: string; isAdmin: boolean; onChange: () => Promise<void> };

function Quotes({ quotes, ...p }: SectionProps & { quotes: { id: string; body: string; page: number | null; speaker: string | null; added_by: string | null }[] }) {
  const [body, setBody] = useState('');
  const [page, setPage] = useState('');
  const [speaker, setSpeaker] = useState('');
  const act = useAction();

  async function add(e: FormEvent) {
    e.preventDefault();
    const ok = await act.run(() => margins.addQuote(p.clubId, p.bookId, body,
      { page: page === '' ? undefined : Number(page), speaker: speaker.trim() || undefined }));
    if (ok) { setBody(''); setPage(''); setSpeaker(''); await p.onChange(); }
  }
  async function remove(id: string) {
    const ok = await act.run(async () => { await margins.deleteQuote(id); return true; });
    if (ok) await p.onChange();
  }

  return (
    <section className="stack" aria-labelledby="quotes-h">
      <h2 id="quotes-h">lines we <em>kept</em></h2>
      {quotes.length === 0 && <p className="meta">Add the lines the club underlined.</p>}
      {quotes.map((q) => (
        <figure key={q.id} className="quote">
          <q>{q.body}</q>
          <small className="spread">
            <span>{[q.speaker, q.page != null && `p. ${q.page}`].filter(Boolean).join(' · ')}</span>
            {(q.added_by === p.me || p.isAdmin) && <button className="btn quiet" type="button" onClick={() => remove(q.id)}>Remove</button>}
          </small>
        </figure>
      ))}
      <details>
        <summary>Add a line</summary>
        <form className="form" onSubmit={add} style={{ marginTop: 12 }}>
          <label className="field">
            <span>The line</span>
            <textarea id="quote-body" className="input handwritten" required maxLength={600} value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
          <div className="form-grid">
            <label className="field"><span>Who says it</span>
              <input id="quote-speaker" className="input" maxLength={100} value={speaker} onChange={(e) => setSpeaker(e.target.value)} /></label>
            <label className="field"><span>Page</span>
              <input id="quote-page" className="input tabular" type="number" min={0} value={page} onChange={(e) => setPage(e.target.value)} /></label>
          </div>
          <button className="btn small" type="submit" disabled={act.busy} style={{ alignSelf: 'flex-start' }}>Save line</button>
        </form>
      </details>
      <Notice error>{act.error}</Notice>
    </section>
  );
}

