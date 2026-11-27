import {
  Banner,
  Combobox,
  DatePicker,
  Input,
  inputVariants,
  Popover,
} from "@cloudflare/kumo";
import type { Campaign, Organization } from "@repo/domain";
import { Array as Arr, DateTime, Option, Order, Predicate } from "effect";
import { useId, useMemo, useRef, useState } from "react";

import { formatCount } from "../audience/format.ts";
import { CalendarIcon, InfoIcon } from "../icons/icons.tsx";
import { ActionDialog } from "../layout/action-dialog.tsx";
import { CampaignBlock } from "./campaign-status.tsx";
import { useScheduleCampaign } from "./campaigns-api.ts";
import {
  cityOf,
  clockIn,
  dayIn,
  inZone,
  longDayIn,
  momentOf,
  shortDay,
  typedTime,
  viewerClock,
  viewerZone,
  zoneMatches,
  zoneOf,
  zonesOn,
} from "./schedule-time.ts";
import type { Zone } from "./schedule-time.ts";
import { dnsProblemOf, refusalOf } from "./send-campaign-dialog.tsx";
import type { SendRefusal } from "./send-campaign-dialog.tsx";

const TEXT_SAFARI_WONT_ZOOM_INTO = "max-sm:text-lg pointer-coarse:text-lg";

const DAYS_OF_THE_WEEK = [0, 1, 2, 3, 4, 5, 6] as const;

type DayOfWeek = (typeof DAYS_OF_THE_WEEK)[number];

const MONDAY = 1;

interface WeekInfo {
  readonly language: string;
  readonly getWeekInfo?: () => { readonly firstDay: number };
  readonly weekInfo?: { readonly firstDay: number };
}

// WARNING: the week's first day comes from the browser's locale where it says (getWeekInfo, or weekInfo in older Chrome), and is Monday where it doesn't, as in Firefox; Intl counts Sunday as 7, the calendar as 0.
const firstDayOfWeek = () => {
  const locale: WeekInfo = new Intl.Locale(navigator.language);

  const firstDay =
    locale.getWeekInfo?.().firstDay ?? locale.weekInfo?.firstDay ?? MONDAY;

  return DAYS_OF_THE_WEEK[firstDay % DAYS_OF_THE_WEEK.length] ?? MONDAY;
};

const contacts = (count: number) =>
  `${formatCount(count)} ${count === 1 ? "contact" : "contacts"}`;

const dayOfDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const dateOfDay = (day: string) => {
  const [year, month, date] = day.split("-").map(Number);

  return new Date(year ?? 0, (month ?? 1) - 1, date ?? 1);
};

const shownTime = (time: string) => time.replace(/^0(?=\d:)/u, "");

const forYou = (at: DateTime.Utc, zone: string) => {
  const yours = viewerClock(at, zone);
  const city = cityOf(viewerZone());

  return yours === undefined
    ? `In ${city}, your time zone.`
    : `That’s ${yours} for you in ${city}.`;
};

const pastMessage = (
  day: string,
  time: string,
  zone: string,
  at: DateTime.Utc,
  now: DateTime.Utc
) => {
  if (DateTime.isGreaterThan(at, now)) {
    return "Mailquilt’s server says that time has passed. Check your device’s clock, or choose a later time.";
  }

  if (dayIn(now, zone) !== day) {
    return `That day has passed${inZone(zone)}. Choose a later one.`;
  }

  return zone === viewerZone()
    ? `${shownTime(time)} has passed. It’s ${clockIn(now, zone)} now.`
    : `${shownTime(time)} has passed${inZone(zone)}. It’s ${clockIn(now, zone)} there now.`;
};

// WARNING: Change time keeps the schedule it had when it's refused, so it isn't "not scheduled".
const problemOf = (failure: Error, moving: boolean) => {
  const outcome = moving
    ? "Its time hasn’t changed."
    : "It hasn’t been scheduled.";

  if (Predicate.isTagged(failure, "SignInRequired")) {
    return `You’ve been signed out. Sign in again, then schedule it. ${outcome}`;
  }

  return (
    dnsProblemOf(failure, outcome) ??
    "Mailquilt couldn’t reach its server. Check your connection, then try again. It won’t be scheduled twice."
  );
};

const DashedSlot = () => <CampaignBlock status="draft" />;

const WhenItGoes = ({
  moment,
  scheduled,
  zone,
}: {
  moment: { at: DateTime.Utc; skipped: boolean; time: string } | undefined;
  scheduled: Campaign["schedule"];
  zone: string;
}) => {
  if (moment === undefined) {
    return (
      <div className="mq-when">
        <span className="mq-when-mark">
          <DashedSlot />
        </span>
        <p className="mq-when-main" data-empty="">
          Choose a day and a time to see exactly when it goes.
        </p>
      </div>
    );
  }

  const moved =
    scheduled !== null &&
    DateTime.toEpochMillis(scheduled.at) !== DateTime.toEpochMillis(moment.at);

  return (
    <div className="mq-when">
      <span className="mq-when-mark">
        <CampaignBlock status="scheduled" />
      </span>
      <div className="min-w-0">
        <p className="mq-when-main">
          {longDayIn(moment.at, zone)} at {clockIn(moment.at, zone)}
          {inZone(zone)}
        </p>
        <p className="mq-when-line">{forYou(moment.at, zone)}</p>
        {moment.skipped ? (
          <p className="mq-when-note">
            <InfoIcon
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-kumo-subtle"
              size={16}
            />
            {`There’s no ${shownTime(moment.time)}${inZone(zone)} that night: the clocks go forward. It goes at ${clockIn(moment.at, zone)} instead.`}
          </p>
        ) : null}
        {moved ? (
          <p className="mq-when-note">
            {`It’s set for ${longDayIn(scheduled.at, scheduled.timeZone)} at ${clockIn(scheduled.at, scheduled.timeZone)}${inZone(scheduled.timeZone)} now.`}
          </p>
        ) : null}
      </div>
    </div>
  );
};

const ZoneValue = ({ zone }: { zone: Zone }) => (
  <span className="flex min-w-0 items-baseline gap-2">
    <span className="shrink-0">{zone.city}</span>
    <span className="min-w-0 truncate text-kumo-subtle">
      {zone.name}, {zone.offset}
    </span>
  </span>
);

const ZoneOption = ({ zone }: { zone: Zone }) => (
  <span className="mq-zone-option">
    <span className="flex min-w-0 items-baseline gap-2">
      <span className="shrink-0">{zone.city}</span>
      <span className="min-w-0 truncate text-sm text-kumo-subtle">
        {zone.name}
      </span>
    </span>
    <span className="shrink-0 text-sm text-kumo-subtle tabular-nums">
      {zone.offset}
    </span>
  </span>
);

const startsWithFirst = (zone: Zone, sought: string) => {
  const city = zone.city.toLowerCase();

  if (city.startsWith(sought)) {
    return 0;
  }

  return city.includes(sought) ? 1 : 2;
};

const ZoneField = ({
  day,
  onChange,
  zone,
}: {
  day: string;
  onChange: (zone: string) => void;
  zone: string;
}) => {
  const [query, setQuery] = useState("");
  const mine = viewerZone();
  const onDay = new Date(`${day}T12:00:00Z`);

  // WARNING: about 420 zones, each named through Intl; worked out again only when the day changes, since an offset depends on the day.
  const zones = useMemo(() => zonesOn(new Date(`${day}T12:00:00Z`)), [day]);

  const sought = query.trim().toLowerCase();

  const chosen =
    zones.find((candidate) => candidate.id === zone) ?? zoneOf(zone, onDay);

  const yours = zones.find((candidate) => candidate.id === mine);

  const found =
    sought === ""
      ? [
          ...(yours === undefined ? [] : [yours]),
          ...zones.filter((candidate) => candidate !== yours),
        ]
      : Arr.sort(
          zones.filter((candidate) => zoneMatches(candidate, sought)),
          Order.mapInput(Order.Number, (candidate: Zone) =>
            startsWithFirst(candidate, sought)
          )
        );

  return (
    <Combobox
      filter={null}
      inputValue={query}
      isItemEqualToValue={(item: Zone, value: Zone) => item.id === value.id}
      items={found}
      itemToStringLabel={(item: Zone) => item.city}
      label="Time zone"
      onInputValueChange={setQuery}
      onValueChange={(value: Zone | null) => {
        if (value !== null) {
          onChange(value.id);
        }
      }}
      value={chosen}
    >
      <Combobox.TriggerValue
        className={`w-full min-w-0 overflow-hidden ${TEXT_SAFARI_WONT_ZOOM_INTO}`}
      >
        <ZoneValue zone={chosen} />
      </Combobox.TriggerValue>
      <Combobox.Content align="start" className="mq-zone-list">
        <Combobox.Input
          aria-label="Search time zones"
          className={`mq-zone-search ${TEXT_SAFARI_WONT_ZOOM_INTO}`}
          placeholder="Search by city, zone or GMT offset"
        />
        <Combobox.List>
          {sought === "" && yours !== undefined ? (
            <>
              <Combobox.Group>
                <Combobox.GroupLabel>Your time zone</Combobox.GroupLabel>
                <Combobox.Item value={yours}>
                  <ZoneOption zone={yours} />
                </Combobox.Item>
              </Combobox.Group>
              <Combobox.Group>
                <Combobox.GroupLabel>All time zones</Combobox.GroupLabel>
                {found.slice(1).map((candidate) => (
                  <Combobox.Item key={candidate.id} value={candidate}>
                    <ZoneOption zone={candidate} />
                  </Combobox.Item>
                ))}
              </Combobox.Group>
            </>
          ) : (
            found.map((candidate) => (
              <Combobox.Item key={candidate.id} value={candidate}>
                <ZoneOption zone={candidate} />
              </Combobox.Item>
            ))
          )}
        </Combobox.List>
        {found.length === 0 ? (
          <Combobox.Empty>
            No time zone matches “{query.trim()}”.
          </Combobox.Empty>
        ) : null}
      </Combobox.Content>
    </Combobox>
  );
};

const DayField = ({
  day,
  error,
  onChange,
  ref,
  today,
  weekStartsOn,
}: {
  day: string | undefined;
  error: React.ReactNode;
  onChange: (day: string) => void;
  ref: React.RefObject<HTMLButtonElement | null>;
  today: Date;
  weekStartsOn: DayOfWeek;
}) => {
  const [open, setOpen] = useState(false);
  const id = useId();
  const shown = day === undefined ? "Choose a day" : shortDay(day);

  // WARNING: Kumo's Field ties its label and error only to Base UI's own controls, and the calendar's trigger is a plain button, so the label, value and error are tied to it here.
  return (
    <div className="grid gap-2">
      <label
        className="m-0 text-base font-medium text-kumo-default select-none"
        htmlFor={`${id}-button`}
        id={`${id}-label`}
      >
        Day
      </label>
      <Popover onOpenChange={setOpen} open={open}>
        <Popover.Trigger
          render={
            <button
              aria-describedby={error === undefined ? undefined : `${id}-error`}
              aria-labelledby={`${id}-label ${id}-value`}
              className={`${inputVariants({ variant: error === undefined ? "default" : "error" })} mq-picker-button flex w-full items-center ${TEXT_SAFARI_WONT_ZOOM_INTO}`}
              data-empty={day === undefined ? "" : undefined}
              id={`${id}-button`}
              ref={ref}
              type="button"
            />
          }
        >
          <span className="truncate" id={`${id}-value`}>
            {shown}
          </span>
          <CalendarIcon
            aria-hidden="true"
            className="shrink-0 text-kumo-subtle"
            size={16}
          />
        </Popover.Trigger>
        <Popover.Content align="start" className="p-3" side="bottom">
          <DatePicker
            defaultMonth={day === undefined ? today : dateOfDay(day)}
            disabled={{ before: today }}
            mode="single"
            onChange={(picked?: Date) => {
              if (picked !== undefined) {
                onChange(dayOfDate(picked));
                setOpen(false);
              }
            }}
            selected={day === undefined ? undefined : dateOfDay(day)}
            startMonth={today}
            weekStartsOn={weekStartsOn}
          />
        </Popover.Content>
      </Popover>
      {error === undefined ? null : (
        <p className="text-sm leading-snug text-kumo-danger" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
};

// WARNING: a draft that missed its time starts from the zone and time it had, so typing "9:00" means the same place as before; its day has passed, so it starts empty.
const startingFields = (campaign: Campaign) => {
  const { schedule } = campaign;

  if (schedule === null) {
    return { day: undefined, time: "", zone: viewerZone() };
  }

  return {
    day:
      campaign.status === "scheduled"
        ? dayIn(schedule.at, schedule.timeZone)
        : undefined,
    time: clockIn(schedule.at, schedule.timeZone),
    zone: schedule.timeZone,
  };
};

const momentNamed = (
  day: string | undefined,
  time: string | undefined,
  zone: string
) =>
  day === undefined || time === undefined
    ? undefined
    : Option.getOrUndefined(
        Option.map(momentOf(day, time, zone), (found) => ({ ...found, time }))
      );

type Moment = ReturnType<typeof momentNamed>;

const isPast = (moment: Moment, now: DateTime.Utc, refusedAsPast: boolean) =>
  moment !== undefined &&
  (refusedAsPast || !DateTime.isGreaterThan(moment.at, now));

const messagesOf = ({
  attempt,
  day,
  exactTime,
  moment,
  now,
  past,
  zone,
}: {
  attempt: number;
  day: string | undefined;
  exactTime: string | undefined;
  moment: Moment;
  now: DateTime.Utc;
  past: boolean;
  zone: string;
}) => {
  const submitted = attempt > 0;

  let timeMessage: string | undefined;

  if (past && day !== undefined && moment !== undefined) {
    timeMessage = pastMessage(day, moment.time, zone, moment.at, now);
  } else if (submitted && exactTime === undefined) {
    timeMessage = "Give a time on the 24-hour clock, such as 9:00 or 14:30.";
  }

  return {
    dayMessage: submitted && day === undefined ? "Choose a day." : undefined,
    timeMessage,
  };
};

const whatItSays = (
  moving: boolean,
  connectionName: string,
  count: number | undefined
) => {
  const goesTo =
    count === undefined
      ? "to whoever is subscribed to its lists then"
      : `to whoever is subscribed to its lists then: ${contacts(count)} now`;

  return moving
    ? `It still goes through ${connectionName} ${goesTo}.`
    : `It starts sending at the time you choose, through ${connectionName}, ${goesTo}. You can change the time or cancel it until it starts.`;
};

const alertOf = (message: string | undefined, attempt: number) =>
  message === undefined
    ? undefined
    : {
        match: true as const,
        // WARNING: keyed by attempt so a repeated error is a new alert, which screen readers announce again.
        message: (
          <span key={attempt} role="alert">
            {message}
          </span>
        ),
      };

/**
 * Schedules a draft to start sending at a day and time in a time zone, or
 * moves a scheduled Campaign's time. Under the fields it says the moment in
 * plain words and what that is on the viewer's clock, and when the clocks
 * skip the time chosen. A time that has passed is said on the Time field,
 * also when the API is the one to say so. A refusal that changes what the
 * page shows, such as no one being subscribed, is handed to the page through
 * `onRefused`; a failure to reach the server stays in the dialog to try
 * again.
 */
export const ScheduleCampaignDialog = ({
  campaign,
  connectionName,
  count,
  finalFocus,
  onExited,
  onOpenChange,
  onRefused,
  onScheduled,
  open,
  organization,
}: {
  campaign: Campaign;
  connectionName: string;
  /** How many it goes to now; undefined when it couldn't be counted. */
  count: number | undefined;
  finalFocus: React.RefObject<HTMLElement | null>;
  onExited: () => void;
  onOpenChange: (open: boolean) => void;
  onRefused: (refusal: SendRefusal) => void;
  onScheduled: (scheduled: Campaign) => void;
  open: boolean;
  organization: Organization;
}) => {
  const { schedule } = campaign;
  const moving = campaign.status === "scheduled" && schedule !== null;
  const [day, setDay] = useState(() => startingFields(campaign).day);
  const [time, setTime] = useState(() => startingFields(campaign).time);
  const [zone, setZone] = useState(() => startingFields(campaign).zone);
  const [now, setNow] = useState(DateTime.nowUnsafe);
  const [attempt, setAttempt] = useState(0);
  const [refusedAsPast, setRefusedAsPast] = useState(false);
  const [openedAt, setOpenedAt] = useState(open);

  // WARNING: the dialog is mounted, closed, long before it opens, and the Campaign can change in the meantime (another member moves its time), so each opening starts from the Campaign as it is then, not as it was when the page loaded.
  if (open !== openedAt) {
    setOpenedAt(open);

    if (open) {
      const fields = startingFields(campaign);

      setDay(fields.day);
      setTime(fields.time);
      setZone(fields.zone);
      setNow(() => DateTime.nowUnsafe());
    }
  }

  const dayButton = useRef<HTMLButtonElement>(null);
  const timeInput = useRef<HTMLInputElement>(null);
  const formId = useId();
  const scheduling = useScheduleCampaign(organization.id, campaign.id);

  const exactTime = typedTime(time);
  const moment = momentNamed(day, exactTime, zone);
  const past = isPast(moment, now, refusedAsPast);

  const { dayMessage, timeMessage } = messagesOf({
    attempt,
    day,
    exactTime,
    moment,
    now,
    past,
    zone,
  });

  const failure = scheduling.error;

  const problem =
    failure === null ||
    refusalOf(failure) !== undefined ||
    Predicate.isTagged(failure, "ScheduleInPast")
      ? undefined
      : problemOf(failure, moving);

  const submit = () => {
    const current = DateTime.nowUnsafe();

    setNow(current);
    setAttempt((attempts) => attempts + 1);

    if (day === undefined) {
      dayButton.current?.focus();

      return;
    }

    if (
      exactTime === undefined ||
      moment === undefined ||
      isPast(moment, current, refusedAsPast)
    ) {
      timeInput.current?.focus();

      return;
    }

    if (scheduling.isPending) {
      return;
    }

    scheduling.mutate(
      { localDateTime: `${day}T${exactTime}`, timeZone: zone },
      {
        onError: (error) => {
          if (Predicate.isTagged(error, "ScheduleInPast")) {
            setRefusedAsPast(true);
            timeInput.current?.focus();

            return;
          }

          const refusal = refusalOf(error);

          if (refusal !== undefined) {
            onRefused(refusal);
          }
        },
        onSuccess: onScheduled,
      }
    );
  };

  return (
    <ActionDialog
      actionLabel={moving ? "Change time" : "Schedule"}
      busy={scheduling.isPending}
      description={whatItSays(moving, connectionName, count)}
      finalFocus={finalFocus}
      formId={formId}
      onExited={onExited}
      onOpenChange={onOpenChange}
      open={open}
      title={moving ? "Change when it sends" : "Schedule this campaign"}
    >
      <form
        className="flex flex-col gap-4"
        id={formId}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {problem === undefined ? null : (
          <Banner role="alert" title={problem} variant="error" />
        )}
        <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] items-start gap-3">
          <DayField
            day={day}
            error={alertOf(dayMessage, attempt)?.message}
            onChange={(picked) => {
              setDay(picked);
              setRefusedAsPast(false);
            }}
            ref={dayButton}
            today={dateOfDay(dayIn(now, zone))}
            weekStartsOn={firstDayOfWeek()}
          />
          <Input
            aria-invalid={timeMessage === undefined ? undefined : true}
            autoComplete="off"
            className={`w-full ${TEXT_SAFARI_WONT_ZOOM_INTO}`}
            error={alertOf(timeMessage, attempt)}
            inputMode="numeric"
            label="Time (24-hour)"
            onChange={(event) => {
              setTime(event.target.value);
              setRefusedAsPast(false);
            }}
            placeholder="9:00"
            ref={timeInput}
            value={time}
          />
        </div>
        <ZoneField
          day={day ?? dayIn(now, viewerZone())}
          onChange={(picked) => {
            setZone(picked);
            setRefusedAsPast(false);
          }}
          zone={zone}
        />
        <div aria-live="polite">
          <WhenItGoes
            moment={moment}
            scheduled={moving ? schedule : null}
            zone={zone}
          />
        </div>
      </form>
    </ActionDialog>
  );
};
