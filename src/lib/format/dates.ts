// Dates display in Africa/Lagos (CLAUDE.md, product context). Calendar dates (YYYY-MM-DD) are
// never shifted by the viewer's timezone; instants (UTC with offset) are converted to Lagos time.

import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

export const SCHOOL_TIME_ZONE = "Africa/Lagos";

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A calendar date from the API (`2034-09-04`), formatted without timezone shift. */
export function formatCalendarDate(iso: string, pattern = "d MMM yyyy"): string {
  const m = CALENDAR_DATE.exec(iso);
  if (!m) throw new RangeError("Expected a calendar date (YYYY-MM-DD)");
  const d = new TZDate(Number(m[1]), Number(m[2]) - 1, Number(m[3]), SCHOOL_TIME_ZONE);
  return format(d, pattern);
}

/** An instant from the API (UTC with offset), shown in Lagos time. */
export function formatInstant(iso: string, pattern = "d MMM yyyy, HH:mm"): string {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) throw new RangeError("Expected an ISO instant");
  return format(new TZDate(instant.getTime(), SCHOOL_TIME_ZONE), pattern);
}
