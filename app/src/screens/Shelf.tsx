import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { BookOverview } from '@margins';
import { margins } from '../lib/margins';
import { useLoad } from '../lib/hooks';
import { monthName } from '../lib/format';
import { useClub } from '../components/ClubLayout';
import { Chevron, Loading, Notice } from '../components/bits';

/** "Our shelf": every book the club has read or plans to. */
export function Shelf() {
  const { club } = useClub();
  const { data, error, loading } = useLoad(async () => {
    const books = await margins.shelf(club.id);
    const covers = await Promise.all(
      books.map((b) => (b.cover_path ? margins.photoUrl(b.cover_path).catch(() => null) : Promise.resolve(null))),
    );
    return books.map((b, i) => ({ book: b, cover: covers[i] }));
  }, [club.id]);

  if (loading && !data) return <Loading />;
  if (error) return <div className="page"><Notice error>{error}</Notice></div>;
  const rows = data!;
  const read = rows.filter((r) => r.book.status !== 'upcoming');
  const years = [...new Set(rows.map((r) => r.book.month.slice(0, 4)))];
  const frames = [...read].reverse();

  return (
    <div className="page">
      <div className="stack">
        <span className="tape plain">every book we’ve read</span>
        <h1 style={{ marginTop: 6 }}>our <em>shelf</em></h1>
        <p className="hand">
          {read.length === 0 ? 'Nothing on the shelf yet.' : `${read.length} ${read.length === 1 ? 'book' : 'books'} together, and counting.`}
        </p>
      </div>

      {frames.length > 0 && (
        <div className="filmstrip" aria-hidden="true">
          {frames.map(({ book, cover }) => (
            <div key={book.id} className={`frame${book.status === 'current' ? ' current' : ''}`}>
              {cover && <img src={cover} alt="" />}
            </div>
          ))}
          {Array.from({ length: Math.max(0, 4 - frames.length) }).map((_, i) => <div key={`e${i}`} className="frame" />)}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="empty-state"><p className="hand">Books show up here once your club adds them.</p></div>
      ) : years.map((year) => (
        <section key={year} className="stack" style={{ gap: 0 }} aria-label={year}>
          <p className="eyebrow" style={{ paddingBottom: 8 }}>{year}</p>
          <div className="list">
            {rows.filter((r) => r.book.month.startsWith(year)).map(({ book, cover }) => (
              <ShelfRow key={book.id} book={book} cover={cover} clubId={club.id} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ShelfRow({ book, cover, clubId }: { book: BookOverview; cover: string | null; clubId: string }) {
  const style = { '--mood': book.mood_color ?? '#8a4a2e' } as CSSProperties;
  const detail = book.status === 'current'
    ? `${book.open_topic_count} on the table`
    : book.status === 'finished'
      ? [book.avg_rating != null && `${book.avg_rating}★`, book.quote_count > 0 && `${book.quote_count} lines`].filter(Boolean).join(' · ') || 'finished'
      : 'coming up';
  return (
    <Link to={`/club/${clubId}/book/${book.id}`} className="list-link" style={style}>
      <span className="eyebrow mood" style={{ width: 40, flexShrink: 0 }}>{monthName(book.month, 'short')}</span>
      {cover ? <img className="thumb" src={cover} alt="" /> : <span className="thumb empty" />}
      <span className="stack" style={{ gap: 3, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 18, fontWeight: 700, textTransform: 'lowercase' }}><em>{book.title}</em></span>
        <span className="meta">{book.author} · {detail}</span>
      </span>
      <span className={`pill ${book.status}`}>{book.status === 'current' ? 'reading' : book.status === 'upcoming' ? 'next' : ''}</span>
      <Chevron />
    </Link>
  );
}
