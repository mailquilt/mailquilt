import { Checkbox } from "@cloudflare/kumo";
import { useId } from "react";

import { Breakable } from "../layout/breakable.tsx";

const Domain = ({ domain }: { domain: string }) => (
  <span className="font-mono text-xs">
    <Breakable value={domain} />
  </span>
);

const tradeOffs = (domain: string) => [
  {
    body: (
      <>
        The return address moves to <Domain domain={domain} />, so SPF is
        checked there, not at your domain. Your emails then pass DMARC only
        through DKIM, so your server must sign them for your domain.
      </>
    ),
    title: "Your domain no longer passes SPF for these emails.",
  },
  {
    body: "Many sending services put their own bounce address on every email. Their bounces then go to them, and this changes nothing.",
    title: "Some providers replace the bounce address.",
  },
  {
    body: "A server that lets you send only as the mailbox you sign in with may refuse these emails. Test emails go without a bounce address, so watch your next Campaign: if its emails fail, turn this off.",
    title: "Some servers refuse it.",
  },
];

/**
 * Whether an SMTP server's Campaign emails go from a bounce address at the
 * install's bounce domain (ADR 0021), and, once ticked, what that changes.
 * The checkbox is described by both, so a screen reader reads them with it.
 */
export const BounceAddressChoice = ({
  checked,
  domain,
  onCheckedChange,
}: {
  checked: boolean;
  domain: string;
  onCheckedChange: (checked: boolean) => void;
}) => {
  const descriptionId = useId();
  const tradeOffsId = useId();

  // WARNING: Kumo's Checkbox type leaves out `aria-describedby`, but Kumo passes it through to the checkbox.
  const describedBy = {
    "aria-describedby": checked
      ? `${descriptionId} ${tradeOffsId}`
      : descriptionId,
  };

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Checkbox
          {...describedBy}
          checked={checked}
          label="Send bounces to Mailquilt"
          onCheckedChange={onCheckedChange}
        />
        <p
          className="pl-6 text-sm leading-5 text-pretty text-kumo-subtle"
          id={descriptionId}
        >
          Each Campaign email goes out with its own return address at{" "}
          <Domain domain={domain} />. Your From address stays the same. Bounces
          come back here, and addresses that bounce stop getting Campaigns.
        </p>
      </div>
      {checked ? (
        <div
          className="rounded-xl bg-kumo-recessed px-4 py-3.5 ring ring-kumo-hairline"
          id={tradeOffsId}
        >
          <ul className="flex flex-col gap-2.5">
            {tradeOffs(domain).map((item) => (
              <li className="flex gap-3" key={item.title}>
                <span className="flex h-lh shrink-0 items-center text-sm leading-5">
                  <span
                    aria-hidden="true"
                    className="size-2 rounded-xs bg-(--mq-block-ink)"
                  />
                </span>
                <span className="text-sm leading-5 text-pretty text-(--mq-body)">
                  <span className="font-medium text-kumo-strong">
                    {item.title}
                  </span>{" "}
                  {item.body}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
};
