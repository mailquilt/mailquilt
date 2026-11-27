import type { Campaign } from "@repo/domain";

import { formatCount } from "../audience/format.ts";
import { CampaignBlock } from "./campaign-status.tsx";

/** How many of a Campaign's recipients haven't been sent it or tried: still to send, or never sent once it's cancelled. */
export const stillToSend = ({ recipients }: Campaign) =>
  recipients.total - recipients.sent - recipients.failed;

const shareOf = (part: number, total: number) => `${(part / total) * 100}%`;

const Failed = () => (
  <span
    aria-hidden="true"
    className="block size-3 shrink-0 rounded-quilt bg-kumo-danger"
  />
);

const Count = ({
  children,
  count,
  mark,
}: {
  children: React.ReactNode;
  count: number;
  mark: React.ReactNode;
}) => (
  <li className="inline-flex items-center gap-2 tabular-nums">
    {mark}
    <span>
      <strong className="font-medium text-kumo-strong">
        {formatCount(count)}
      </strong>{" "}
      {children}
    </span>
  </li>
);

/**
 * How far a Campaign that started sending has got, under its page's header:
 * a meter in its status blocks' language, ink for sent, the danger colour
 * for couldn't be sent and the dashed slot for the rest, and those three
 * counts under it. It stays through paused, cancelled and sent, so how far
 * it got is always in the same place.
 */
export const CampaignProgress = ({ campaign }: { campaign: Campaign }) => {
  const { failed, sent, total } = campaign.recipients;
  const left = stillToSend(campaign);

  // SAFETY: a CSS custom property, which React passes through to the style attribute but CSSProperties doesn't list.
  const sentShare = {
    "--mq-share": shareOf(sent, total),
  } as React.CSSProperties;

  // SAFETY: as above.
  const failedShare = {
    "--mq-share": shareOf(failed, total),
  } as React.CSSProperties;

  return (
    <div className="-mt-1 mb-9 flex flex-col gap-2.5 max-sm:mb-7">
      <progress
        aria-label="Sent"
        aria-valuetext={`${formatCount(sent)} of ${formatCount(total)} sent`}
        className="sr-only"
        max={total}
        value={sent}
      />
      <div aria-hidden="true" className="mq-meter">
        {sent > 0 ? (
          <span className="mq-meter-sent w-(--mq-share)" style={sentShare} />
        ) : null}
        {failed > 0 ? (
          <span
            className="mq-meter-failed w-(--mq-share)"
            style={failedShare}
          />
        ) : null}
      </div>
      <ul className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-kumo-default">
        <Count count={sent} mark={<CampaignBlock status="sent" />}>
          sent
        </Count>
        {failed > 0 ? (
          <Count count={failed} mark={<Failed />}>
            couldn’t be sent
          </Count>
        ) : null}
        {left > 0 ? (
          <Count count={left} mark={<CampaignBlock status="draft" />}>
            {campaign.status === "cancelled" ? "not sent" : "still to send"}
          </Count>
        ) : null}
      </ul>
    </div>
  );
};
