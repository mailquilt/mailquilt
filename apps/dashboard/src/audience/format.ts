import { DateTime } from "effect";

/** A whole number as people read it: 1,204. */
export const formatCount = (value: number) => value.toLocaleString("en");

/** A day as the audience tables show it: "Nov 22", with the year when it isn't this one. */
export const formatDay = (date: DateTime.Utc) => {
  const value = DateTime.toDate(date);

  return value.getFullYear() === new Date().getFullYear()
    ? value.toLocaleDateString("en", { day: "numeric", month: "short" })
    : value.toLocaleDateString("en", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
};
