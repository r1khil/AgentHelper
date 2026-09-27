import { DateTime } from "luxon";

const NY = "America/New_York";

/** "Sunday 12:00 pm" when it happened the week after the pack's Friday, otherwise "Sep 30, 12:00 pm". */
export function whenBuilt(iso: string, weekEnding: string): string {
  const d = DateTime.fromISO(iso, { zone: NY });
  const days = d.diff(DateTime.fromISO(weekEnding, { zone: NY }), "days").days;
  const text = days >= 0 && days < 7 ? d.toFormat("cccc h:mm a") : d.toFormat("LLL d, h:mm a");
  return text.replace("AM", "am").replace("PM", "pm");
}
