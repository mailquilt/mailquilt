import {
  Banner,
  Button,
  Checkbox,
  LinkButton,
  Radio,
  Select,
} from "@cloudflare/kumo";
import {
  MailAddress,
  MAX_CREDENTIAL_LENGTH,
  MAX_EMAILS_PER_MINUTE,
  MIN_EMAILS_PER_MINUTE,
  ProviderConnectionName,
  SenderName,
  SmtpHost,
  SmtpSecuritySchema,
} from "@repo/domain";
import type {
  Sender,
  SesAccount,
  SmtpSecurity,
  SmtpServer,
} from "@repo/domain";
import { useForm } from "@tanstack/react-form";
import type { AnyFieldApi } from "@tanstack/react-form";
import { Predicate, Redacted, Schema } from "effect";

import { PasswordField } from "../auth/password-field.tsx";
import { useFieldError } from "../forms/field-error.tsx";
import { FormField } from "../forms/form-field.tsx";
import { submitForm } from "../forms/submit-form.ts";
import { SettingsSection } from "../layout/settings-section.tsx";
import type { ConnectionToSave } from "./providers-api.ts";
import { SES_REGIONS, sesRegionLabel } from "./ses-regions.ts";

const SignInSchema = Schema.Literals(["keep", "new", "none"]);

const ProviderSchema = Schema.Literals(["smtp", "ses"]);

const AccessKeySchema = Schema.Literals(["keep", "new"]);

const ConnectionFormValues = Schema.Struct({
  provider: ProviderSchema,
  fromEmail: MailAddress,
  fromName: SenderName,
  name: Schema.Trim,
  host: Schema.String,
  port: Schema.String,
  security: SmtpSecuritySchema,
  signIn: SignInSchema,
  username: Schema.String,
  password: Schema.String,
  region: Schema.String,
  accessKey: AccessKeySchema,
  accessKeyId: Schema.String,
  secretAccessKey: Schema.String,
  emailsPerMinute: Schema.String,
});

type SignIn = typeof SignInSchema.Type;

type Provider = typeof ProviderSchema.Type;

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
    description: "Usually port 587. Your provider may call this TLS.",
    label: "STARTTLS",
    value: "starttls",
  },
  {
    description: "Usually port 465. Your provider may call this SSL.",
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

const REGION_CHANGED_MESSAGE =
  "You changed the Region, so enter the access key again. Mailquilt only sends it to the account it was entered for.";

const RATE_MESSAGE = `Enter a whole number of emails from ${MIN_EMAILS_PER_MINUTE} to ${MAX_EMAILS_PER_MINUTE.toLocaleString("en")} a minute.`;

const FIELD = "w-full max-sm:h-11 pointer-coarse:h-11";

/** What the form hands back: the connection to save, its credentials left out to keep the saved ones. */
export type ConnectionFormResult = ConnectionToSave;

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
  readonly emailsPerMinute?: number | null;
}

/** An SES account already saved, as the API shows it: its Region, never its access key. */
export interface SavedSesAccount {
  readonly name: string;
  readonly from: typeof Sender.Type;
  readonly ses: typeof SesAccount.Type;
  readonly emailsPerMinute: number | null;
}

/** A connection the form edits: an SMTP server or an SES account. */
export type SavedConnection = SavedServer | SavedSesAccount;

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

const otherConnectionFailure = (failure: Error) =>
  Predicate.isTagged(failure, "ProviderConnectionNotFound")
    ? "This connection no longer exists. Someone may have deleted it."
    : "Mailquilt couldn’t save the connection. Check your connection, then try again.";

/** What to say when saving a Provider Connection through `provider` failed. */
export const connectionFailureMessage = (
  failure: Error | null,
  provider: Provider
) => {
  if (provider === "smtp") {
    return serverFailureMessage(failure, otherConnectionFailure);
  }

  if (failure === null) {
    return;
  }

  return Predicate.isTagged(failure, "CredentialsRequired")
    ? REGION_CHANGED_MESSAGE
    : otherConnectionFailure(failure);
};

const decodeHost = Schema.decodeSync(SmtpHost);

// WARNING: every rule is a field validator; TanStack skips form-level validators while any field has an error, so their errors would arrive a round later.
const CHECKS = {
  fromEmail: { onSubmit: Schema.toStandardSchemaV1(MailAddress) },
  fromName: { onSubmit: Schema.toStandardSchemaV1(SenderName) },
  host: { onSubmit: Schema.toStandardSchemaV1(SmtpHost) },
  name: { onSubmit: Schema.toStandardSchemaV1(ProviderConnectionName) },
};

const isSes = (
  connection: SavedConnection | undefined
): connection is SavedSesAccount =>
  connection !== undefined && "ses" in connection;

const signInFor = (connection?: SavedServer) => {
  if (connection === undefined) {
    return "new" satisfies SignIn;
  }

  return (connection.signsIn ? "keep" : "none") satisfies SignIn;
};

const defaultsFor = (connection?: SavedConnection) => {
  const server = isSes(connection) ? undefined : connection;

  const values: typeof ConnectionFormValues.Encoded = {
    accessKey: isSes(connection) ? "keep" : "new",
    accessKeyId: "",
    emailsPerMinute:
      connection?.emailsPerMinute === undefined ||
      connection.emailsPerMinute === null
        ? ""
        : String(connection.emailsPerMinute),
    fromEmail: connection?.from.email ?? "",
    fromName: connection?.from.name ?? "",
    host: server?.smtp.host ?? "",
    name: connection?.name ?? "",
    password: "",
    port: String(server?.smtp.port ?? USUAL_PORT.starttls),
    provider: isSes(connection) ? "ses" : "smtp",
    region: isSes(connection) ? connection.ses.region : "",
    secretAccessKey: "",
    security: server?.smtp.security ?? "starttls",
    signIn: signInFor(server),
    username: "",
  };

  return values;
};

const resultFrom = (value: typeof ConnectionFormValues.Type) => {
  const from =
    value.fromName === ""
      ? { email: value.fromEmail }
      : { email: value.fromEmail, name: value.fromName };

  const emailsPerMinute =
    value.emailsPerMinute.trim() === ""
      ? null
      : Number(value.emailsPerMinute.trim());

  const basics = { emailsPerMinute, from, name: value.name };

  if (value.provider === "ses") {
    const account = {
      ...basics,
      provider: "ses" as const,
      ses: { region: value.region },
    };

    if (value.accessKey === "keep") {
      return account satisfies ConnectionFormResult;
    }

    return {
      ...account,
      credentials: {
        accessKeyId: Redacted.make(value.accessKeyId.trim()),
        secretAccessKey: Redacted.make(value.secretAccessKey.trim()),
      },
    } satisfies ConnectionFormResult;
  }

  const server = {
    ...basics,
    provider: "smtp" as const,
    smtp: {
      host: decodeHost(value.host),
      port: Number(value.port),
      security: value.security,
    },
  };

  const credentials = {
    keep: undefined,
    new: {
      password: Redacted.make(value.password),
      username: Redacted.make(value.username.trim()),
    },
    none: null,
  }[value.signIn];

  if (credentials === undefined) {
    return server satisfies ConnectionFormResult;
  }

  return { ...server, credentials } satisfies ConnectionFormResult;
};

const portIssue = (port: string) => {
  const number = Number(port);

  return WHOLE_NUMBER.test(port.trim()) && number >= 1 && number <= MAX_PORT
    ? undefined
    : issue(`Enter a port from 1 to ${MAX_PORT}.`);
};

const rateIssue = (rate: string) => {
  const trimmed = rate.trim();

  if (trimmed === "") {
    return;
  }

  const number = Number(trimmed);

  return WHOLE_NUMBER.test(trimmed) &&
    number >= MIN_EMAILS_PER_MINUTE &&
    number <= MAX_EMAILS_PER_MINUTE
    ? undefined
    : issue(RATE_MESSAGE);
};

const Part = ({
  about,
  children,
  nested,
  title,
}: {
  about: string;
  children: React.ReactNode;
  nested: boolean;
  title: string;
}) =>
  nested ? (
    <div className="flex flex-col gap-5">{children}</div>
  ) : (
    <SettingsSection about={about} title={title}>
      {children}
    </SettingsSection>
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

const AccessKeyChoice = ({ field }: { field: AnyFieldApi }) => {
  const { message } = useFieldError(field);

  return (
    <Radio.Group
      error={message}
      legend="Saved access key"
      name={field.name}
      onValueChange={(value) =>
        field.handleChange(Schema.decodeUnknownSync(AccessKeySchema)(value))
      }
      value={field.state.value}
    >
      <Radio.Item label="Keep the saved one" value="keep" />
      <Radio.Item label="Enter a new one" value="new" />
    </Radio.Group>
  );
};

const RegionField = ({ field }: { field: AnyFieldApi }) => {
  const { error } = useFieldError(field);
  const region = String(field.state.value);

  return (
    <Select
      className={`${FIELD} min-w-0`}
      description={
        error === undefined
          ? "Where your SES account and its verified senders are."
          : undefined
      }
      error={error}
      label="Region"
      name={field.name}
      onValueChange={(value) => field.handleChange(String(value ?? ""))}
      placeholder="Choose a Region"
      renderValue={() =>
        region === "" ? "Choose a Region" : sesRegionLabel(region)
      }
      value={region === "" ? null : region}
    >
      {SES_REGIONS.map((option) => (
        <Select.Option key={option.code} value={option.code}>
          {option.name}, {option.code}
        </Select.Option>
      ))}
    </Select>
  );
};

const PROVIDERS = [
  {
    description:
      "With an IAM access key. Mailquilt keeps to your account’s sending limit.",
    label: "Amazon SES",
    value: "ses",
  },
  {
    description:
      "Any provider’s SMTP settings, such as Postmark, Mailgun or your own relay.",
    label: "SMTP server",
    value: "smtp",
  },
] as const;

/**
 * A Provider Connection's settings, or, without a name or Cancel, the System
 * Mailer's SMTP server. With `chooseProvider`, it first asks which Provider
 * the connection is, and the sections under the choice follow it: an SMTP
 * server's host, port, encryption and sign-in, or an SES account's Region and
 * access key. Editing one with saved credentials offers to keep them, unless
 * where they go changes (the server, or the Region): then they must be
 * entered again, as the API requires. With `sendingRate`, it asks for the
 * most emails a minute, empty for none. Fields are checked with the same
 * rules the API uses.
 */
export const ConnectionForm = ({
  busy,
  busyLabel,
  cancelHref,
  chooseProvider = false,
  connection,
  failureMessage,
  named = true,
  nested = false,
  onProviderChange,
  onSubmit,
  senderDescription,
  senderExample,
  sendingRate = false,
  submitLabel,
}: {
  busy: boolean;
  /** The submit button's label while saving, such as "Connecting…". */
  busyLabel: string;
  /** Where Cancel goes; without it there is no Cancel. */
  cancelHref?: string;
  /** Whether it asks which Provider the connection is, as connecting one does. */
  chooseProvider?: boolean;
  connection?: SavedConnection;
  /** What to say when saving failed, for the Provider chosen; nothing when it didn't. */
  failureMessage: (provider: Provider) => string | undefined;
  /** Whether the server has a name of its own, as a Provider Connection does. */
  named?: boolean;
  /** Whether the form sits inside a page section, so its own sections are subsections. */
  nested?: boolean;
  /** Called when the person chooses another Provider. */
  onProviderChange?: () => void;
  onSubmit: (result: ConnectionFormResult) => void;
  /** Who email sent through it is from, said for the Provider chosen. */
  senderDescription: (provider: Provider) => string;
  /** A made-up sender, shown in the empty sender fields. */
  senderExample: { readonly name: string; readonly email: string };
  /** Whether it asks for a sending rate, as a Provider Connection has. */
  sendingRate?: boolean;
  submitLabel: string;
}) => {
  const savedServer = isSes(connection) ? undefined : connection;
  const saved = savedServer?.signsIn ?? false;

  const form = useForm({
    defaultValues: defaultsFor(connection),
    onSubmit: ({ value }) => {
      if (!busy) {
        onSubmit(resultFrom(Schema.decodeSync(ConnectionFormValues)(value)));
      }
    },
  });

  const serverChanged = (values: typeof form.state.values) =>
    savedServer !== undefined &&
    (values.host.trim() !== savedServer.smtp.host ||
      Number(values.port) !== savedServer.smtp.port ||
      values.security !== savedServer.smtp.security);

  const regionChanged = (values: typeof form.state.values) =>
    isSes(connection) && values.region !== connection.ses.region;

  const requireNewSignInIfServerChanged = () => {
    if (
      form.getFieldValue("signIn") === "keep" &&
      serverChanged(form.state.values)
    ) {
      form.setFieldValue("signIn", "new");
    }
  };

  const requireNewKeyIfRegionChanged = () => {
    if (
      form.getFieldValue("accessKey") === "keep" &&
      regionChanged(form.state.values)
    ) {
      form.setFieldValue("accessKey", "new");
    }
  };

  const serverListeners = { onChange: requireNewSignInIfServerChanged };

  const submit = (
    <Button aria-busy={busy} type="submit" variant="primary">
      {busy ? busyLabel : submitLabel}
    </Button>
  );

  const failure = (provider: Provider) => {
    const message = failureMessage(provider);

    return message === undefined ? null : (
      <Banner role="alert" title={message} variant="error" />
    );
  };

  const smtpSections = (
    <>
      <Part
        about="Your provider lists these under its SMTP settings."
        nested={nested}
        title="Server"
      >
        <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] items-start gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
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
                placeholder="587"
                size="base"
              />
            )}
          </form.Field>
        </div>
        <form.Field listeners={serverListeners} name="security">
          {(field) => (
            <Radio.Group
              appearance="card"
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
      </Part>
      <Part
        about="Stored encrypted. Mailquilt never shows them again, not even to you."
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
              <div
                className={`grid items-start gap-5 ${nested ? "sm:grid-cols-2 sm:gap-3" : ""}`}
              >
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
              </div>
            ) : null
          }
        </form.Subscribe>
      </Part>
    </>
  );

  const sesSections = (
    <>
      <Part
        about="The SES account Mailquilt sends through."
        nested={nested}
        title="Account"
      >
        <form.Field
          listeners={{ onChange: requireNewKeyIfRegionChanged }}
          name="region"
          validators={{
            onSubmit: ({ value }) =>
              value === "" ? issue("Choose a Region.") : undefined,
          }}
        >
          {(field) => <RegionField field={field} />}
        </form.Field>
      </Part>
      <Part
        about="From an IAM user that may send email (ses:SendEmail) and read your sending limit (ses:GetAccount). Stored encrypted. Mailquilt never shows it again, not even to you."
        nested={nested}
        title="Access key"
      >
        {isSes(connection) ? (
          <form.Field
            name="accessKey"
            validators={{
              onSubmit: ({ fieldApi, value }) =>
                value === "keep" && regionChanged(fieldApi.form.state.values)
                  ? issue(REGION_CHANGED_MESSAGE)
                  : undefined,
            }}
          >
            {(field) => <AccessKeyChoice field={field} />}
          </form.Field>
        ) : null}
        <form.Subscribe selector={(state) => state.values.accessKey}>
          {(accessKey) =>
            accessKey === "new" ? (
              <div className="grid items-start gap-5">
                <form.Field
                  name="accessKeyId"
                  validators={{
                    onSubmit: ({ value }) =>
                      credentialIssue(value, "Enter the access key ID."),
                  }}
                >
                  {(field) => (
                    <FormField
                      autoCapitalize="none"
                      autoComplete="off"
                      className={FIELD}
                      field={field}
                      label="Access key ID"
                      placeholder="AKIA…"
                      size="base"
                      spellCheck={false}
                    />
                  )}
                </form.Field>
                <form.Field
                  name="secretAccessKey"
                  validators={{
                    onSubmit: ({ value }) =>
                      credentialIssue(value, "Enter the secret access key."),
                  }}
                >
                  {(field) => (
                    <PasswordField
                      autoComplete="new-password"
                      className={FIELD}
                      field={field}
                      label="Secret access key"
                      size="base"
                    />
                  )}
                </form.Field>
              </div>
            ) : null
          }
        </form.Subscribe>
      </Part>
    </>
  );

  return (
    <form
      className={nested ? "flex flex-col gap-5" : "flex flex-col"}
      noValidate
      onSubmit={(event) => submitForm(event, form)}
    >
      {chooseProvider ? (
        <Part
          about="Where Mailquilt hands your email to be delivered."
          nested={nested}
          title="Provider"
        >
          <form.Field name="provider">
            {(field) => (
              <Radio.Group
                appearance="card"
                legend="Provider"
                onValueChange={(value) => {
                  const provider =
                    Schema.decodeUnknownSync(ProviderSchema)(value);

                  field.handleChange(provider);
                  onProviderChange?.();
                }}
                value={field.state.value}
              >
                {PROVIDERS.map((option) => (
                  <Radio.Item
                    description={option.description}
                    key={option.value}
                    label={option.label}
                    value={option.value}
                  />
                ))}
                <Radio.Item
                  description="Connects directly in a later Mailquilt update."
                  disabled
                  label="Cloudflare Email (soon)"
                  value="cloudflare"
                />
              </Radio.Group>
            )}
          </form.Field>
        </Part>
      ) : null}
      {named ? (
        <Part
          about="What it’s called in Mailquilt, so you can tell connections apart."
          nested={nested}
          title="Connection"
        >
          <form.Subscribe selector={(state) => state.values.provider}>
            {(provider) => (
              <form.Field name="name" validators={CHECKS.name}>
                {(field) => (
                  <FormField
                    autoComplete="off"
                    className={FIELD}
                    field={field}
                    label="Name"
                    placeholder={provider === "ses" ? "SES" : "Postmark"}
                    size="base"
                  />
                )}
              </form.Field>
            )}
          </form.Subscribe>
        </Part>
      ) : null}
      <form.Subscribe selector={(state) => state.values.provider}>
        {(provider) => (provider === "ses" ? sesSections : smtpSections)}
      </form.Subscribe>
      {sendingRate ? (
        <Part
          about="Across every Campaign that sends through this connection."
          nested={nested}
          title="Sending rate"
        >
          <form.Subscribe selector={(state) => state.values.provider}>
            {(provider) => (
              <form.Field
                name="emailsPerMinute"
                validators={{ onSubmit: ({ value }) => rateIssue(value) }}
              >
                {(field) => (
                  <FormField
                    autoComplete="off"
                    className={FIELD}
                    description={
                      provider === "ses"
                        ? "Leave it empty to keep to your SES account’s own limit, which Mailquilt reads from SES before each batch."
                        : "Leave it empty to send as fast as your server takes them. Set it if your provider limits you, such as Microsoft 365’s 30 a minute."
                    }
                    field={field}
                    inputMode="numeric"
                    label="Most emails a minute (optional)"
                    placeholder={
                      provider === "ses" ? "Your account’s limit" : "No limit"
                    }
                    size="base"
                  />
                )}
              </form.Field>
            )}
          </form.Subscribe>
        </Part>
      ) : null}
      <form.Subscribe selector={(state) => state.values.provider}>
        {(provider) => (
          <Part
            about={senderDescription(provider)}
            nested={nested}
            title="Sender"
          >
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
                  description={nested ? senderDescription(provider) : undefined}
                  field={field}
                  inputMode="email"
                  label="From email"
                  placeholder={senderExample.email}
                  size="base"
                  type="email"
                />
              )}
            </form.Field>
            {failure(provider)}
            {nested ? (
              <div className="flex justify-end">{submit}</div>
            ) : (
              <div className="mq-form-end">
                <form.Subscribe
                  selector={(state) =>
                    Object.values(state.fieldMeta).filter(
                      (meta) => (meta?.errors.length ?? 0) > 0
                    ).length
                  }
                >
                  {(errors) =>
                    errors === 0 ? null : (
                      <p className="mr-auto text-sm text-kumo-danger">
                        Fix {errors} {errors === 1 ? "field" : "fields"} to{" "}
                        {submitLabel.toLowerCase()}.
                      </p>
                    )
                  }
                </form.Subscribe>
                {cancelHref === undefined ? null : (
                  <LinkButton href={cancelHref} variant="secondary">
                    Cancel
                  </LinkButton>
                )}
                {submit}
              </div>
            )}
          </Part>
        )}
      </form.Subscribe>
    </form>
  );
};
