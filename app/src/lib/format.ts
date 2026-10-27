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
