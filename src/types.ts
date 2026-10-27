// Shapes the app works with. These mirror the database tables and views in
// supabase/migrations. For exact generated types, run `npm run db:types`.

export type MemberRole = 'owner' | 'admin' | 'member';
export type BookStatus = 'upcoming' | 'current' | 'finished';
export type TopicStatus = 'open' | 'discussed';
export type RsvpStatus = 'going' | 'maybe' | 'not_going';

export interface Profile {
  id: string;
  display_name: string;
  avatar_path: string | null;
}

export interface Club {
  id: string;
  name: string;
  description: string | null;
  invite_code: string;
  created_by: string;
  created_at: string;
}

/** A row from the `my_clubs` view: a club plus your place in it. */
export interface MyClub {
  id: string;
  name: string;
  description: string | null;
  invite_code: string;
  role: MemberRole;
  current_page: number | null;
  member_count: number;
  current_book_id: string | null;
  current_book_title: string | null;
  current_meeting_at: string | null;
}

export interface Member {
  club_id: string;
  user_id: string;
  role: MemberRole;
  current_page: number | null;
  joined_at: string;
  profile: Pick<Profile, 'display_name' | 'avatar_path'> | null;
}

export interface Book {
  id: string;
  club_id: string;
  title: string;
  author: string;
  published_year: number | null;
  page_count: number | null;
  /** First day of the month the club reads it, e.g. "2026-11-01". */
  month: string;
  status: BookStatus;
  meeting_at: string | null;
  meeting_place: string | null;
  note: string | null;
  mood_color: string | null;
  read_through_page: number | null;
  read_through_note: string | null;
  created_at: string;
}

/** A row from the `book_overview` view. */
export interface BookOverview extends Book {
  avg_rating: number | null;
  rating_count: number;
  my_rating: number | null;
  open_topic_count: number;
  discussed_topic_count: number;
  photo_count: number;
  quote_count: number;
  going_count: number;
  my_rsvp: RsvpStatus | null;
  cover_path: string | null;
}

export type NewBook = Pick<Book, 'title' | 'author' | 'month'> &
  Partial<Pick<Book, 'published_year' | 'page_count' | 'status' | 'meeting_at' | 'meeting_place' |
                     'note' | 'mood_color' | 'read_through_page' | 'read_through_note'>>;

/** A row from the `topic_feed` view: one card on "the table". */
export interface Topic {
  id: string;
  club_id: string;
  book_id: string;
  author_id: string | null;
  author_name: string | null;
  body: string;
  page: number | null;
  status: TopicStatus;
  discussed_at: string | null;
  created_at: string;
  vote_count: number;
  voted_by_me: boolean;
  /** True when the topic's page is past your bookmark: hide it to avoid spoilers. */
  is_ahead_of_me: boolean;
}

export interface Quote {
  id: string;
  club_id: string;
  book_id: string;
  added_by: string | null;
  body: string;
  page: number | null;
  speaker: string | null;
  created_at: string;
}

export interface MeetingNote {
  id: string;
  club_id: string;
  book_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
}

export interface Photo {
  id: string;
  club_id: string;
  book_id: string;
  uploaded_by: string | null;
  storage_path: string;
  caption: string | null;
  subtitle: string | null;
  is_cover: boolean;
  created_at: string;
  /** Short-lived link for showing the image, filled in by the client. */
  url?: string;
}

export interface Rating {
  book_id: string;
  user_id: string;
  stars: number;
}

/** Everything the "past book" screen shows. */
export interface BookRecord {
  book: BookOverview;
  topics: Topic[];
  quotes: Quote[];
  notes: MeetingNote[];
  photos: Photo[];
  ratings: Rating[];
}
