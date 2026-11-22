import { Banner, Button, Checkbox, LinkButton, Radio } from "@cloudflare/kumo";
import {
  MailAddress,
  ProviderConnectionName,
  MAX_CREDENTIAL_LENGTH,
  SenderName,
  SmtpHost,
  SmtpSecuritySchema,
} from "@repo/domain";
import type {
  Sender,
  SmtpCredentials,
  SmtpSecurity,
  SmtpServer,
} from "@repo/domain";
import { useForm } from "@tanstack/react-form";
import type { AnyFieldApi } from "@tanstack/react-form";
import { Predicate, Redacted, Schema } from "effect";

import { PasswordField } from "../auth/password-field.tsx";
import { FormField } from "../forms/form-field.tsx";
import { submitForm } from "../forms/submit-form.ts";
import type { ConnectionSettings } from "./providers-api.ts";

const SignInSchema = Schema.Literals(["keep", "new", "none"]);

const ConnectionFormValues = Schema.Struct({
  fromEmail: MailAddress,
  fromName: SenderName,
  host: SmtpHost,
  name: Schema.Trim,
  password: Schema.String,
  port: Schema.String,
  security: SmtpSecuritySchema,
  signIn: SignInSchema,
  username: Schema.String,
});

type SignIn = typeof SignInSchema.Type;

const USUAL_PORT: Record<SmtpSecurity, string> = {
  none: "25",
  starttls: "587",
  tls: "465",
};

const USUAL_PORTS = new Set(Object.values(USUAL_PORT));

const MAX_PORT = 65_535;

const WHOLE_NUMBER = /^\d+$/u;

const ENCRYPTION = [
  {
    description:
      "Usually port 587. Starts plain and switches to encryption; if the server can’t, Mailquilt won’t send.",
    label: "STARTTLS",
    value: "starttls",
  },
  {
    description: "Usually port 465. Encrypted from the first byte.",
    label: "TLS",
    value: "tls",
  },
  {
    description:
      "Usually port 25. Not encrypted, so only for a relay on your own network.",
    label: "None",
    value: "none",
  },
] as const satisfies readonly {
  description: string;
  label: string;
  value: SmtpSecurity;
}[];

const SERVER_CHANGED_MESSAGE =
  "You changed the server, so enter the username and password again. Mailquilt only sends them to the server they were entered for.";

const FIELD = "w-full max-sm:h-11 pointer-coarse:h-11";

/** What the form hands back: the settings, and what to do with the sign-in. */
export interface ConnectionFormResult {
  readonly settings: ConnectionSettings;
  readonly credentials: "keep" | typeof SmtpCredentials.Type | null;
}

const issue = (message: string) => ({ message });

const credentialIssue = (value: string, missing: string) => {
  if (value.trim() === "") {
    return issue(missing);
  }

  return value.length > MAX_CREDENTIAL_LENGTH
    ? issue(`Use at most ${MAX_CREDENTIAL_LENGTH} characters.`)
    : undefined;
};

/** An SMTP server already saved, as the API shows it: without its credentials, only whether it has them. */
export interface SavedServer {
  readonly name?: string;
  readonly from: typeof Sender.Type;
  readonly smtp: typeof SmtpServer.Type;
  readonly signsIn: boolean;
}

/**
 * What to say when saving an SMTP server failed: the message every server
 * form shares when saved credentials were kept for a changed server, or
 * `otherwise`.
 */
export const serverFailureMessage = (
  failure: Error | null,
  otherwise: (failure: Error) => string
) => {
  if (failure === null) {
    return;
  }

  return Predicate.isTagged(failure, "CredentialsRequired")
    ? SERVER_CHANGED_MESSAGE
    : otherwise(failure);
};

/** What to say when saving a Provider Connection failed. */
export const connectionFailureMessage = (failure: Error | null) =>
  serverFailureMessage(failure, (other) =>
    Predicate.isTagged(other, "ProviderConnectionNotFound")
      ? "This connection no longer exists. Someone may have deleted it."
      : "Mailquilt couldn’t save the connection. Check your connection, then try again."
  );

// WARNING: every rule is a field validator; TanStack skips form-level validators while any field has an error, so their errors would arrive a round later.
const CHECKS = {
  fromEmail: { onSubmit: Schema.toStandardSchemaV1(MailAddress) },
  fromName: { onSubmit: Schema.toStandardSchemaV1(SenderName) },
  host: { onSubmit: Schema.toStandardSchemaV1(SmtpHost) },
  name: { onSubmit: Schema.toStandardSchemaV1(ProviderConnectionName) },
};

const signInFor = (connection?: SavedServer) => {
  if (connection === undefined) {
    return "new" satisfies SignIn;
  }

  return (connection.signsIn ? "keep" : "none") satisfies SignIn;
};

const defaultsFor = (connection?: SavedServer) => {
  const values: typeof ConnectionFormValues.Encoded = {
    fromEmail: connection?.from.email ?? "",
    fromName: connection?.from.name ?? "",
    host: connection?.smtp.host ?? "",
    name: connection?.name ?? "",
    password: "",
    port: String(connection?.smtp.port ?? USUAL_PORT.starttls),
    security: connection?.smtp.security ?? "starttls",
    signIn: signInFor(connection),
    username: "",
  };

  return values;
};

const resultFrom = (value: typeof ConnectionFormValues.Type) => {
  const credentials = {
    keep: "keep" as const,
    new: {
      password: Redacted.make(value.password),
      username: Redacted.make(value.username.trim()),
    },
    none: null,
  }[value.signIn];

  const from =
    value.fromName === ""
      ? { email: value.fromEmail }
      : { email: value.fromEmail, name: value.fromName };

  return {
    credentials,
    settings: {
      from,
      name: value.name,
      smtp: {
        host: value.host,
        port: Number(value.port),
        security: value.security,
      },
    },
  } satisfies ConnectionFormResult;
};

const portIssue = (port: string) => {
  const number = Number(port);

  return WHOLE_NUMBER.test(port.trim()) && number >= 1 && number <= MAX_PORT
    ? undefined
    : issue(`Enter a port from 1 to ${MAX_PORT}.`);
};

const Section = ({
  children,
  description,
  nested,
  title,
}: {
  children: React.ReactNode;
  description?: string;
  nested: boolean;
  title?: string;
}) => {
  const Heading = nested ? "h3" : "h2";

  return (
    <section
      className={`flex flex-col gap-4 border-t border-kumo-hairline py-6 ${nested ? "" : "first:border-t-0 first:pt-0"}`}
    >
      {title === undefined ? null : (
        <div className="flex flex-col gap-1">
          <Heading
            className={`font-semibold text-kumo-strong ${nested ? "text-base" : "text-lg"}`}
          >
            {title}
          </Heading>
          {description === undefined ? null : (
            <p className="max-w-[36rem] text-base text-(--mq-body)">
              {description}
            </p>
          )}
        </div>
      )}
      {children}
    </section>
  );
};

const SignInChoice = ({
  field,
  saved,
}: {
  field: AnyFieldApi;
  saved: boolean;
}) => {
  const error = field.state.meta.errors.at(0);

  const message = Predicate.hasProperty(error, "message")
    ? String(error.message)
    : undefined;

  if (!saved) {
    return (
      <Checkbox
        checked={field.state.value === "none"}
        label="This server doesn’t need a sign-in"
        onCheckedChange={(checked) =>
          field.handleChange(checked ? "none" : "new")
        }
      />
    );
  }

  return (
    <Radio.Group
      error={message}
      legend="Username and password"
      name={field.name}
      onValueChange={(value) =>
        field.handleChange(Schema.decodeUnknownSync(SignInSchema)(value))
      }
      value={field.state.value}
    >
      <Radio.Item label="Keep the saved ones" value="keep" />
      <Radio.Item label="Enter new ones" value="new" />
      <Radio.Item label="This server doesn’t need a sign-in" value="none" />
    </Radio.Group>
  );
};

/**
 * The settings of an SMTP server: a Provider Connection's, for connecting
 * one or editing it, or, without a name or Cancel, the System Mailer's.
 * Editing one with a saved sign-in offers to keep it, unless the server
 * changes: then the username and password must be entered again, as the API
 * requires. Fields are checked with the same schemas the API uses.
 */
export const ConnectionForm = ({
  busy,
  busyLabel,
  cancelHref,
  connection,
  failureMessage,
  named = true,
  nested = false,
  onSubmit,
  senderDescription,
  senderExample,
  submitLabel,
}: {
  busy: boolean;
  /** The submit button's label while saving, such as "Connecting…". */
  busyLabel: string;
  /** Where Cancel goes; without it there is no Cancel. */
  cancelHref?: string;
  connection?: SavedServer;
  failureMessage: string | undefined;
  /** Whether the server has a name of its own, as a Provider Connection does. */
  named?: boolean;
  /** Whether the form sits inside a page section, so its own sections are subsections. */
  nested?: boolean;
  onSubmit: (result: ConnectionFormResult) => void;
  senderDescription: string;
  /** A made-up sender, shown in the empty sender fields. */
  senderExample: { readonly name: string; readonly email: string };
  submitLabel: string;
}) => {
  const saved = connection?.signsIn ?? false;

  const form = useForm({
    defaultValues: defaultsFor(connection),
    onSubmit: ({ value }) => {
      if (!busy) {
        onSubmit(resultFrom(Schema.decodeSync(ConnectionFormValues)(value)));
      }
    },
  });

  const serverChanged = (values: typeof form.state.values) =>
    connection !== undefined &&
    (values.host.trim() !== connection.smtp.host ||
      Number(values.port) !== connection.smtp.port ||
      values.security !== connection.smtp.security);

  const requireNewSignInIfServerChanged = () => {
    if (
      form.getFieldValue("signIn") === "keep" &&
      serverChanged(form.state.values)
    ) {
      form.setFieldValue("signIn", "new");
    }
  };

  const serverListeners = { onChange: requireNewSignInIfServerChanged };

  return (
    <form
      className="flex flex-col"
      noValidate
      onSubmit={(event) => submitForm(event, form)}
    >
      {named ? (
        <Section nested={nested}>
          <form.Field name="name" validators={CHECKS.name}>
            {(field) => (
              <FormField
                autoComplete="off"
                className={FIELD}
                description="So you can tell connections apart."
                field={field}
                label="Name"
                placeholder="Postmark"
                size="base"
              />
            )}
          </form.Field>
        </Section>
      ) : null}
      <Section
        description="Your provider lists these under its SMTP settings."
        nested={nested}
        title="Server"
      >
        <div className="grid grid-cols-[minmax(0,1fr)_6rem] items-start gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
          <form.Field
            listeners={serverListeners}
            name="host"
            validators={CHECKS.host}
          >
            {(field) => (
              <FormField
                autoCapitalize="none"
                autoComplete="off"
                className={FIELD}
                field={field}
                label="Host"
                placeholder="smtp.example.com"
                size="base"
                spellCheck={false}
              />
            )}
          </form.Field>
          <form.Field
            listeners={serverListeners}
            name="port"
            validators={{ onSubmit: ({ value }) => portIssue(value) }}
          >
            {(field) => (
              <FormField
                autoComplete="off"
                className={FIELD}
                field={field}
                inputMode="numeric"
                label="Port"
                size="base"
              />
            )}
          </form.Field>
        </div>
        <form.Field listeners={serverListeners} name="security">
          {(field) => (
            <Radio.Group
              appearance="card"
              controlPosition="start"
              legend="Encryption"
              onValueChange={(value) => {
                const security =
                  Schema.decodeUnknownSync(SmtpSecuritySchema)(value);

                const port = form.getFieldValue("port").trim();

                field.handleChange(security);

                if (port === "" || USUAL_PORTS.has(port)) {
                  form.setFieldValue("port", USUAL_PORT[security]);
                }
              }}
              value={field.state.value}
            >
              {ENCRYPTION.map((option) => (
                <Radio.Item
                  description={option.description}
                  key={option.value}
                  label={option.label}
                  value={option.value}
                />
              ))}
            </Radio.Group>
          )}
        </form.Field>
      </Section>
      <Section
        description="Stored encrypted. Mailquilt never shows them again, not even to you."
        nested={nested}
        title="Sign-in"
      >
        <form.Field
          name="signIn"
          validators={{
            onSubmit: ({ fieldApi, value }) =>
              value === "keep" && serverChanged(fieldApi.form.state.values)
                ? issue(SERVER_CHANGED_MESSAGE)
                : undefined,
          }}
        >
          {(field) => <SignInChoice field={field} saved={saved} />}
        </form.Field>

        <form.Subscribe selector={(state) => state.values.signIn}>
          {(signIn) =>
            signIn === "new" ? (
              <>
                <form.Field
                  name="username"
                  validators={{
                    onSubmit: ({ value }) =>
                      credentialIssue(value, "Enter the username."),
                  }}
                >
                  {(field) => (
                    <FormField
                      autoCapitalize="none"
                      autoComplete="off"
                      className={FIELD}
                      field={field}
                      label="Username"
                      size="base"
                      spellCheck={false}
                    />
                  )}
                </form.Field>
                <form.Field
                  name="password"
                  validators={{
                    onSubmit: ({ value }) =>
                      credentialIssue(value, "Enter the password."),
                  }}
                >
                  {(field) => (
                    <PasswordField
                      autoComplete="new-password"
                      className={FIELD}
                      field={field}
                      size="base"
                    />
                  )}
                </form.Field>
              </>
            ) : null
          }
        </form.Subscribe>
      </Section>
      <Section description={senderDescription} nested={nested} title="Sender">
        <form.Field name="fromName" validators={CHECKS.fromName}>
          {(field) => (
            <FormField
              autoComplete="off"
              className={FIELD}
              field={field}
              label="From name (optional)"
              placeholder={senderExample.name}
              size="base"
            />
          )}
        </form.Field>
        <form.Field name="fromEmail" validators={CHECKS.fromEmail}>
          {(field) => (
            <FormField
              autoComplete="off"
              className={FIELD}
              field={field}
              inputMode="email"
              label="From email"
              placeholder={senderExample.email}
              size="base"
              type="email"
            />
          )}
        </form.Field>
      </Section>
      {failureMessage === undefined ? null : (
        <Banner
          className="mb-4"
          role="alert"
          title={failureMessage}
          variant="error"
        />
      )}
      <div className="flex justify-end gap-2 border-t border-kumo-hairline pt-6 max-sm:flex-col-reverse max-sm:*:h-11 max-sm:*:w-full max-sm:*:justify-center">
        {cancelHref === undefined ? null : (
          <LinkButton href={cancelHref} variant="ghost">
            Cancel
          </LinkButton>
        )}
        <Button aria-busy={busy} type="submit" variant="primary">
          {busy ? busyLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
};
