import type { SubscriptionStatus } from "@repo/domain";

/** What each Subscription status is called, wherever it appears. */
export const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  pending: "Pending",
  subscribed: "Subscribed",
  unsubscribed: "Unsubscribed",
};

const FILLED: Record<Exclude<SubscriptionStatus, "pending">, string> = {
  subscribed: "bg-(--mq-block-ink)",
  unsubscribed: "bg-(--mq-patch-pale)",
};

/**
 * A Subscription's status as one of the logo's blocks: ink when subscribed,
 * the dashed slot of a piece not there yet when pending, pale when
 * unsubscribed. Decorative: the status is always written beside it. The
 * slot is an SVG dash, because at 12px a CSS dashed border draws as a solid
 * outline and reads as an empty checkbox.
 */
export const StatusBlock = ({ status }: { status: SubscriptionStatus }) =>
  status === "pending" ? (
    <svg
      aria-hidden="true"
      className="size-3 shrink-0"
      focusable="false"
      viewBox="0 0 12 12"
    >
      <rect
        className="stroke-(--mq-logo-slot)"
        fill="none"
        height="10.5"
        rx="1.5"
        strokeDasharray="2.25 1.5"
        strokeWidth="1.5"
        width="10.5"
        x="0.75"
        y="0.75"
      />
    </svg>
  ) : (
    <span
      aria-hidden="true"
      className={`inline-block size-3 shrink-0 rounded-quilt ${FILLED[status]}`}
    />
  );

/** A Subscription's status, as a block and its name. */
export const SubscriptionStatusLabel = ({
  status,
}: {
  status: SubscriptionStatus;
}) => (
  <span
    className={`inline-flex items-center gap-2 text-sm ${status === "subscribed" ? "text-kumo-strong" : "text-kumo-subtle"}`}
  >
    <StatusBlock status={status} />
    {STATUS_LABELS[status]}
  </span>
);

/**
 * A List a Contact is on, marked with their status on it. An unsubscribed
 * one has no fill, since they no longer get its Campaigns. Visual only: the
 * table says the same in words for screen readers.
 */
export const ListChip = ({
  name,
  status,
}: {
  name: string;
  status: SubscriptionStatus;
}) => (
  <span
    className={`inline-flex h-6 max-w-48 min-w-0 items-center gap-1.5 rounded-md px-2 text-sm ring ring-kumo-fill ring-inset ${status === "unsubscribed" ? "text-kumo-subtle" : "bg-kumo-elevated text-kumo-default"}`}
  >
    <StatusBlock status={status} />
    <span className="truncate">{name}</span>
  </span>
);
