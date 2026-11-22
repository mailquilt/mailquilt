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
  ProviderConnection,
  SmtpCredentials,
  SmtpSecurity,
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
  name: ProviderConnectionName,
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

const failureMessageFor = (failure: Error | null) => {
  if (failure === null) {
    return;
  }

  if (Predicate.isTagged(failure, "CredentialsRequired")) {
    return SERVER_CHANGED_MESSAGE;
  }

  if (Predicate.isTagged(failure, "ProviderConnectionNotFound")) {
    return "This connection no longer exists. Someone may have deleted it.";
  }

  return "Mailquilt couldn’t save the connection. Check your connection, then try again.";
};

// WARNING: every rule is a field validator; TanStack skips form-level validators while any field has an error, so their errors would arrive a round later.
const CHECKS = {
  fromEmail: { onSubmit: Schema.toStandardSchemaV1(MailAddress) },
  fromName: { onSubmit: Schema.toStandardSchemaV1(SenderName) },
  host: { onSubmit: Schema.toStandardSchemaV1(SmtpHost) },
  name: { onSubmit: Schema.toStandardSchemaV1(ProviderConnectionName) },
};

const signInFor = (connection?: ProviderConnection) => {
  if (connection === undefined) {
    return "new" satisfies SignIn;
  }

  return (connection.signsIn ? "keep" : "none") satisfies SignIn;
};

const defaultsFor = (connection?: ProviderConnection) => {
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
  title,
}: {
  children: React.ReactNode;
  description?: string;
  title?: string;
}) => (
  <section className="flex flex-col gap-4 border-t border-kumo-hairline py-6 first:border-t-0 first:pt-0">
    {title === undefined ? null : (
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-kumo-strong">{title}</h2>
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
 * The settings of an SMTP Provider Connection, for connecting one or editing
 * it. Editing one with a saved sign-in offers to keep it, unless the server
 * changes: then the username and password must be entered again, as the API
 * requires. Fields are checked with the same schemas the API uses.
 */
export const ConnectionForm = ({
  busy,
  busyLabel,
  connection,
  failure,
  onSubmit,
  submitLabel,
}: {
  busy: boolean;
  /** The submit button's label while saving, such as "Connecting…". */
  busyLabel: string;
  connection?: ProviderConnection;
  failure: Error | null;
  onSubmit: (result: ConnectionFormResult) => void;
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

  const failureMessage = failureMessageFor(failure);

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
      <Section>
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
      <Section
        description="Your provider lists these under its SMTP settings."
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
      <Section
        description="Who email sent through this connection is from. Your provider must allow this address."
        title="Sender"
      >
        <form.Field name="fromName" validators={CHECKS.fromName}>
          {(field) => (
            <FormField
              autoComplete="off"
              className={FIELD}
              field={field}
              label="From name (optional)"
              placeholder="Acme News"
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
              placeholder="news@example.com"
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
        <LinkButton href="/providers" variant="ghost">
          Cancel
        </LinkButton>
        <Button aria-busy={busy} type="submit" variant="primary">
          {busy ? busyLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
};
