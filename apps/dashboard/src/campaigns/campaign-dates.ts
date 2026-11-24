import { DateTime } from "effect";

import { formatDay } from "../audience/format.ts";

const isToday = (value: Date) =>
  value.toDateString() === new Date().toDateString();

/** A time of day as Campaigns show it, on the 24-hour clock: "9:14", "16:05". */
export const formatTime = (date: DateTime.Utc) => {
  const value = DateTime.toDate(date);

  return `${value.getHours()}:${String(value.getMinutes()).padStart(2, "0")}`;
};

/** When something happened: "today at 10:42", or "on Nov 21 at 10:42". */
export const formatMoment = (date: DateTime.Utc) =>
  isToday(DateTime.toDate(date))
    ? `today at ${formatTime(date)}`
    : `on ${formatDay(date)} at ${formatTime(date)}`;

/** Since when, briefly: "10:42" today, otherwise "Nov 21, 10:42". */
export const formatSince = (date: DateTime.Utc) =>
  isToday(DateTime.toDate(date))
    ? formatTime(date)
    : `${formatDay(date)}, ${formatTime(date)}`;
