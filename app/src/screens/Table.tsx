import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Topic, TopicStatus } from '@margins';
import { margins } from '../lib/margins';
import { useAction, useLoad } from '../lib/hooks';
import { useClub } from '../components/ClubLayout';
import { Loading, Notice } from '../components/bits';

/** "On the table": things to talk about for the current book. */
export function Table() {
  const { club, me, isAdmin } = useClub();
  const [tab, setTab] = useState<TopicStatus>('open');
  const [showAhead, setShowAhead] = useState(false);

  const { data, error, loading, reload } = useLoad(async () => {
    const book = await margins.currentBook(club.id);
    const topics = book ? await margins.topics(book.id, { includeAhead: true }) : [];
    return { book, topics };
  }, [club.id]);

  // Live updates while people add topics or tap "me too".
  const bookId = data?.book?.id;
  useEffect(() => {
    if (!bookId) return;
    const channel = margins.watchTable(bookId, () => { void reload(); });
    return () => { void channel.unsubscribe(); };
  }, [bookId, reload]);

  if (loading && !data) return <Loading />;
  if (error) return <div className="page"><Notice error>{error}</Notice></div>;
  const { book, topics } = data!;

  if (!book) {
    return (
      <div className="page">
        <h1>on the <em>table</em></h1>
        <div className="empty-state">
          <p className="hand">The table opens once there’s a book this month.</p>
          <Link className="btn ghost" to={`/club/${club.id}`}>Back to this month</Link>
        </div>
      </div>
    );
  }

  const inTab = topics.filter((t) => t.status === tab);
  const ahead = inTab.filter((t) => t.is_ahead_of_me);
  const visible = showAhead ? inTab : inTab.filter((t) => !t.is_ahead_of_me);
  const openCount = topics.filter((t) => t.status === 'open').length;
  const style = { '--mood': book.mood_color ?? '#8a4a2e' } as CSSProperties;

  return (
    <div className="page mood-em" style={style}>
      <div className="stack">
        <span className="tape tilt-right">
          {book.title.toLowerCase()}{book.read_through_page != null ? ` · through p. ${book.read_through_page}` : ''}
        </span>
        <h1 style={{ marginTop: 6 }}>on the <em>table</em></h1>
        <p className="hand">Things to talk about at the meeting. Add yours as you read.</p>
      </div>

      <div className="subtabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'open'} onClick={() => setTab('open')}>
          To talk about · {openCount}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'discussed'} onClick={() => setTab('discussed')}>
          Talked about · {topics.length - openCount}
        </button>
      </div>

      {ahead.length > 0 && (
        <div className="notice spread" style={{ borderLeftColor: 'var(--mood)' }}>
          <span>
            {showAhead
              ? `Showing ${ahead.length} ${ahead.length === 1 ? 'topic' : 'topics'} past your page.`
              : `${ahead.length} ${ahead.length === 1 ? 'topic is' : 'topics are'} past your page, hidden to avoid spoilers.`}
          </span>
          <button className="link" type="button" onClick={() => setShowAhead(!showAhead)}>
            {showAhead ? 'Hide' : 'Show'}
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="empty-state">
          <p className="hand">
            {tab === 'open' ? 'Nothing on the table yet. What do you want to bring up?' : 'Nothing ticked off yet. That happens at the meeting.'}
          </p>
        </div>
      ) : (
        <div className="notes">
          {visible.map((t) => (
            <TopicCard key={t.id} topic={t} canRemove={t.author_id === me || isAdmin} onChange={reload} />
          ))}
        </div>
      )}

      <Composer clubId={club.id} bookId={book.id} onAdded={() => { setTab('open'); void reload(); }} />
    </div>
  );
}

/** Splits a note into list items when it's written as "- one" / "- two" lines. */
function NoteBody({ text }: { text: string }) {
  const lines = text.split(/\r?\n|\s+(?=[-–•]\s)/).map((l) => l.trim()).filter(Boolean);
  const isList = lines.length > 1 && lines.every((l) => /^[-–•]\s*/.test(l));
  if (!isList) return <p className="note-body">{text}</p>;
  return (
    <ul className="note-body note-list">
      {lines.map((l, i) => <li key={i}>{l.replace(/^[-–•]\s*/, '').replace(/;\s*$/, '')}</li>)}
    </ul>
  );
}

/** Pencil tally marks: groups of five. */
function tally(n: number) {
  const groups = Math.floor(n / 5);
  return ['||||/'.repeat(groups).replace(/\/(?=\|)/g, '/ '), '|'.repeat(n % 5)].filter(Boolean).join(' ');
}

function TopicCard({ topic, canRemove, onChange }: { topic: Topic; canRemove: boolean; onChange: () => Promise<void> }) {
  const act = useAction();
  const [menu, setMenu] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const done = topic.status === 'discussed';

  const doThen = (fn: () => Promise<unknown>) => async () => {
    setMenu(false);
    const ok = await act.run(async () => { await fn(); return true; });
    if (ok) await onChange();
  };

  const when = topic.discussed_at
    ? new Date(topic.discussed_at).toLocaleString('en-US', { month: 'short', day: 'numeric' })
    : null;

  return (
    <article className={`note${done ? ' done' : ''}${topic.page != null ? ' has-page' : ''}`}>
      {topic.page != null && <span className="note-page">p. {topic.page}</span>}
      <span className="note-bracket" aria-hidden="true" />
      <div className="note-main">
        <NoteBody text={topic.body} />
        <div className="note-foot">
          <span className="note-who">
            {topic.author_name ?? 'A former member'}
            {done && when ? ` · talked about ${when}` : ''}
            {topic.is_ahead_of_me && !done ? <span className="note-ahead"> · past your page</span> : null}
          </span>
          <span className="note-actions">
            {!done && (
              <button type="button" className="note-metoo" aria-pressed={topic.voted_by_me} disabled={act.busy}
                      aria-label={`${topic.voted_by_me ? 'Remove your' : 'Add your'} me too. ${topic.vote_count} so far.`}
                      onClick={doThen(() => margins.toggleMeToo(topic.id))}>
                {topic.vote_count === 0 ? '+ me too' : <><span className="tally">{tally(topic.vote_count)}</span> me too</>}
              </button>
            )}
            <span className="note-menu-wrap">
              <button type="button" className="note-more" aria-label="More" aria-expanded={menu}
                      onClick={() => { setMenu(!menu); setConfirming(false); }}>
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><circle cx="19" cy="12" r="1.6" fill="currentColor" /></svg>
              </button>
              {menu && (
                <span className="note-menu" role="menu">
                  {done
                    ? <button type="button" role="menuitem" onClick={doThen(() => margins.setTopicStatus(topic.id, 'open'))}>Put it back on the table</button>
                    : <button type="button" role="menuitem" onClick={doThen(() => margins.setTopicStatus(topic.id, 'discussed'))}>We talked about this</button>}
                  {canRemove && !confirming && (
                    <button type="button" role="menuitem" onClick={() => setConfirming(true)}>Remove…</button>
                  )}
                  {canRemove && confirming && (
                    <button type="button" role="menuitem" className="danger" onClick={doThen(() => margins.deleteTopic(topic.id))}>Yes, remove it</button>
                  )}
                </span>
              )}
            </span>
          </span>
        </div>
        <Notice error>{act.error}</Notice>
      </div>
    </article>
  );
}

function Composer({ clubId, bookId, onAdded }: { clubId: string; bookId: string; onAdded: () => void }) {
  const [body, setBody] = useState('');
  const [page, setPage] = useState('');
  const act = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    const added = await act.run(() => margins.addTopic(clubId, bookId, body, page === '' ? null : Number(page)));
    if (added) { setBody(''); setPage(''); onAdded(); }
  }

  return (
    <form className="composer" onSubmit={submit} aria-label="Add something to discuss">
      <label className="field" style={{ flex: 1 }}>
        <span className="sr-only">Something to discuss</span>
        <input id="topic-body" className="input handwritten" maxLength={1000} placeholder="Something to bring up…"
               value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      <label className="field" style={{ width: 58 }}>
        <span className="sr-only">Page</span>
        <input id="topic-page" className="input tabular" type="number" min={0} inputMode="numeric" placeholder="p."
               value={page} onChange={(e) => setPage(e.target.value)} style={{ textAlign: 'center' }} />
      </label>
      <button className="btn" type="submit" disabled={act.busy || !body.trim()}>Add</button>
      {act.error && <span className="sr-only" role="alert">{act.error}</span>}
    </form>
  );
}
