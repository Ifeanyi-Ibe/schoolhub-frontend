// Dates display in Africa/Lagos (CLAUDE.md, product context). Calendar dates (YYYY-MM-DD) are
// never shifted by the viewer's timezone; instants (UTC with offset) are converted to Lagos time.
// Formatting uses Intl (en-NG, the default locale), so no date library ships to the browser.

export const SCHOOL_TIME_ZONE = "Africa/Lagos";
const LOCALE = "en-NG";

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const dateFormat = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: SCHOOL_TIME_ZONE,
});

/** A calendar date from the API (`2034-09-04`), formatted without timezone shift. */
export function formatCalendarDate(iso: string): string {
  const m = CALENDAR_DATE.exec(iso);
  if (!m) throw new RangeError("Expected a calendar date (YYYY-MM-DD)");
  // Midnight UTC of that calendar day, formatted in UTC, so the day never moves.
  return dateFormat.format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))));
}

/** An instant from the API (UTC with offset), shown in Lagos time. */
export function formatInstant(iso: string): string {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) throw new RangeError("Expected an ISO instant");
  return dateTimeFormat.format(instant);
}
