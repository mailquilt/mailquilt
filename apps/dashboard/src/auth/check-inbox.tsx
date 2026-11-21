import { Button, Link, LinkButton } from "@cloudflare/kumo";
import { VERIFICATION_EMAIL_SUBJECT } from "@repo/domain";
import { useEffect, useState } from "react";

import { AuthHeading } from "../layout/auth-layout.tsx";
import { SendLinkForm } from "./send-link-form.tsx";
import {
  LINK_NOT_SENT_MESSAGE,
  LINK_SENT_MESSAGE,
  SEND_LINK_LABEL,
  useSendVerificationLink,
} from "./send-verification-link.ts";

/** Better Auth allows 3 verification emails a minute per IP; one a minute keeps well inside it. */
export const RESEND_COOLDOWN_SECONDS = 60;

const GMAIL_SEARCH = encodeURIComponent(
  `subject:"${VERIFICATION_EMAIL_SUBJECT}" in:anywhere`
);

const INBOX_BUTTONS_FOR_COMMON_PROVIDERS = [
  {
    domains: ["gmail.com", "googlemail.com"],
    name: "Gmail",
    url: (email: string) =>
      `https://mail.google.com/mail/u/${encodeURIComponent(email)}/#search/${GMAIL_SEARCH}`,
  },
  {
    domains: ["outlook.com", "hotmail.com", "live.com", "msn.com"],
    name: "Outlook",
    url: () => "https://outlook.live.com/mail/0/",
  },
  {
    domains: ["yahoo.com", "ymail.com"],
    name: "Yahoo Mail",
    url: () => "https://mail.yahoo.com/",
  },
  {
    domains: ["icloud.com", "me.com", "mac.com"],
    name: "iCloud Mail",
    url: () => "https://www.icloud.com/mail/",
  },
] as const;

const inboxFor = (email: string) => {
  const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();

  return INBOX_BUTTONS_FOR_COMMON_PROVIDERS.find((inbox) =>
    inbox.domains.some((known) => known === domain)
  );
};

const useCountdown = (seconds: number) => {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (remaining <= 0) {
      return;
    }

    const timer = setTimeout(() => setRemaining(remaining - 1), 1000);

    return () => clearTimeout(timer);
  }, [remaining]);

  return { remaining, restart: () => setRemaining(seconds) };
};

const ResendLink = ({ email }: { email: string }) => {
  const countdown = useCountdown(RESEND_COOLDOWN_SECONDS);
  const send = useSendVerificationLink();
  const waiting = countdown.remaining > 0;

  let status = "";

  if (send.isError) {
    status = LINK_NOT_SENT_MESSAGE;
  } else if (send.isSuccess) {
    status = LINK_SENT_MESSAGE(email);
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        className="w-full justify-center"
        disabled={waiting}
        loading={send.isPending}
        onClick={() => send.mutate(email, { onSettled: countdown.restart })}
        size="lg"
        variant="secondary"
      >
        {waiting
          ? `${SEND_LINK_LABEL} in ${countdown.remaining}s`
          : SEND_LINK_LABEL}
      </Button>
      <output className="block min-h-5 text-base wrap-anywhere text-kumo-subtle">
        {send.isPending ? "" : status}
      </output>
    </div>
  );
};

const Sent = ({ email }: { email: string }) => {
  const inbox = inboxFor(email);

  return (
    <div className="flex flex-col gap-3">
      {inbox ? (
        <LinkButton
          className="w-full justify-center"
          href={inbox.url(email)}
          rel="noopener noreferrer"
          size="lg"
          target="_blank"
          variant="primary"
        >
          Open {inbox.name}
        </LinkButton>
      ) : null}
      <ResendLink email={email} />
    </div>
  );
};

/**
 * After sign-up: where the link went, how long it works, a way into the
 * inbox, a way to get another one, and a way back if the address was wrong.
 * Opened without an address (a new tab, a bookmark), it asks for one.
 */
export const CheckInbox = ({
  email,
  onSent,
}: {
  email: string | undefined;
  onSent: (email: string) => void;
}) => (
  <>
    <AuthHeading
      description={
        email ? (
          <>
            We sent a link to{" "}
            <strong className="font-semibold wrap-anywhere text-kumo-strong">
              {email}
            </strong>
            . Open it to finish creating your account. The link works for one
            hour.
          </>
        ) : (
          "Open the link we sent to finish creating your account. Didn’t get it? Enter your email for a new one."
        )
      }
    >
      Check your inbox
    </AuthHeading>
    {email ? <Sent email={email} /> : <SendLinkForm onSent={onSent} />}
    <p className="mt-8 border-t border-dashed border-(--mq-seam) pt-5 text-base text-kumo-subtle">
      Not there after a minute? Check your spam and promotions folders, or{" "}
      <Link className="font-medium" href="/sign-up">
        use a different address
      </Link>
      .
    </p>
  </>
);
