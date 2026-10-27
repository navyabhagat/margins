import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Book, BookOverview, BookStatus, Member, MemberRole } from '@margins';
import { margins } from '../lib/margins';
import { useAction, useLoad } from '../lib/hooks';
import { fromLocalInput, initials, monthYear, MOODS, toLocalInput } from '../lib/format';
import { useClub } from '../components/ClubLayout';
import { Loading, Logo, Notice } from '../components/bits';

/** The "club" tab: invite people, plan books, manage members. */
export function ClubSettings() {
  const { club, me, isAdmin, isOwner, reloadClub } = useClub();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useLoad(async () => {
    const [members, books] = await Promise.all([margins.members(club.id), margins.shelf(club.id)]);
    return { members, books };
  }, [club.id]);
  const leave = useAction();
  const [confirmLeave, setConfirmLeave] = useState(false);

  if (loading && !data) return <Loading />;
  if (error) return <div className="page"><Notice error>{error}</Notice></div>;
  const { members, books } = data!;
  const planned = books.filter((b) => b.status !== 'finished');

  async function doLeave() {
    const ok = await leave.run(async () => { await margins.leaveClub(club.id); return true; });
    if (ok) {
      try { localStorage.removeItem('margins:lastClub'); } catch { /* ignore */ }
      navigate('/clubs');
    }
  }

  return (
    <div className="page">
      <div className="spread">
        <Logo width={130} />
        <Link className="link" to="/clubs">All clubs</Link>
      </div>
      <div className="stack">
        <span className="tape plain">the club</span>
        <h1 style={{ marginTop: 6 }}>{club.name.toLowerCase()}</h1>
        {club.description && <p className="hand">{club.description}</p>}
      </div>

      <Invite code={club.invite_code} clubId={club.id} isAdmin={isAdmin} onChange={reloadClub} />

      {isAdmin && (
        <section className="stack" aria-labelledby="books-h">
          <h2 id="books-h">plan the <em>books</em></h2>
          {planned.length === 0 && <p className="meta">No current or upcoming books. Add the next one below.</p>}
          {planned.map((b) => <PlannedBook key={b.id} book={b} onChange={async () => { await reload(); await reloadClub(); }} />)}
          <AddBook clubId={club.id} takenMonths={books.map((b) => b.month.slice(0, 7))}
                   currentMonth={books.find((b) => b.status === 'current')?.month.slice(0, 7)} onAdded={async () => { await reload(); await reloadClub(); }} />
        </section>
      )}

      <section className="stack" aria-labelledby="members-h">
        <h2 id="members-h">who’s <em>here</em> · {members.length}</h2>
        <div className="list">
          {members.map((m) => (
            <MemberRow key={m.user_id} member={m} me={me} isOwner={isOwner} isAdmin={isAdmin} onChange={reload} />
          ))}
        </div>
      </section>

      <section className="stack">
        {club.role !== 'owner' && (confirmLeave ? (
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <span className="meta">Leave {club.name}? You can rejoin with the invite code.</span>
            <button className="btn danger small" type="button" onClick={doLeave} disabled={leave.busy}>Leave club</button>
            <button className="btn quiet" type="button" onClick={() => setConfirmLeave(false)}>Stay</button>
          </div>
        ) : (
          <button className="link" type="button" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirmLeave(true)}>Leave this club</button>
        ))}
        <Notice error>{leave.error}</Notice>
        <button className="link" type="button" style={{ alignSelf: 'flex-start' }} onClick={() => margins.signOut()}>Sign out</button>
      </section>
    </div>
  );
}

function Invite({ code, clubId, isAdmin, onChange }: { code: string; clubId: string; isAdmin: boolean; onChange: () => Promise<void> }) {
  const [copied, setCopied] = useState(false);
  const act = useAction();
  const [confirm, setConfirm] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked: the code stays visible to copy by hand */ }
  }
  async function regenerate() {
    const ok = await act.run(() => margins.newInviteCode(clubId));
    if (ok) { setConfirm(false); await onChange(); }
  }

  return (
    <section className="stack" aria-labelledby="invite-h">
      <h2 id="invite-h">invite <em>someone</em></h2>
      <p className="meta">Share this code. They enter it on the “join a club” screen.</p>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <span className="code tabular" aria-label={`Invite code ${code.split('').join(' ')}`}>{code}</span>
        <button className="btn ghost small" type="button" onClick={copy}>{copied ? 'Copied' : 'Copy code'}</button>
      </div>
      {isAdmin && (confirm ? (
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <span className="meta">The old code will stop working.</span>
          <button className="btn small" type="button" onClick={regenerate} disabled={act.busy}>Make a new code</button>
          <button className="btn quiet" type="button" onClick={() => setConfirm(false)}>Cancel</button>
        </div>
      ) : (
        <button className="link" type="button" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirm(true)}>Make a new code</button>
      ))}
      <Notice error>{act.error}</Notice>
    </section>
  );
}

function PlannedBook({ book, onChange }: { book: BookOverview; onChange: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const act = useAction();
  const run = (fn: () => Promise<unknown>) => async () => {
    const ok = await act.run(async () => { await fn(); return true; });
    if (ok) await onChange();
  };

  return (
    <div className="stack" style={{ borderTop: '1px solid var(--rule)', paddingTop: 12, gap: 8 }}>
      <div className="spread">
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, textTransform: 'lowercase' }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, background: book.mood_color ?? 'var(--brand)', marginRight: 8 }} />
            <em>{book.title}</em>
          </div>
          <div className="meta">{monthYear(book.month)} · {book.status === 'current' ? 'reading now' : 'coming up'}</div>
        </div>
        <button className="btn quiet" type="button" onClick={() => setEditing(!editing)}>{editing ? 'Close' : 'Edit'}</button>
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        {book.status === 'upcoming' && <button className="btn small" type="button" disabled={act.busy} onClick={run(() => margins.startBook(book.id))}>Make this month’s book</button>}
        {book.status === 'current' && <button className="btn ghost small" type="button" disabled={act.busy} onClick={run(() => margins.finishBook(book.id))}>Move to the shelf</button>}
      </div>
      {editing && <BookForm initial={book} submitLabel="Save changes"
                            onSubmit={async (values) => { await margins.updateBook(book.id, values); setEditing(false); await onChange(); }} />}
      <Notice error>{act.error}</Notice>
    </div>
  );
}

function AddBook({ clubId, takenMonths, currentMonth, onAdded }: { clubId: string; takenMonths: string[]; currentMonth?: string; onAdded: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  // Suggest the first month from now on that doesn't have a book yet.
  const suggested = (() => {
    const d = new Date();
    for (let i = 0; i < 36; i++) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!takenMonths.includes(key)) return key;
      d.setMonth(d.getMonth() + 1);
    }
    return undefined;
  })();
  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>Add a book</summary>
      {open && (
        <div style={{ marginTop: 12 }}>
          <BookForm submitLabel="Add book" isNew defaultMonth={suggested} takenMonths={takenMonths} currentMonth={currentMonth} onSubmit={async (values) => {
            await margins.addBook(clubId, values as Parameters<typeof margins.addBook>[1]);
            setOpen(false);
            await onAdded();
          }} />
        </div>
      )}
    </details>
  );
}

type BookValues = {
  title: string; author: string; month: string; published_year: number | null; page_count: number | null;
  meeting_at: string | null; meeting_place: string | null; note: string | null; mood_color: string | null;
  status?: BookStatus;
};

const thisMonthKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
/**
 * A sensible starting guess: months before the club's current book (or before
 * this month, if there's none) are already read; later months are coming up.
 */
const statusFor = (month: string, currentMonth?: string): BookStatus => {
  const pivot = currentMonth ?? thisMonthKey();
  if (month < pivot) return 'finished';
  if (month === pivot && !currentMonth) return 'current';
  return 'upcoming';
};

function BookForm({ initial, submitLabel, onSubmit, isNew, defaultMonth, takenMonths = [], currentMonth }: {
  initial?: Book; submitLabel: string; onSubmit: (values: BookValues) => Promise<void>;
  isNew?: boolean; defaultMonth?: string; takenMonths?: string[]; currentMonth?: string;
}) {
  const nextMonth = (() => { const d = new Date(); d.setMonth(d.getMonth() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();
  const startMonth = initial?.month.slice(0, 7) ?? defaultMonth ?? nextMonth;
  const [v, setV] = useState({
    title: initial?.title ?? '', author: initial?.author ?? '',
    month: startMonth,
    year: initial?.published_year?.toString() ?? '', pages: initial?.page_count?.toString() ?? '',
    meeting: toLocalInput(initial?.meeting_at ?? null), place: initial?.meeting_place ?? '',
    note: initial?.note ?? '', mood: initial?.mood_color ?? MOODS[0],
    status: statusFor(startMonth, currentMonth),
  });
  const [statusTouched, setStatusTouched] = useState(false);
  const monthTaken = isNew && takenMonths.includes(v.month);
  const act = useAction();
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => {
    const next = { ...v, [k]: e.target.value };
    if (k === 'month' && !statusTouched) next.status = statusFor(e.target.value, currentMonth);
    setV(next);
  };
  const prefix = initial ? `edit-${initial.id.slice(0, 6)}` : 'new';

  async function submit(e: FormEvent) {
    e.preventDefault();
    await act.run(() => onSubmit({
      title: v.title.trim(), author: v.author.trim(), month: `${v.month}-01`,
      published_year: v.year ? Number(v.year) : null, page_count: v.pages ? Number(v.pages) : null,
      meeting_at: fromLocalInput(v.meeting), meeting_place: v.place.trim() || null,
      note: v.note.trim() || null, mood_color: v.mood,
      ...(isNew ? { status: v.status } : {}),
    }));
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="form-grid">
        <label className="field wide"><span>Title</span>
          <input id={`${prefix}-title`} className="input" required maxLength={200} value={v.title} onChange={set('title')} /></label>
        <label className="field wide"><span>Author</span>
          <input id={`${prefix}-author`} className="input" required maxLength={200} value={v.author} onChange={set('author')} /></label>
        <label className="field"><span>Month</span>
          <input id={`${prefix}-month`} className="input" type="month" required value={v.month} onChange={set('month')}
                 aria-invalid={monthTaken || undefined} /></label>
        <label className="field"><span>Pages</span>
          <input id={`${prefix}-pages`} className="input tabular" type="number" min={1} value={v.pages} onChange={set('pages')} /></label>
        <label className="field"><span>Meeting</span>
          <input id={`${prefix}-meeting`} className="input" type="datetime-local" value={v.meeting} onChange={set('meeting')} /></label>
        <label className="field"><span>Published</span>
          <input id={`${prefix}-year`} className="input tabular" type="number" min={0} max={3000} placeholder="year" value={v.year} onChange={set('year')} /></label>
        <label className="field wide"><span>Where</span>
          <input id={`${prefix}-place`} className="input" maxLength={200} placeholder="Place to be decided" value={v.place} onChange={set('place')} /></label>
        <label className="field wide"><span>A note for the club</span>
          <textarea id={`${prefix}-note`} className="input handwritten" maxLength={1000} value={v.note} onChange={set('note')} /></label>
        {monthTaken && <p className="notice error wide" role="alert">Your club already has a book for that month. Pick a different month.</p>}
        {isNew && (
          <fieldset className="field wide" style={{ border: 0, padding: 0, margin: 0 }}>
            <span>Where it goes</span>
            <div className="segmented" role="group" aria-label="Where it goes">
              {([['finished', 'Already read'], ['current', 'Reading now'], ['upcoming', 'Coming up']] as [BookStatus, string][]).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={v.status === value}
                        onClick={() => { setStatusTouched(true); setV({ ...v, status: value }); }}>{label}</button>
              ))}
            </div>
            <span style={{ textTransform: 'none', letterSpacing: 0, fontSize: 13 }}>
              {v.status === 'finished' ? 'Goes straight onto the shelf.' : v.status === 'current' ? 'Becomes this month’s book. Any current book moves to the shelf.' : 'Waits in the plan until you start it.'}
            </span>
          </fieldset>
        )}
        <fieldset className="field wide" style={{ border: 0, padding: 0, margin: 0 }}>
          <span>Color mood</span>
          <div className="row" style={{ gap: 8 }}>
            {MOODS.map((m) => (
              <button key={m} type="button" aria-label={`Color ${m}`} aria-pressed={v.mood === m} onClick={() => setV({ ...v, mood: m })}
                      style={{ width: 34, height: 34, background: m, border: v.mood === m ? '3px solid var(--ink)' : '3px solid #fff',
                               outline: '1px solid var(--rule)', cursor: 'pointer' }} />
            ))}
          </div>
        </fieldset>
      </div>
      <Notice error>{act.error}</Notice>
      <button className="btn small" type="submit" disabled={act.busy || monthTaken} style={{ alignSelf: 'flex-start' }}>{act.busy ? 'Saving…' : submitLabel}</button>
    </form>
  );
}

function MemberRow({ member, me, isOwner, isAdmin, onChange }: {
  member: Member; me: string; isOwner: boolean; isAdmin: boolean; onChange: () => Promise<void>;
}) {
  const act = useAction();
  const name = member.profile?.display_name ?? 'Reader';
  const isMe = member.user_id === me;

  async function setRole(role: MemberRole) {
    const ok = await act.run(async () => { await margins.setMemberRole(member.club_id, member.user_id, role); return true; });
    if (ok) await onChange();
  }
  async function remove() {
    const ok = await act.run(async () => { await margins.removeMember(member.club_id, member.user_id); return true; });
    if (ok) await onChange();
  }

  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row">
        <span className="avatar" style={{ marginLeft: 0 }}>{initials(name)}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 700 }}>{name}{isMe ? ' (you)' : ''}</span>
          <span className="meta" style={{ display: 'block' }}>
            {member.role}{member.current_page != null ? ` · on p. ${member.current_page}` : ''}
          </span>
        </span>
        {isOwner && !isMe ? (
          <label>
            <span className="sr-only">Role for {name}</span>
            <select id={`role-${member.user_id}`} className="input" style={{ minHeight: 36, width: 110, fontSize: 14 }}
                    value={member.role} disabled={act.busy} onChange={(e) => setRole(e.target.value as MemberRole)}>
              <option value="member">member</option>
              <option value="admin">admin</option>
              <option value="owner">owner</option>
            </select>
          </label>
        ) : null}
        {isAdmin && !isMe && member.role === 'member' && (
          <button className="btn quiet" type="button" onClick={remove} disabled={act.busy}>Remove</button>
        )}
      </div>
      <Notice error>{act.error}</Notice>
    </div>
  );
}
