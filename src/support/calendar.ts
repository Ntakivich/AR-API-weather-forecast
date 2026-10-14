/** ISO 8601 calendar date, e.g. 2026-10-14. */
export type IsoDate = string;

const MILLISECONDS_PER_DAY = 86_400_000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const ISO_DATE_LENGTH = 10;

/** The calendar date it currently is at a place, which is what "today" means to its visitors. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): IsoDate {
  // The en-CA locale formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function addDays(date: IsoDate, numberOfDays: number): IsoDate {
  const shifted = new Date(Date.parse(`${date}T00:00:00Z`) + numberOfDays * MILLISECONDS_PER_DAY);
  return shifted.toISOString().slice(0, ISO_DATE_LENGTH);
}

export function consecutiveDates(firstDate: IsoDate, numberOfDays: number): IsoDate[] {
  return Array.from({ length: numberOfDays }, (_unused, dayOffset) => addDays(firstDate, dayOffset));
}

export function utcOffsetSeconds(timeZone: string, now: Date = new Date()): number {
  const offsetLabel =
    new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(now)
      .find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
  const offsetMatch = /GMT([+-])(\d{2}):(\d{2})/.exec(offsetLabel);
  if (offsetMatch === null) {
    return 0;
  }
  const [, sign, hours = '0', minutes = '0'] = offsetMatch;
  const offsetMinutes = Number(hours) * MINUTES_PER_HOUR + Number(minutes);
  return (sign === '-' ? -1 : 1) * offsetMinutes * SECONDS_PER_MINUTE;
}
