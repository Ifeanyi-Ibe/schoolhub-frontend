// Calendar dates are plain YYYY-MM-DD strings. They are shown as days, read in UTC so that no time zone
// moves them to the day before.
const DAY_FORMAT = new Intl.DateTimeFormat("en-NG", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function formatCalendarDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return DAY_FORMAT.format(new Date(Date.UTC(y!, m! - 1, d!)));
}
