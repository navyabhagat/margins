import { createClient, type SupabaseClient, type RealtimeChannel } from '@supabase/supabase-js';
import type {
  Book, BookOverview, BookRecord, Club, Member, MeetingNote, MyClub, NewBook, Photo,
  Quote, Rating, RsvpStatus, Topic, TopicStatus, MemberRole,
} from './types';

const PHOTO_BUCKET = 'club-photos';
const PHOTO_LINK_SECONDS = 60 * 60;

/** An error with a message that can be shown to the reader as-is. */
export class MarginsError extends Error {
  constructor(message: string, readonly code?: string, readonly cause?: unknown) {
    super(message);
    this.name = 'MarginsError';
  }
}

type Result<T> = { data?: T | null; error: { message: string; code?: string } | null };

function unwrap<T>({ data, error }: Result<T>, fallback = 'Something went wrong. Try again.'): T {
  if (error) {
    const friendly: Record<string, string> = {
      '42501': "You don't have permission to do that in this club.",
      '23505': 'That already exists.',
      '23514': 'That value isn’t allowed.',
      PGRST116: 'Not found.',
    };
    // Messages raised by our own database functions are already written for readers.
    const ownMessage = error.code === 'P0002' || error.code === '28000' ||
      (error.code === '42501' && /club|book|invite|role|owner/i.test(error.message));
    throw new MarginsError(ownMessage ? error.message : friendly[error.code ?? ''] ?? fallback, error.code, error);
  }
  return data as T;
}

/**
 * The Margins backend, one method per thing the app does.
 *
 *   const margins = createMargins(SUPABASE_URL, SUPABASE_ANON_KEY);
 *   await margins.signInWithEmail('me@example.com');
 *   const clubs = await margins.myClubs();
 */
export function createMargins(url: string, anonKey: string) {
  return new MarginsApi(createClient(url, anonKey));
}

export class MarginsApi {
  constructor(readonly supabase: SupabaseClient) {}

  // ---------------------------------------------------------------- account

  /** Sends a sign-in link by email. New readers get an account automatically. */
  async signInWithEmail(email: string, displayName?: string, redirectTo?: string) {
    unwrap(await this.supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo, data: displayName ? { display_name: displayName } : undefined },
    }));
  }

  async signOut() {
    unwrap(await this.supabase.auth.signOut());
  }

  async me() {
    const { data } = await this.supabase.auth.getUser();
    if (!data.user) return null;
    return unwrap(await this.supabase.from('profiles').select('*').eq('id', data.user.id).single());
  }

  async updateMyProfile(changes: { display_name?: string; avatar_path?: string | null }) {
    const user = await this.requireUser();
    return unwrap(await this.supabase.from('profiles').update(changes).eq('id', user).select().single());
  }

  // ------------------------------------------------------------------ clubs

  /** "Your clubs" on the join screen. */
  async myClubs(): Promise<MyClub[]> {
    return unwrap(await this.supabase.from('my_clubs').select('*').order('name'));
  }

  async createClub(name: string, description?: string): Promise<Club> {
    return unwrap(await this.supabase.rpc('create_club', { p_name: name, p_description: description ?? null }));
  }

  /** Join with an invite code. Spaces, dashes and lowercase are fine. */
  async joinClub(inviteCode: string): Promise<Club> {
    return unwrap(await this.supabase.rpc('join_club', { p_code: inviteCode }));
  }

  async updateClub(clubId: string, changes: { name?: string; description?: string | null }): Promise<Club> {
    return unwrap(await this.supabase.from('clubs').update(changes).eq('id', clubId).select().single());
  }

  async newInviteCode(clubId: string): Promise<string> {
    return unwrap(await this.supabase.rpc('regenerate_invite_code', { p_club: clubId }));
  }

  async members(clubId: string): Promise<Member[]> {
    return unwrap(await this.supabase
      .from('club_members')
      .select('club_id, user_id, role, current_page, joined_at, profile:profiles(display_name, avatar_path)')
      .eq('club_id', clubId)
      .order('joined_at')) as unknown as Member[];
  }

  async setMemberRole(clubId: string, userId: string, role: MemberRole) {
    unwrap(await this.supabase.rpc('set_member_role', { p_club: clubId, p_user: userId, p_role: role }));
  }

  async removeMember(clubId: string, userId: string) {
    unwrap(await this.supabase.from('club_members').delete().eq('club_id', clubId).eq('user_id', userId));
  }

  async leaveClub(clubId: string) {
    await this.removeMember(clubId, await this.requireUser());
  }

  // ------------------------------------------------------------------ books

  /** The "this month" screen. Null when the club hasn't picked a book. */
  async currentBook(clubId: string): Promise<BookOverview | null> {
    return unwrap(await this.supabase
      .from('book_overview').select('*')
      .eq('club_id', clubId).eq('status', 'current')
      .maybeSingle());
  }

  /** "Our shelf": every book, newest month first. */
  async shelf(clubId: string): Promise<BookOverview[]> {
    return unwrap(await this.supabase
      .from('book_overview').select('*')
      .eq('club_id', clubId)
      .order('month', { ascending: false }));
  }

  async book(bookId: string): Promise<BookOverview> {
    return unwrap(await this.supabase.from('book_overview').select('*').eq('id', bookId).single());
  }

  /** Everything the "past book" screen shows, with photo links ready to use. */
  async bookRecord(bookId: string): Promise<BookRecord> {
    const [book, topics, quotes, notes, photos, ratings] = await Promise.all([
      this.book(bookId),
      this.topics(bookId, { includeAhead: true }),
      this.quotes(bookId),
      this.meetingNotes(bookId),
      this.photos(bookId),
      this.supabase.from('ratings').select('book_id, user_id, stars, profile:profiles(display_name)')
        .eq('book_id', bookId).order('stars', { ascending: false })
        .then((r) => (unwrap(r) as unknown as (Rating & { profile: { display_name: string } | null })[])
          .map(({ profile, ...rest }) => ({ ...rest, display_name: profile?.display_name ?? null }))),
    ]);
    return { book, topics, quotes, notes, photos, ratings };
  }

  /** Admins: add a book to the club's calendar. `month` is "YYYY-MM". */
  async addBook(clubId: string, book: Omit<NewBook, 'month'> & { month: string }): Promise<Book> {
    const month = book.month.length === 7 ? `${book.month}-01` : book.month;
    return unwrap(await this.supabase.from('books').insert({ ...book, month, club_id: clubId }).select().single());
  }

  async updateBook(bookId: string, changes: Partial<NewBook>): Promise<Book> {
    return unwrap(await this.supabase.from('books').update(changes).eq('id', bookId).select().single());
  }

  /** Admins: set the group bookmark, e.g. "read through p. 60". */
  async setReadThrough(bookId: string, page: number | null, note?: string | null): Promise<Book> {
    return this.updateBook(bookId, { read_through_page: page, read_through_note: note ?? null });
  }

  /** Admins: make this the current read. The previous one moves to the shelf. */
  async startBook(bookId: string): Promise<Book> {
    return unwrap(await this.supabase.rpc('start_book', { p_book: bookId }));
  }

  async finishBook(bookId: string): Promise<Book> {
    return unwrap(await this.supabase.rpc('finish_book', { p_book: bookId }));
  }

  async deleteBook(bookId: string) {
    unwrap(await this.supabase.from('books').delete().eq('id', bookId));
  }

  /** Move your own bookmark in the current book. */
  async setMyPage(clubId: string, page: number | null) {
    const user = await this.requireUser();
    unwrap(await this.supabase.from('club_members').update({ current_page: page })
      .eq('club_id', clubId).eq('user_id', user));
  }

  async rsvp(clubId: string, bookId: string, status: RsvpStatus) {
    unwrap(await this.supabase.from('rsvps')
      .upsert({ club_id: clubId, book_id: bookId, status }, { onConflict: 'book_id,user_id' }));
  }

  /** Rate a book from 0.5 to 5 stars, in half stars. */
  async rate(clubId: string, bookId: string, stars: number) {
    if (stars < 0.5 || stars > 5 || stars * 2 !== Math.floor(stars * 2)) {
      throw new MarginsError('Ratings go from half a star to 5 stars, in half stars.');
    }
    unwrap(await this.supabase.from('ratings')
      .upsert({ club_id: clubId, book_id: bookId, stars }, { onConflict: 'book_id,user_id' }));
  }

  /** Take back your rating. */
  async clearMyRating(bookId: string) {
    const user = await this.requireUser();
    unwrap(await this.supabase.from('ratings').delete().eq('book_id', bookId).eq('user_id', user));
  }

  // -------------------------------------------------------------- the table

  /**
   * The cards on "the table". By default, topics past your bookmark are left
   * out so nobody gets spoiled; pass `includeAhead: true` to show them.
   */
  async topics(bookId: string, opts: { status?: TopicStatus; includeAhead?: boolean } = {}): Promise<Topic[]> {
    let query = this.supabase.from('topic_feed').select('*').eq('book_id', bookId);
    if (opts.status) query = query.eq('status', opts.status);
    if (!opts.includeAhead) query = query.eq('is_ahead_of_me', false);
    const rows: Topic[] = unwrap(await query
      .order('vote_count', { ascending: false })
      .order('created_at', { ascending: true }));
    return rows;
  }

  async addTopic(clubId: string, bookId: string, body: string, page?: number | null): Promise<Topic> {
    const row = unwrap(await this.supabase.from('discussion_topics')
      .insert({ club_id: clubId, book_id: bookId, body: body.trim(), page: page ?? null })
      .select('id').single()) as { id: string };
    return unwrap(await this.supabase.from('topic_feed').select('*').eq('id', row.id).single());
  }

  async editTopic(topicId: string, changes: { body?: string; page?: number | null }) {
    unwrap(await this.supabase.from('discussion_topics').update(changes).eq('id', topicId));
  }

  async deleteTopic(topicId: string) {
    unwrap(await this.supabase.from('discussion_topics').delete().eq('id', topicId));
  }

  /** "Me too". Returns true if you now agree with the topic. */
  async toggleMeToo(topicId: string): Promise<boolean> {
    return unwrap(await this.supabase.rpc('toggle_topic_vote', { p_topic: topicId }));
  }

  /** Tick a topic off during the meeting, or reopen it. */
  async setTopicStatus(topicId: string, status: TopicStatus) {
    unwrap(await this.supabase.rpc('set_topic_status', { p_topic: topicId, p_status: status }));
  }

  /**
   * Live updates while the club is at the table: calls `onChange` whenever a
   * topic or vote changes for this book. Call `.unsubscribe()` when done.
   */
  watchTable(bookId: string, onChange: () => void): RealtimeChannel {
    let topicIds = new Set<string>();
    const refresh = async () => {
      const { data } = await this.supabase.from('discussion_topics').select('id').eq('book_id', bookId);
      topicIds = new Set((data ?? []).map((t: { id: string }) => t.id));
    };
    void refresh();
    return this.supabase
      .channel(`table:${bookId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'discussion_topics', filter: `book_id=eq.${bookId}` },
        () => { void refresh(); onChange(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'topic_votes' },
        (payload) => {
          const row = (payload.new && 'topic_id' in payload.new ? payload.new : payload.old) as { topic_id?: string };
          if (!row?.topic_id || topicIds.has(row.topic_id)) onChange();
        })
      .subscribe();
  }

  // ------------------------------------------------- quotes, notes, photos

  async quotes(bookId: string): Promise<Quote[]> {
    return unwrap(await this.supabase.from('quotes').select('*').eq('book_id', bookId).order('page', { nullsFirst: false }));
  }

  async addQuote(clubId: string, bookId: string, body: string, opts: { page?: number; speaker?: string } = {}): Promise<Quote> {
    return unwrap(await this.supabase.from('quotes')
      .insert({ club_id: clubId, book_id: bookId, body: body.trim(), page: opts.page ?? null, speaker: opts.speaker ?? null })
      .select().single());
  }

  async deleteQuote(quoteId: string) {
    unwrap(await this.supabase.from('quotes').delete().eq('id', quoteId));
  }

  async meetingNotes(bookId: string): Promise<MeetingNote[]> {
    return unwrap(await this.supabase.from('meeting_notes').select('*').eq('book_id', bookId).order('created_at'));
  }

  async addMeetingNote(clubId: string, bookId: string, body: string): Promise<MeetingNote> {
    return unwrap(await this.supabase.from('meeting_notes')
      .insert({ club_id: clubId, book_id: bookId, body: body.trim() }).select().single());
  }

  async editMeetingNote(noteId: string, body: string) {
    unwrap(await this.supabase.from('meeting_notes').update({ body: body.trim() }).eq('id', noteId));
  }

  async deleteMeetingNote(noteId: string) {
    unwrap(await this.supabase.from('meeting_notes').delete().eq('id', noteId));
  }

  /** Photos for a book, each with a temporary `url` for displaying it. */
  async photos(bookId: string): Promise<Photo[]> {
    const rows: Photo[] = unwrap(await this.supabase.from('photos').select('*').eq('book_id', bookId).order('created_at'));
    if (rows.length === 0) return rows;
    const { data } = await this.supabase.storage.from(PHOTO_BUCKET)
      .createSignedUrls(rows.map((p) => p.storage_path), PHOTO_LINK_SECONDS);
    const links = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
    return rows.map((p) => ({ ...p, url: links.get(p.storage_path) ?? undefined }));
  }

  /** A temporary link for one stored photo, e.g. a book's cover_path. */
  async photoUrl(storagePath: string): Promise<string> {
    const { signedUrl } = unwrap(await this.supabase.storage.from(PHOTO_BUCKET)
      .createSignedUrl(storagePath, PHOTO_LINK_SECONDS)) as { signedUrl: string };
    return signedUrl;
  }

  /** Upload a photo to a book. The caption shows in yellow over it. */
  async uploadPhoto(clubId: string, bookId: string, file: Blob & { name?: string },
                    opts: { caption?: string; isCover?: boolean } = {}): Promise<Photo> {
    const ext = (file.name?.split('.').pop() || file.type.split('/')[1] || 'jpg').toLowerCase();
    const path = `${clubId}/${bookId}/${crypto.randomUUID()}.${ext}`;
    unwrap(await this.supabase.storage.from(PHOTO_BUCKET).upload(path, file, { contentType: file.type || undefined }),
      'The photo didn’t upload. Check your connection and try again.');

    if (opts.isCover) {
      await this.supabase.from('photos').update({ is_cover: false }).eq('book_id', bookId).eq('is_cover', true);
    }
    const { data, error } = await this.supabase.from('photos')
      .insert({ club_id: clubId, book_id: bookId, storage_path: path,
                caption: opts.caption ?? null, is_cover: !!opts.isCover })
      .select().single();
    if (error) {
      await this.supabase.storage.from(PHOTO_BUCKET).remove([path]);
      unwrap({ data, error });
    }
    return { ...(data as Photo), url: await this.photoUrl(path) };
  }

  async updatePhoto(photoId: string, changes: { caption?: string | null; is_cover?: boolean }) {
    unwrap(await this.supabase.from('photos').update(changes).eq('id', photoId));
  }

  async deletePhoto(photo: Pick<Photo, 'id' | 'storage_path'>) {
    unwrap(await this.supabase.from('photos').delete().eq('id', photo.id));
    await this.supabase.storage.from(PHOTO_BUCKET).remove([photo.storage_path]);
  }

  // ---------------------------------------------------------------- helpers

  private async requireUser(): Promise<string> {
    const { data } = await this.supabase.auth.getUser();
    if (!data.user) throw new MarginsError('Sign in first.');
    return data.user.id;
  }
}
