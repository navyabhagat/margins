export function monthName(isoDate: string, style: 'long' | 'short' = 'long') {
  const [y, m] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: style });
}

export function monthYear(isoDate: string) {
  const [y] = isoDate.split('-');
  return `${monthName(isoDate)} ${y}`;
}

export function meetingDay(iso: string) {
  const d = new Date(iso);
  return {
    month: d.toLocaleString('en-US', { month: 'short' }).toLowerCase(),
    day: d.getDate(),
    weekday: d.toLocaleString('en-US', { weekday: 'long' }),
    time: d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase(),
  };
}

export function initials(name: string | null | undefined) {
  return (name ?? '?').trim().charAt(0).toUpperCase() || '?';
}

/** "2026-11-19T19:00" style value for <input type="datetime-local">. */
export function toLocalInput(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string) {
  return value ? new Date(value).toISOString() : null;
}

export const MOODS = ['#8a4a2e', '#a8566d', '#2f4a5a', '#4f6b3a', '#6b4f8a', '#9a7a2e'];

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORDINALS: Record<number, string> = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', [-1]: 'last' };

/** "19:00:00" → "7:00 pm" */
export function clockTime(t: string | null) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
}

/** "every Tuesday · 7:00 pm", "every other Tuesday · 7:00 pm", "first Tuesday of the month · 7:00 pm" */
export function describeSchedule(s: { meet_frequency: string | null; meet_weekday: number | null;
  meet_week_of_month: number | null; meet_time: string | null }) {
  if (!s.meet_frequency || s.meet_weekday == null) return null;
  const day = WEEKDAYS[s.meet_weekday];
  const when = s.meet_frequency === 'weekly' ? `every ${day}`
    : s.meet_frequency === 'biweekly' ? `every other ${day}`
    : `${ORDINALS[s.meet_week_of_month ?? 1]} ${day} of the month`;
  return s.meet_time ? `${when} · ${clockTime(s.meet_time)}` : when;
}

/** The calendar date of a moment in a given time zone, as "YYYY-MM-DD". */
export function localDate(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Days from today until a moment: 0 = today, 1 = tomorrow. */
export function daysUntil(iso: string) {
  const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = new Date(iso); b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
