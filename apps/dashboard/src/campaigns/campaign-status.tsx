import type { CampaignStatus } from "@repo/domain";

/** What each Campaign status is called, wherever it appears. */
export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sending: "Sending",
  paused: "Paused",
  sent: "Sent",
  cancelled: "Cancelled",
};

const InSlot = ({ children }: { children?: React.ReactNode }) => (
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
    {children}
  </svg>
);

/** The logo's dashed slot at 12px, drawn as an SVG dash, since a CSS dashed border draws solid at that size: a piece still missing. */
export const Slot = () => <InSlot />;

const Placed = () => (
  <InSlot>
    <rect
      className="fill-(--mq-block-ink)"
      height="5"
      rx="1"
      width="5"
      x="3.5"
      y="3.5"
    />
  </InSlot>
);

const SetDown = () => (
  <InSlot>
    <rect
      className="fill-(--mq-accent)"
      height="5"
      rx="1"
      width="5"
      x="3.5"
      y="3.5"
    />
  </InSlot>
);

const HalfSet = () => (
  <InSlot>
    <path
      className="fill-(--mq-block-ink)"
      d="M1.5 0h4.5v12H1.5A1.5 1.5 0 0 1 0 10.5v-9A1.5 1.5 0 0 1 1.5 0Z"
    />
  </InSlot>
);

const BLOCK = "block size-3 rounded-quilt";

const LAYER =
  "absolute inset-0 transition-opacity duration-200 ease-out motion-reduce:transition-none";

/**
 * A Campaign's status in the logo's language: the dashed slot is a draft,
 * not sent yet; an ink block set in the slot is scheduled, waiting in place;
 * the orange envelope block is going out, the quilt's orange
 * column, and paused it is set back in its slot to wait; the ink block is
 * sent, as a done step, and a cancelled Campaign's slot is half set in ink:
 * part sent, then stopped. Decorative: the status is
 * always written beside it. With `live`, they are stacked and crossfade
 * as the status moves on, and the orange block pulses gently while it sends
 * (opacity only, and not with reduced motion), for the one Campaign whose
 * page is open.
 */
export const CampaignBlock = ({
  live = false,
  status,
}: {
  live?: boolean;
  status: CampaignStatus;
}) => {
  if (!live) {
    if (status === "draft") {
      return <Slot />;
    }

    if (status === "scheduled") {
      return <Placed />;
    }

    if (status === "paused") {
      return <SetDown />;
    }

    if (status === "cancelled") {
      return <HalfSet />;
    }

    return (
      <span
        aria-hidden="true"
        className={`${BLOCK} shrink-0 ${status === "sending" ? "bg-(--mq-accent)" : "bg-(--mq-block-ink)"}`}
      />
    );
  }

  const shown = (layer: CampaignStatus) =>
    layer === status ? "opacity-100" : "opacity-0";

  return (
    <span aria-hidden="true" className="relative block size-3 shrink-0">
      <span className={`${LAYER} ${shown("draft")}`}>
        <Slot />
      </span>
      <span className={`${LAYER} ${shown("scheduled")}`}>
        <Placed />
      </span>
      <span className={`${LAYER} ${shown("sending")}`}>
        <span className={`${BLOCK} mq-pulse bg-(--mq-accent)`} />
      </span>
      <span className={`${LAYER} ${shown("paused")}`}>
        <SetDown />
      </span>
      <span className={`${LAYER} ${shown("sent")}`}>
        <span className={`${BLOCK} bg-(--mq-block-ink)`} />
      </span>
      <span className={`${LAYER} ${shown("cancelled")}`}>
        <HalfSet />
      </span>
    </span>
  );
};

/** A Campaign's status, as its block and its name. */
export const CampaignStatusLabel = ({ status }: { status: CampaignStatus }) => (
  <span
    className={`inline-flex items-center gap-2 text-sm ${status === "draft" ? "text-kumo-subtle" : "text-kumo-strong"}`}
  >
    <CampaignBlock status={status} />
    {CAMPAIGN_STATUS_LABELS[status]}
  </span>
);
