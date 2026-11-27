import { scheduledInstant } from "@repo/domain";
import { Array as Arr, DateTime, Option, Order } from "effect";

/** The time zone the browser is in, such as `Europe/London`. */
export const viewerZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone;

// WARNING: browsers still name some zones by a city's old name, such as Asia/Calcutta for India, so those are shown by the name people use now; a search matches either.
const CITIES_RENAMED = new Map([
  ["America/St_Johns", "St. John’s"],
  ["Asia/Calcutta", "Kolkata"],
  ["Asia/Katmandu", "Kathmandu"],
  ["Asia/Rangoon", "Yangon"],
  ["Asia/Saigon", "Ho Chi Minh City"],
  ["Europe/Kiev", "Kyiv"],
]);

/** "New York" from `America/New_York`. */
export const cityOf = (zone: string) =>
  CITIES_RENAMED.get(zone) ??
  (zone.split("/").at(-1) ?? zone).replaceAll("_", " ");

const wallParts = (date: DateTime.Utc, timeZone: string) => {
  const parts: Record<string, string> = {};

  for (const part of new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(DateTime.toDate(date))) {
    parts[part.type] = part.value;
  }

  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: parts.minute ?? "00",
  };
};

/** The day a clock in `timeZone` shows at that instant: "2026-12-01". */
export const dayIn = (date: DateTime.Utc, timeZone: string) =>
  wallParts(date, timeZone).day;

/** A time of day in `timeZone`, on the 24-hour clock: "9:00", "14:30". */
export const clockIn = (date: DateTime.Utc, timeZone: string) => {
  const { hour, minute } = wallParts(date, timeZone);

  return `${hour}:${minute}`;
};

/** "Tuesday, Dec 1" in `timeZone`, with the year when it isn't this year. */
export const longDayIn = (date: DateTime.Utc, timeZone: string) => {
  const thisYear =
    dayIn(date, timeZone).slice(0, 4) ===
    dayIn(DateTime.nowUnsafe(), timeZone).slice(0, 4);

  const shown: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    timeZone,
    weekday: "long",
  };

  if (!thisYear) {
    shown.year = "numeric";
  }

  return new Intl.DateTimeFormat("en-US", shown).format(DateTime.toDate(date));
};

/** "Tue, Dec 1" for a day such as "2026-12-01", with the year when it isn't this year. */
export const shortDay = (day: string) => {
  const [year, month, date] = day.split("-").map(Number);
  const value = new Date(year ?? 0, (month ?? 1) - 1, date ?? 1);

  const shown: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    weekday: "short",
  };

  if (value.getFullYear() !== new Date().getFullYear()) {
    shown.year = "numeric";
  }

  return value.toLocaleDateString("en-US", shown);
};

const TYPED_TIME = /^(?<hour>\d{1,2}):?(?<minute>\d{2})$/u;

const LAST_HOUR = 23;

const LAST_MINUTE = 59;

/** A time as typed, "9:00", "0900" or "900", as "09:00"; undefined when it isn't a time of day. */
export const typedTime = (typed: string) => {
  const match = TYPED_TIME.exec(typed.trim());
  const hour = Number(match?.groups?.hour);
  const minute = Number(match?.groups?.minute);

  if (match === null || hour > LAST_HOUR || minute > LAST_MINUTE) {
    return;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

/**
 * The instant a day and a time name in `timeZone`, as the API works it out,
 * and whether the clocks skip that time, so it goes later by the skip.
 */
export const momentOf = (day: string, time: string, timeZone: string) =>
  scheduledInstant({ localDateTime: `${day}T${time}`, timeZone }).pipe(
    Option.map((at) => {
      const { day: shownDay, hour, minute } = wallParts(at, timeZone);

      return {
        at,
        skipped:
          `${shownDay}T${String(hour).padStart(2, "0")}:${minute}` !==
          `${day}T${time}`,
      };
    })
  );

/** A time zone as the list shows it. */
export interface Zone {
  readonly id: string;
  readonly city: string;
  /** "Eastern Time" */
  readonly name: string;
  /** "GMT−5", with a real minus sign */
  readonly offset: string;
}

const zoneName = (id: string, at: Date, style: "longGeneric" | "shortOffset") =>
  new Intl.DateTimeFormat("en-US", { timeZone: id, timeZoneName: style })
    .formatToParts(at)
    .find((part) => part.type === "timeZoneName")?.value ?? "";

/** A zone's city, name and offset on the day `at`. */
export const zoneOf = (id: string, at: Date) =>
  ({
    city: cityOf(id),
    id,
    name: zoneName(id, at, "longGeneric"),
    offset: zoneName(id, at, "shortOffset").replace("-", "−"),
  }) satisfies Zone;

const BY_CITY = Order.mapInput(Order.String, (zone: Zone) => zone.city);

// WARNING: the browser can name its own zone by an older alias that its list of zones leaves out, such as Asia/Calcutta, so the viewer's zone is added; UTC isn't a city, and is missing from some browsers' lists.
/** Every zone the browser knows, by city, with offsets on the day `at`. */
export const zonesOn = (at: Date) =>
  Arr.sort(
    [
      ...new Set([viewerZone(), "UTC", ...Intl.supportedValuesOf("timeZone")]),
    ].map((id) => zoneOf(id, at)),
    BY_CITY
  );

/** Whether a zone matches a search: by its city, IANA name, zone name or offset. */
export const zoneMatches = (zone: Zone, query: string) => {
  const sought = query.trim().toLowerCase();

  return [zone.city, zone.id.replaceAll("_", " "), zone.name, zone.offset]
    .map((field) => field.toLowerCase())
    .some(
      (field) =>
        field.includes(sought) || field.replace("−", "-").includes(sought)
    );
};

/** " in New York", or nothing for the viewer's own zone. */
export const inZone = (zone: string) =>
  zone === viewerZone() ? "" : ` in ${cityOf(zone)}`;

/** The moment on the viewer's clock, "14:00" or "2:00 on Wednesday, Dec 2"; undefined when `zone` is theirs. */
export const viewerClock = (at: DateTime.Utc, zone: string) => {
  const mine = viewerZone();

  if (zone === mine) {
    return;
  }

  return dayIn(at, zone) === dayIn(at, mine)
    ? clockIn(at, mine)
    : `${clockIn(at, mine)} on ${longDayIn(at, mine)}`;
};
