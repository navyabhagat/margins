# Margins

The backend for **Margins**, a book club app. Clubs read one book a month, keep a
running list of things to talk about, and save every finished book with its notes,
favorite lines, photos and ratings.

It runs on [Supabase](https://supabase.com): a hosted Postgres database with
sign-in and photo storage built in. This repository holds:

| Folder | What's in it |
| --- | --- |
| `supabase/migrations/` | The database: tables, security rules, actions and views |
| `supabase/seed.sql` | Sample data (the Second Chapter club, *The Unknown* and *Recursion*) for local testing |
| `supabase/tests/` | Permission tests that prove each club's data stays private |
| `src/` | A TypeScript client with one function for each thing the app does |
| `app/` | The Margins web app (React), using that client |

## Run the app

1. Make sure the database is set up (see "Set up a live project" below) and that a `.env`
   file sits in this folder with your project's URL and anon key (copy `.env.example`).
2. In Supabase, under **Authentication → URL Configuration**, set the Site URL to
   `http://localhost:3000` while you're testing.
3. Then:
   ```sh
   cd app
   npm install
   npm run dev
   ```
4. Open http://localhost:3000, enter your email, and click the link Supabase sends you.
   Start your club, add a book from the **club** tab, and share the invite code.

Supabase's built-in email service only sends a few sign-in emails an hour. Before inviting
the whole club, connect your own email sender under **Project Settings → Authentication → SMTP**.

To put the app online, run `npm run build` in `app/` and host the `app/dist` folder on any
static host (Netlify, Vercel, Cloudflare Pages). Set it to send every path to `index.html`,
add the two `VITE_SUPABASE_…` values as environment variables, and change the Site URL in
Supabase to the new address.

## How the app's screens map to the backend

| Screen | Client functions |
| --- | --- |
| Join a club | `signInWithEmail`, `myClubs`, `joinClub`, `createClub` |
| This month | `currentBook`, `setMyPage`, `rsvp`, `setReadThrough` (admins) |
| On the table | `topics`, `addTopic`, `toggleMeToo`, `setTopicStatus`, `watchTable` (live updates) |
| Our shelf | `shelf` |
| A past book | `bookRecord`, `addQuote`, `addMeetingNote`, `uploadPhoto`, `rate` |
| Club settings | `members`, `setMemberRole`, `newInviteCode`, `addBook`, `startBook`, `finishBook` |

```ts
import { createMargins } from 'margins';

const margins = createMargins(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);

await margins.signInWithEmail('you@example.com', 'Your name');
const [club] = await margins.myClubs();
const book = await margins.currentBook(club.id);          // Recursion, read through p. 60
const table = await margins.topics(book!.id);              // spoiler-safe for your page
await margins.addTopic(club.id, book!.id, 'Why are the false memories gray?', 12);
```

## What's stored

- **Clubs and members.** Each member is an owner, admin or member, and keeps a
  personal bookmark (`current_page`) in the current book. Clubs are joined with an
  8-character invite code.
- **Books.** One per month per club, with a status (upcoming, current, finished),
  meeting time and place, a color mood, and a group bookmark ("read through p. 60").
  Only one book can be current at a time.
- **The table.** Discussion topics with an optional page number. Members tap
  "me too" to agree, and tick topics off during the meeting. Topics past your own
  bookmark are hidden by default so nobody gets spoiled.
- **The shelf.** Quotes the club picks, meeting notes, photos (with an optional
  yellow subtitle and one cover per book), half-star ratings and RSVPs.

## Who can do what

- Everything in a club is visible **only to its members**. Signed-out visitors see nothing.
- Members add their own topics, votes, quotes, notes, photos, ratings and RSVPs,
  and can edit or delete their own. Anything they add is always credited to them.
- Any member can tick a topic off at the meeting.
- Owners and admins manage books, the invite code, and can tidy up anything in the club.
- Only owners change roles. A club always keeps at least one owner.
- Photos are stored privately and shown through short-lived links.

These rules live in the database itself, so they hold no matter which app talks to it.
`supabase/tests/permissions.sql` checks 52 of them.

## Set up a live project

1. Create a free project at [supabase.com](https://supabase.com/dashboard). Note its
   **project ref** (in the URL) and database password.
2. In this folder:
   ```sh
   npm install
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push        # creates the tables, rules and photo storage
   ```
3. In the Supabase dashboard, open **Project Settings → API** and copy the
   **Project URL** and **anon public key** into a `.env` file (see `.env.example`).
4. Under **Authentication → URL Configuration**, set the Site URL to where the app
   runs, so sign-in links come back to it.

`seed.sql` is for local testing only and isn't pushed to the live project.

## Work on it locally

Needs [Docker Desktop](https://www.docker.com/products/docker-desktop/) running.

```sh
npm install
npm run db:start      # starts Supabase on your machine
npm run db:reset      # rebuilds the database with the sample club
npm run db:test       # runs the permission tests
npm run db:types      # generates exact TypeScript types from the database
```

Sample readers after a reset (password `margins-demo`): `avery@example.com` (owner),
`kai@example.com`, `maya@example.com`. Invite code: `CHAPTER2`.

Without Docker, the tests also run against any plain Postgres 15+:

```sh
PGHOST=localhost PGUSER=postgres supabase/tests/run-local.sh
```

## Changing the database

Add a new file in `supabase/migrations/` (e.g. `npx supabase migration new add_reading_goals`),
run `npm run db:reset` and `npm run db:test`, then `npx supabase db push` to update the live project.
Never edit a migration that has already been pushed.
