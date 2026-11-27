import { ClipboardText, Collapsible, LinkButton } from "@cloudflare/kumo";
import {
  MailAddress,
  ProviderConnectionNotFound,
  RateLimited,
  SendFailed,
  TEST_EMAIL_LIMIT,
  TEST_EMAIL_SUBJECT,
} from "@repo/domain";
import type {
  Organization,
  ProviderConnection,
  SendFailureReason,
  TestEmailSent,
} from "@repo/domain";
import { useForm } from "@tanstack/react-form";
import { Schema } from "effect";
import { useId, useRef, useState } from "react";

import { QuiltSlot } from "../brand/quilt-block.tsx";
import { FormField } from "../forms/form-field.tsx";
import { submitForm } from "../forms/submit-form.ts";
import { ActionDialog } from "../layout/action-dialog.tsx";
import { useSendTestEmail } from "./providers-api.ts";

const TestEmail = Schema.Struct({ to: MailAddress });

const SECONDS_PER_MINUTE = 60;

const revealOnMount = (element: HTMLElement | null) => {
  element?.focus({ preventScroll: true });
  element?.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
    block: "nearest",
  });
};

interface Failure {
  readonly title: string;
  readonly fix?: string;
  readonly detail?: string;
  readonly detailLabel?: string;
  readonly canEdit: boolean;
}

const SERVER_SAID = "What the server said";

const sendFailure = (
  connection: ProviderConnection,
  reason: SendFailureReason,
  detail: string
) => {
  const host =
    connection.provider === "ses"
      ? `email.${connection.ses.region}.amazonaws.com`
      : connection.smtp.host;

  const server =
    connection.provider === "ses"
      ? `Amazon SES in ${connection.ses.region}`
      : `${connection.smtp.host}:${connection.smtp.port}`;

  const byReason: Record<SendFailureReason, Omit<Failure, "detail">> = {
    auth: {
      canEdit: true,
      detailLabel: SERVER_SAID,
      fix: "Copy them again from your provider’s SMTP settings, then edit this connection.",
      title: "The server refused the username or password",
    },
    blocked: {
      canEdit: true,
      fix: "Mailquilt doesn’t connect to internal addresses, such as a cloud server’s own metadata service. Use your provider’s public host name.",
      title: `${host} resolves to an address Mailquilt won’t connect to`,
    },
    failed: {
      canEdit: true,
      detailLabel: SERVER_SAID,
      title: "The server didn’t accept the email",
    },
    "host-not-found": {
      canEdit: true,
      fix: "Check the host name for typos.",
      title: `${host} doesn’t exist`,
    },
    rejected: {
      canEdit: true,
      detailLabel: SERVER_SAID,
      fix: "Often the sender address isn’t one your provider lets you send from. Check it’s verified there.",
      title: "The server refused the email",
    },
    tls: {
      canEdit: true,
      detailLabel: "What went wrong",
      fix: "Check the encryption matches the port: STARTTLS is usually on 587, TLS on 465.",
      title: "The connection couldn’t be encrypted",
    },
    unavailable: {
      canEdit: false,
      title: "This install can’t send through SMTP yet",
    },
    unreachable: {
      canEdit: true,
      detailLabel: "What went wrong",
      fix: "Check the host and port, and that the server accepts connections from this Mailquilt server.",
      title: `Mailquilt couldn’t reach ${server}`,
    },
  };

  if (connection.provider === "smtp") {
    return { ...byReason[reason], detail } satisfies Failure;
  }

  const sesFailure =
    reason === "auth"
      ? {
          ...byReason.auth,
          fix: "Check the access key ID and secret access key in AWS IAM, that the key may send email through SES, and that sending isn’t paused in the SES console.",
          title: "SES refused to send for this account",
        }
      : byReason[reason];

  return { ...sesFailure, canEdit: false, detail } satisfies Failure;
};

const failureOf = (connection: ProviderConnection, error: Error) => {
  if (error instanceof SendFailed) {
    return sendFailure(connection, error.reason, error.detail);
  }

  if (error instanceof RateLimited) {
    const minutes = Math.max(
      1,
      Math.ceil(error.retryAfterSeconds / SECONDS_PER_MINUTE)
    );

    return {
      canEdit: false,
      fix: `Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
      title: `You’ve sent ${TEST_EMAIL_LIMIT.max} test emails in the last ${TEST_EMAIL_LIMIT.minutes} minutes`,
    } satisfies Failure;
  }

  if (error instanceof ProviderConnectionNotFound) {
    return {
      canEdit: false,
      fix: "Someone deleted it. Reload the page to see your connections.",
      title: "This connection no longer exists",
    } satisfies Failure;
  }

  return {
    canEdit: false,
    fix: "Check your connection, then try again.",
    title: "Mailquilt couldn’t reach the server",
  } satisfies Failure;
};

const RESULT =
  "mq-fade-in flex gap-3 rounded-lg bg-kumo-elevated px-3.5 py-3 ring ring-kumo-hairline outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kumo-focus";

const Sent = ({
  connection,
  sent,
  to,
}: {
  connection: ProviderConnection;
  sent: TestEmailSent;
  to: string;
}) => (
  <div className={RESULT} ref={revealOnMount} tabIndex={-1}>
    <span aria-hidden="true" className="mq-done-block" />
    <div className="min-w-0 flex-1">
      <output className="flex flex-col gap-0.5 text-base">
        <strong className="font-medium text-kumo-strong">
          {connection.name} accepted the email
        </strong>
        <span className="text-pretty text-kumo-subtle">
          It should reach {to} within a minute, titled “{TEST_EMAIL_SUBJECT}”.
          If it doesn’t, check the spam folder.
        </span>
      </output>
      <Collapsible className="mt-1">
        <Collapsible.DefaultTrigger>Message ID</Collapsible.DefaultTrigger>
        <Collapsible.DefaultPanel>
          <div className="w-0 min-w-full">
            <ClipboardText
              className="w-full"
              labels={{ copyAction: "Copy message ID" }}
              text={sent.messageId}
            />
          </div>
        </Collapsible.DefaultPanel>
      </Collapsible>
    </div>
  </div>
);

const NotSent = ({
  connection,
  failure,
}: {
  connection: ProviderConnection;
  failure: Failure;
}) => (
  <div className={RESULT} ref={revealOnMount} role="alert" tabIndex={-1}>
    <QuiltSlot className="mt-0.5 size-4.5 shrink-0" />
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <h3 className="text-base font-semibold text-kumo-strong">
        {failure.title}
      </h3>
      {failure.fix === undefined ? null : (
        <p className="text-base text-(--mq-body)">{failure.fix}</p>
      )}
      {failure.detail === undefined ||
      failure.detailLabel === undefined ? null : (
        <>
          <p className="mt-2 text-sm text-kumo-subtle">{failure.detailLabel}</p>
          <p className="rounded-lg bg-kumo-recessed px-3 py-2 font-mono text-sm wrap-anywhere text-kumo-strong">
            {failure.detail}
          </p>
        </>
      )}
      {failure.canEdit ? (
        <LinkButton
          className="mt-3 w-fit max-sm:w-full max-sm:justify-center"
          href={`/providers/${connection.id}/edit`}
          variant="secondary"
        >
          Edit connection
        </LinkButton>
      ) : null}
    </div>
  </div>
);

type Outcome =
  | {
      readonly attempt: number;
      readonly kind: "sent";
      readonly sent: TestEmailSent;
      readonly to: string;
    }
  | {
      readonly attempt: number;
      readonly kind: "failed";
      readonly error: Error;
    };

/**
 * Sends a test email through one connection, to the signed-in person's
 * address unless they change it, and says what happened: the Provider
 * accepted it, or why not in the server's own words, with what to fix.
 * `intro` replaces the description when it opens by itself, right after the
 * connection was made or saved. While it sends again, the last result stays,
 * dimmed, so nothing jumps. Give it `useDialog`'s `key` and `handleExited`, so
 * each opening starts without the last result.
 */
export const TestEmailDialog = ({
  connection,
  defaultTo,
  finalFocus,
  intro,
  onExited,
  onOpenChange,
  open,
  organization,
}: {
  connection: ProviderConnection;
  defaultTo: string;
  finalFocus?: React.RefObject<HTMLElement | null>;
  intro?: string;
  /** `useDialog`'s `handleExited`, so it starts fresh after each close. */
  onExited?: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  organization: Organization;
}) => {
  const send = useSendTestEmail(organization.id, connection.id);
  const formId = useId();
  const sendTo = useRef<HTMLInputElement>(null);
  const [outcome, setOutcome] = useState<Outcome>();
  const done = outcome !== undefined;

  const form = useForm({
    defaultValues: { to: defaultTo },
    onSubmit: ({ value }) => {
      if (send.isPending) {
        return;
      }

      const { to } = Schema.decodeSync(TestEmail)(value);
      const attempt = (outcome?.attempt ?? 0) + 1;

      send.mutate(to, {
        onError: (error) => setOutcome({ attempt, error, kind: "failed" }),
        onSuccess: (sent) => setOutcome({ attempt, kind: "sent", sent, to }),
      });
    },
    validators: { onSubmit: Schema.toStandardSchemaV1(TestEmail) },
  });

  return (
    <ActionDialog
      actionLabel={done ? "Send again" : "Send"}
      busy={send.isPending}
      description={
        intro ??
        `One email through ${connection.name}, from ${connection.from.email}, so you can check it arrives.`
      }
      dismissLabel={done ? "Close" : "Cancel"}
      finalFocus={finalFocus}
      formId={formId}
      initialFocus={sendTo}
      onExited={onExited}
      onOpenChange={onOpenChange}
      open={open}
      title="Send a test email"
    >
      <div className="flex flex-col gap-4">
        <form
          id={formId}
          noValidate
          onSubmit={(event) => submitForm(event, form)}
        >
          <form.Field name="to">
            {(field) => (
              <FormField
                autoComplete="email"
                className="w-full max-sm:h-11 pointer-coarse:h-11"
                field={field}
                inputMode="email"
                label="Send to"
                ref={sendTo}
                size="base"
                type="email"
              />
            )}
          </form.Field>
        </form>
        <div
          className={`min-w-0 transition-opacity empty:hidden motion-reduce:transition-none ${send.isPending ? "opacity-50" : ""}`}
        >
          {outcome?.kind === "sent" ? (
            <Sent
              connection={connection}
              key={outcome.attempt}
              sent={outcome.sent}
              to={outcome.to}
            />
          ) : null}
          {outcome?.kind === "failed" ? (
            <NotSent
              connection={connection}
              failure={failureOf(connection, outcome.error)}
              key={outcome.attempt}
            />
          ) : null}
        </div>
      </div>
    </ActionDialog>
  );
};
