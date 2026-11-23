import { Banner, Button, Link, Radio } from "@cloudflare/kumo";
import { SignUpPolicySchema } from "@repo/domain";
import type {
  InstanceSettings,
  SignUpPolicy,
  SystemMailerSettings,
} from "@repo/domain";
import { useLocation } from "@tanstack/react-router";
import { Predicate, Schema } from "effect";
import { useId, useState } from "react";

import { WarningIcon } from "../icons/icons.tsx";
import { Breakable } from "../layout/breakable.tsx";
import { LoadFailed } from "../layout/empty-state.tsx";
import { PageFrame } from "../layout/page-frame.tsx";
import { PageHeader } from "../layout/page-header.tsx";
import { PageAreaLoading } from "../layout/page-states.tsx";
import { SettingsSection } from "../layout/settings-section.tsx";
import { TableRegion } from "../layout/table-region.tsx";
import { useConfirmationToast } from "../layout/toast.tsx";
import {
  ConnectionForm,
  serverFailureMessage,
} from "../providers/connection-form.tsx";
import {
  useInstanceSettings,
  useUpdateSignUp,
  useUpdateSystemMailer,
} from "./instance-api.ts";

const SignUpSection = ({ current }: { current: SignUpPolicy }) => {
  const update = useUpdateSignUp();
  const toasts = useConfirmationToast();
  const [edited, setEdited] = useState<SignUpPolicy | null>(null);
  const chosen = edited ?? current;
  const formId = useId();

  return (
    <SettingsSection
      about="Anyone can sign in once they have an account. This decides who can make one."
      footer={
        <Button
          aria-busy={update.isPending}
          form={formId}
          type="submit"
          variant="primary"
        >
          {update.isPending ? "Saving…" : "Save changes"}
        </Button>
      }
      title="Who can sign up"
    >
      <form
        className="flex flex-col gap-5"
        id={formId}
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
      </form>
    </SettingsSection>
  );
};

const SECURITY_NAME = {
  none: "None",
  starttls: "STARTTLS",
  tls: "TLS",
};

const Setting = ({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) => (
  <>
    <dt className="text-sm leading-5.25 text-kumo-subtle">{label}</dt>
    <dd className="min-w-0 break-words text-kumo-strong">{children}</dd>
  </>
);

const SetByEnvironment = ({ mailer }: { mailer: SystemMailerSettings }) => (
  <>
    <div className="rounded-lg bg-kumo-elevated px-4 py-3.5 ring ring-kumo-hairline">
      <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-base sm:grid-cols-[6.5rem_minmax(0,1fr)]">
        <Setting label="Server">
          <Breakable value={`${mailer.smtp.host}:${mailer.smtp.port}`} />
        </Setting>
        <Setting label="Encryption">
          {SECURITY_NAME[mailer.smtp.security]}
        </Setting>
        <Setting label="Sign-in">
          {mailer.signsIn ? "Username and password" : "None"}
        </Setting>
        <Setting label="From">
          {mailer.from.name === undefined ? (
            <Breakable value={mailer.from.email} />
          ) : (
            <>
              {mailer.from.name}
              <span className="block text-sm text-kumo-subtle">
                <Breakable value={mailer.from.email} />
              </span>
            </>
          )}
        </Setting>
      </dl>
    </div>
    <p className="-mt-2 text-sm leading-5 text-pretty text-kumo-subtle">
      Set by <code className="font-mono">SYSTEM_MAILER_*</code> environment
      variables on the server. Change them there and restart Mailquilt.
    </p>
  </>
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
  const toasts = useConfirmationToast();

  const about =
    "Mailquilt sends its own emails through this server, such as the link that confirms a new account’s address. Campaigns never use it.";

  if (mailer?.source === "environment") {
    return (
      <SettingsSection about={about} title="Account emails">
        <SetByEnvironment mailer={mailer} />
      </SettingsSection>
    );
  }

  return (
    <SettingsSection about={about} title="Account emails">
      {mailer === null ? (
        <Banner
          description="People who sign up can’t confirm their address until you add a server."
          icon={<WarningIcon />}
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
        senderDescription="Use an address on a domain your server may send for."
        senderExample={{ email: "accounts@example.com", name: "Acme" }}
        submitLabel={mailer === null ? "Save server" : "Save changes"}
      />
    </SettingsSection>
  );
};

const Settings = ({ settings }: { settings: InstanceSettings }) => {
  const { state } = useLocation();

  return (
    <>
      {state.justSetUp ? (
        <div className="mb-8 flex gap-3 rounded-xl bg-kumo-tint px-4 py-3.5 text-base text-(--mq-body)">
          <span aria-hidden="true" className="mq-done-block" />
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
      <div>
        <SignUpSection current={settings.signUp} />
        <SystemMailerSection mailer={settings.systemMailer} />
      </div>
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
  const [retrying, setRetrying] = useState(false);

  // WARNING: a query with no data goes back to pending when it retries, so while Try again runs the failure stays up, keeping the button and its focus, rather than the loader replacing it.
  if (settings.isPending && !retrying) {
    return <PageAreaLoading label="Loading instance settings" />;
  }

  const notAdmin = Predicate.isTagged(settings.error, "InstanceAdminRequired");

  return (
    <PageFrame>
      <div className="max-w-[60rem]">
        <PageHeader
          description={
            notAdmin
              ? "Only the person who runs this Mailquilt can see or change its settings."
              : "These apply to everyone on this Mailquilt. Only you can see them, as its admin."
          }
          title="Instance settings"
          titleDetail={
            settings.data ? (
              <Breakable value={window.location.host} />
            ) : undefined
          }
        />
        {(settings.isError || retrying) && !notAdmin ? (
          <TableRegion label="Instance settings">
            <LoadFailed
              onRetry={async () => {
                setRetrying(true);
                await settings.refetch();
                setRetrying(false);
              }}
              retrying={retrying || settings.isFetching}
              title="Instance settings didn’t load"
            />
          </TableRegion>
        ) : null}
        {settings.data ? <Settings settings={settings.data} /> : null}
      </div>
    </PageFrame>
  );
};
