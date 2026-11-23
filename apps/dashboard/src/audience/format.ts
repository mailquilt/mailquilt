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

const WRAP_POINT = "​";

/**
 * An email address that a line can break only after its "@" or a dot,
 * never mid-word or before its ending: "wholesale@" / "fernhillcoffee.com".
 * For text that wraps, such as a toast's title.
 */
export const wrappableAddress = (address: string) => {
  const parts = address.split(/(?<=[@.])/u);
  const ending = parts.at(-1);
  const beforeEnding = parts.at(-2);

  if (
    ending !== undefined &&
    beforeEnding !== undefined &&
    beforeEnding.endsWith(".")
  ) {
    parts.splice(-2, 2, `${beforeEnding}${ending}`);
  }

  return parts.join(WRAP_POINT);
};
