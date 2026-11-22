import {
  Banner,
  Button,
  Link,
  Radio,
  useKumoToastManager,
} from "@cloudflare/kumo";
import { CheckIcon } from "@phosphor-icons/react";
import { SignUpPolicySchema } from "@repo/domain";
import type {
  InstanceSettings,
  SignUpPolicy,
  SystemMailerSettings,
} from "@repo/domain";
import { useLocation } from "@tanstack/react-router";
import { Predicate, Schema } from "effect";
import { useId, useState } from "react";

import { TableLoadFailed } from "../audience/table-card.tsx";
import { PageFrame } from "../layout/page-frame.tsx";
import { PageAreaLoading } from "../layout/page-states.tsx";
import {
  ConnectionForm,
  serverFailureMessage,
} from "../providers/connection-form.tsx";
import {
  useInstanceSettings,
  useUpdateSignUp,
  useUpdateSystemMailer,
} from "./instance-api.ts";

const SECURITY_LABEL = {
  none: "no encryption",
  starttls: "STARTTLS",
  tls: "TLS",
};

const PageSection = ({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description: string;
  title: string;
}) => {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-4 border-t border-kumo-hairline py-8"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-kumo-strong" id={headingId}>
          {title}
        </h2>
        <p className="max-w-[36rem] text-base text-(--mq-body)">
          {description}
        </p>
      </div>
      {children}
    </section>
  );
};

const DoneBlock = () => (
  <span
    aria-hidden="true"
    className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-quilt bg-(--mq-block-ink) text-kumo-inverse"
  >
    <CheckIcon className="size-3" weight="bold" />
  </span>
);

const SignUpSection = ({ current }: { current: SignUpPolicy }) => {
  const update = useUpdateSignUp();
  const toasts = useKumoToastManager();
  const [edited, setEdited] = useState<SignUpPolicy | null>(null);
  const chosen = edited ?? current;

  return (
    <PageSection
      description="Anyone can sign in once they have an account. This decides who can make one."
      title="Who can sign up"
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();

          if (!update.isPending) {
            update.mutate(chosen, {
              onSuccess: (_, saved) => {
                setEdited((now) => (now === saved ? null : now));
                toasts.add({ title: "Saved who can sign up" });
              },
            });
          }
        }}
      >
        <Radio.Group
          appearance="card"
          controlPosition="start"
          onValueChange={(value) => {
            if (update.isError) {
              update.reset();
            }

            setEdited(Schema.decodeUnknownSync(SignUpPolicySchema)(value));
          }}
          value={chosen}
        >
          <Radio.Legend className="sr-only">Who can sign up</Radio.Legend>
          <Radio.Item
            description="Nobody can make an account on their own. Invitations aren’t built yet, so for now nobody new can join."
            label="Invite only"
            value="invite-only"
          />
          <Radio.Item
            description={`Anyone who can open ${window.location.host} can make an account and their own organizations.`}
            label="Anyone with the address"
            value="open"
          />
        </Radio.Group>
        {update.isError ? (
          <Banner
            role="alert"
            title="Mailquilt couldn’t save who can sign up. Check your connection, then try again."
            variant="error"
          />
        ) : null}
        <div className="flex items-center justify-end gap-4 max-sm:flex-col-reverse max-sm:items-stretch max-sm:*:h-11 max-sm:*:w-full max-sm:*:justify-center">
          <Button aria-busy={update.isPending} type="submit" variant="primary">
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </PageSection>
  );
};

const SetByEnvironment = ({ mailer }: { mailer: SystemMailerSettings }) => (
  <div className="flex flex-col gap-4 rounded-xl border border-kumo-hairline bg-kumo-elevated px-5 py-4">
    <p className="text-base text-(--mq-body)">
      <span className="font-semibold text-kumo-strong">Set on the server.</span>{" "}
      The <code className="font-mono text-sm">SYSTEM_MAILER_</code> environment
      variables choose this server. To change it, edit them where Mailquilt runs
      and restart it.
    </p>
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-base sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-y-2">
      <dt className="text-kumo-subtle">Server</dt>
      <dd className="mb-2 wrap-anywhere text-kumo-strong sm:mb-0">
        {mailer.smtp.host}, port {mailer.smtp.port},{" "}
        {SECURITY_LABEL[mailer.smtp.security]}
      </dd>
      <dt className="text-kumo-subtle">Sign-in</dt>
      <dd className="mb-2 text-kumo-strong sm:mb-0">
        {mailer.signsIn ? "Username and password" : "None"}
      </dd>
      <dt className="text-kumo-subtle">Sends as</dt>
      <dd className="wrap-anywhere text-kumo-strong">
        {mailer.from.name === undefined
          ? mailer.from.email
          : `${mailer.from.name} <${mailer.from.email}>`}
      </dd>
    </dl>
  </div>
);

const mailerFailureMessage = (failure: Error | null) =>
  serverFailureMessage(failure, (other) =>
    Predicate.isTagged(other, "SystemMailerFromEnvironment")
      ? "Environment variables on the server now set this. Reload the page to see them."
      : "Mailquilt couldn’t save the server. Check your connection, then try again."
  );

const SystemMailerSection = ({
  mailer,
}: {
  mailer: SystemMailerSettings | null;
}) => {
  const update = useUpdateSystemMailer();
  const toasts = useKumoToastManager();

  const description =
    "Mailquilt sends its own emails through this server, such as the link that confirms a new account’s address. Campaigns never use it.";

  if (mailer?.source === "environment") {
    return (
      <PageSection description={description} title="Account emails">
        <SetByEnvironment mailer={mailer} />
      </PageSection>
    );
  }

  return (
    <PageSection description={description} title="Account emails">
      {mailer === null ? (
        <Banner
          description="People who sign up can’t confirm their address until you add a server."
          title="Account emails aren’t being sent."
          variant="alert"
        />
      ) : null}
      <ConnectionForm
        busy={update.isPending}
        busyLabel="Saving…"
        connection={mailer ?? undefined}
        failureMessage={mailerFailureMessage(update.error)}
        key={JSON.stringify(mailer)}
        named={false}
        nested
        onSubmit={({ credentials, settings }) =>
          update.mutate(
            credentials === "keep"
              ? { from: settings.from, smtp: settings.smtp }
              : { credentials, from: settings.from, smtp: settings.smtp },
            {
              onSuccess: () =>
                toasts.add({ title: "Saved the account-email server" }),
            }
          )
        }
        senderDescription="Who account emails come from. Use an address on a domain your server may send for."
        senderExample={{ email: "accounts@example.com", name: "Acme" }}
        submitLabel={mailer === null ? "Save server" : "Save changes"}
      />
    </PageSection>
  );
};

const Settings = ({ settings }: { settings: InstanceSettings }) => {
  const { state } = useLocation();

  return (
    <>
      {state.justSetUp ? (
        <div className="mb-8 flex gap-3 rounded-xl bg-kumo-tint px-4 py-3.5 text-base text-(--mq-body)">
          <DoneBlock />
          <p>
            <span className="font-semibold text-kumo-strong">
              Your admin account is ready.
            </span>{" "}
            Next, choose where account emails go out, so others can confirm
            their address. Then name your organization from{" "}
            <Link className="font-medium" href="/">
              Home
            </Link>
            .
          </p>
        </div>
      ) : null}
      <SignUpSection current={settings.signUp} />
      <SystemMailerSection mailer={settings.systemMailer} />
    </>
  );
};

/**
 * Instance settings, for the instance admin: who can sign up, and the
 * server Mailquilt's own account emails go out through. Anyone else who
 * finds the page is told it isn't theirs.
 */
export const InstanceSettingsPage = () => {
  const settings = useInstanceSettings();

  if (settings.isPending) {
    return <PageAreaLoading label="Loading instance settings" />;
  }

  const notAdmin = Predicate.isTagged(settings.error, "InstanceAdminRequired");

  return (
    <PageFrame>
      <div className="mx-auto max-w-[44rem]">
        <h1 className="font-display text-display font-semibold text-kumo-strong">
          Instance settings
        </h1>
        <p className="mt-1.5 mb-8 text-base text-(--mq-body)">
          {notAdmin
            ? "Only the person who runs this Mailquilt can see or change its settings."
            : "These apply to everyone on this Mailquilt. Only you can see them, as its admin."}
        </p>
        {settings.isError && !notAdmin ? (
          <TableLoadFailed
            onRetry={() => settings.refetch()}
            retrying={settings.isFetching}
            title="Instance settings didn’t load"
          />
        ) : null}
        {settings.data ? <Settings settings={settings.data} /> : null}
      </div>
    </PageFrame>
  );
};
