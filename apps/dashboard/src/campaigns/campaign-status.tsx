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

const Slot = () => (
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
);

const Placed = () => (
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
    <rect
      className="fill-(--mq-block-ink)"
      height="5"
      rx="1"
      width="5"
      x="3.5"
      y="3.5"
    />
  </svg>
);

const BLOCK = "block size-3 rounded-quilt";

const GOING_OUT = new Set<CampaignStatus>(["sending", "paused"]);

const LAYER =
  "absolute inset-0 transition-opacity duration-200 ease-out motion-reduce:transition-none";

/**
 * A Campaign's status in the logo's language: the dashed slot is a draft,
 * not sent yet; an ink block set in the slot is scheduled, waiting in place;
 * the orange envelope block is going out, the quilt's orange
 * column, and held still while paused; the ink block is sent, or cancelled,
 * as a done step. Decorative: the status is
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

    return (
      <span
        aria-hidden="true"
        className={`${BLOCK} shrink-0 ${GOING_OUT.has(status) ? "bg-(--mq-accent)" : "bg-(--mq-block-ink)"}`}
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
        <span className={`${BLOCK} bg-(--mq-accent)`} />
      </span>
      <span className={`${LAYER} ${shown("sent")}`}>
        <span className={`${BLOCK} bg-(--mq-block-ink)`} />
      </span>
      <span className={`${LAYER} ${shown("cancelled")}`}>
        <span className={`${BLOCK} bg-(--mq-block-ink)`} />
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
