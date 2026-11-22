import { Button, LinkButton } from "@cloudflare/kumo";
import { CheckIcon } from "@phosphor-icons/react";
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

import { QuiltSlot } from "../brand/quilt-block.tsx";
import { FormField } from "../forms/form-field.tsx";
import { submitForm } from "../forms/submit-form.ts";
import { useSendTestEmail } from "./providers-api.ts";

const TestEmail = Schema.Struct({ to: MailAddress });

const SECONDS_PER_MINUTE = 60;

const focusOnMount = (element: HTMLElement | null) => element?.focus();

const scrollIntoViewOnMount = (element: HTMLElement | null) =>
  element?.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
    block: "nearest",
  });

interface Failure {
  readonly title: string;
  readonly fix?: string;
  readonly detail?: string;
  readonly canEdit: boolean;
}

const sendFailure = (
  connection: ProviderConnection,
  reason: SendFailureReason,
  detail: string
) => {
  const server = `${connection.smtp.host}:${connection.smtp.port}`;

  const byReason: Record<SendFailureReason, Omit<Failure, "detail">> = {
    auth: {
      canEdit: true,
      fix: "Copy them again from your provider’s SMTP settings, then edit this connection.",
      title: "The server refused the username or password",
    },
    blocked: {
      canEdit: true,
      fix: "Mailquilt doesn’t connect to internal addresses, such as a cloud server’s own metadata service. Use your provider’s public host name.",
      title: `${connection.smtp.host} resolves to an address Mailquilt won’t connect to`,
    },
    failed: { canEdit: true, title: "The server didn’t accept the email" },
    "host-not-found": {
      canEdit: true,
      fix: "Check the host name for typos.",
      title: `${connection.smtp.host} doesn’t exist`,
    },
    rejected: {
      canEdit: true,
      fix: "Often the sender address isn’t one your provider lets you send from. Check it’s verified there.",
      title: "The server refused the email",
    },
    tls: {
      canEdit: true,
      fix: "Check the encryption matches the port: STARTTLS is usually on 587, TLS on 465.",
      title: "The connection couldn’t be encrypted",
    },
    unavailable: {
      canEdit: false,
      title: "This install can’t send through SMTP yet",
    },
    unreachable: {
      canEdit: true,
      fix: "Check the host and port, and that the server accepts connections from this Mailquilt server.",
      title: `Mailquilt couldn’t reach ${server}`,
    },
  };

  return { ...byReason[reason], detail } satisfies Failure;
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

const Sent = ({
  connection,
  sent,
  to,
}: {
  connection: ProviderConnection;
  sent: TestEmailSent;
  to: string;
}) => (
  <output className="flex gap-4" ref={scrollIntoViewOnMount}>
    <span
      aria-hidden="true"
      className="flex size-10 shrink-0 items-center justify-center rounded-quilt bg-(--mq-block-ink) text-kumo-inverse"
    >
      <CheckIcon className="size-5" weight="bold" />
    </span>
    <div className="flex min-w-0 flex-col gap-1">
      <h3 className="text-base font-semibold text-kumo-strong">
        Sent. {connection.name} accepted the email.
      </h3>
      <p className="text-base text-(--mq-body)">
        Look for “{TEST_EMAIL_SUBJECT}” at {to}. It can take a minute, and may
        land in spam.
      </p>
      <p className="mt-1 text-sm break-all text-kumo-subtle">
        Message ID for your provider’s logs: {sent.messageId}
      </p>
    </div>
  </output>
);

const NotSent = ({
  connection,
  failure,
}: {
  connection: ProviderConnection;
  failure: Failure;
}) => (
  <div className="flex gap-4" ref={scrollIntoViewOnMount} role="alert">
    <QuiltSlot className="size-10 shrink-0" />
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <h3 className="text-base font-semibold text-kumo-strong">
        {failure.title}
      </h3>
      {failure.fix === undefined ? null : (
        <p className="text-base text-(--mq-body)">{failure.fix}</p>
      )}
      {failure.detail === undefined ? null : (
        <>
          <p className="mt-2 text-sm text-kumo-subtle">What the server said</p>
          <p className="rounded-lg bg-kumo-recessed px-3 py-2 font-mono text-sm break-words text-kumo-strong">
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

/**
 * Sends a test email through one connection, to the signed-in person's
 * address unless they change it, and says what happened: the Provider
 * accepted it, or why not in the server's own words, with what to fix.
 * `intro` leads the panel when it opens by itself, such as right after the
 * connection was made, and takes focus so the next step is read out.
 */
export const TestEmailPanel = ({
  connection,
  defaultTo,
  intro,
  organization,
}: {
  connection: ProviderConnection;
  defaultTo: string;
  intro?: string;
  organization: Organization;
}) => {
  const send = useSendTestEmail(organization.id, connection.id);

  const form = useForm({
    defaultValues: { to: defaultTo },
    onSubmit: ({ value }) => {
      if (!send.isPending) {
        send.mutate(Schema.decodeSync(TestEmail)(value).to);
      }
    },
    validators: { onSubmit: Schema.toStandardSchemaV1(TestEmail) },
  });

  return (
    <div className="mt-5 flex flex-col gap-5 border-t border-kumo-hairline pt-5">
      {intro === undefined ? null : (
        <p
          className="border-l-3 border-(--mq-accent) py-1 pl-3 text-base text-kumo-strong outline-none"
          ref={focusOnMount}
          tabIndex={-1}
        >
          {intro}
        </p>
      )}
      <form
        className="flex items-end gap-2 max-sm:flex-col max-sm:items-stretch"
        noValidate
        onSubmit={(event) => submitForm(event, form)}
      >
        <div className="min-w-0 flex-1">
          <form.Field name="to">
            {(field) => (
              <FormField
                autoComplete="email"
                className="w-full max-sm:h-11 pointer-coarse:h-11"
                field={field}
                inputMode="email"
                label="Send a test email to"
                size="base"
                type="email"
              />
            )}
          </form.Field>
        </div>
        <Button
          className="max-sm:h-11 max-sm:w-full max-sm:justify-center"
          aria-busy={send.isPending}
          type="submit"
          variant="primary"
        >
          {send.isPending ? "Sending…" : "Send test email"}
        </Button>
      </form>
      {send.isSuccess ? (
        <Sent connection={connection} sent={send.data} to={send.variables} />
      ) : null}
      {send.isError ? (
        <NotSent
          connection={connection}
          failure={failureOf(connection, send.error)}
        />
      ) : null}
    </div>
  );
};
