import { DateTime, Option, Schema } from "effect";

const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u;

const MAX_TIME_ZONE_LENGTH = 64;

/** A time zone's IANA name, such as `Europe/London`, that the runtime knows. */
export const TimeZoneName = Schema.String.check(
  Schema.isMaxLength(MAX_TIME_ZONE_LENGTH),
  Schema.makeFilter((name) => Option.isSome(DateTime.zoneMakeNamed(name)), {
    message: "Choose a time zone, such as Europe/London.",
  })
);

/**
 * A date and a time of day on a wall clock, with no time zone, such as
 * `2026-12-01T09:00`, to the minute.
 */
export const LocalDateTime = Schema.String.check(
  Schema.isPattern(LOCAL_DATE_TIME, {
    message: "Give a date and time such as 2026-12-01T09:00.",
  }),
  Schema.makeFilter(
    (local) =>
      DateTime.make(`${local}:00Z`).pipe(
        Option.exists((parsed) => DateTime.formatIso(parsed).startsWith(local))
      ),
    { message: "That date doesn't exist." }
  )
);

/**
 * When a member wants a Campaign sent: a date and time as a clock in
 * `timeZone` shows it. A time the clocks skip, when daylight saving starts,
 * is moved later by the length of the skip; a time they show twice, when it
 * ends, is the first of the two.
 */
export const ScheduleRequest = Schema.Struct({
  localDateTime: LocalDateTime,
  timeZone: TimeZoneName,
});

/** The instant a `ScheduleRequest` names. */
export const scheduledInstant = (request: typeof ScheduleRequest.Type) =>
  DateTime.makeZoned(request.localDateTime, {
    adjustForTimeZone: true,
    disambiguation: "compatible",
    timeZone: request.timeZone,
  }).pipe(Option.map(DateTime.toUtc));

/**
 * Why a scheduled Campaign didn't start when it was due, and went back to
 * being a draft: its Provider Connection was deleted, or no one would get
 * it. Its Organization's postal address can't be missing, since scheduling
 * needs one and it can't be removed.
 */
export const MissedScheduleReasonSchema = Schema.Literals([
  "no-provider-connection",
  "no-subscribed-contacts",
]);

export type MissedScheduleReason = typeof MissedScheduleReasonSchema.Type;

/**
 * When a Campaign is or was scheduled to start sending: the instant, and the
 * time zone the member chose it in. `missed` says why it didn't start when
 * it was due, which makes it a draft again; it's null while it's scheduled,
 * and once it started.
 */
export const CampaignSchedule = Schema.Struct({
  at: Schema.DateTimeUtc,
  timeZone: TimeZoneName,
  missed: Schema.NullOr(MissedScheduleReasonSchema),
});
