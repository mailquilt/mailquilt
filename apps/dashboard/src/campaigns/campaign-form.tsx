import {
  Banner,
  Button,
  LinkButton,
  Select,
  Tabs,
  Textarea,
} from "@cloudflare/kumo";
import {
  CampaignHtml,
  CampaignSubject,
  ListIdSchema,
  MailAddress,
  campaignHtmlBytes,
  MAX_CAMPAIGN_HTML_BYTES,
  ProviderConnectionIdSchema,
  SenderName,
} from "@repo/domain";
import type {
  Campaign,
  CampaignDraft,
  List,
  ProviderConnection,
} from "@repo/domain";
import { useForm, useStore } from "@tanstack/react-form";
import type { AnyFieldApi } from "@tanstack/react-form";
import { Option, Schema } from "effect";
import type { Types } from "effect";
import { useId, useState } from "react";
import { flushSync } from "react-dom";

import { formatCount } from "../audience/format.ts";
import { FormField } from "../forms/form-field.tsx";
import { submitForm } from "../forms/submit-form.ts";
import { SettingsSection } from "../layout/settings-section.tsx";
import { EmailPreview } from "./email-preview.tsx";

const KIB = 1024;

const FIELD = "w-full max-sm:h-11 pointer-coarse:h-11";

const CampaignFormValues = Schema.Struct({
  fromEmail: MailAddress,
  fromName: SenderName,
  html: CampaignHtml,
  listId: ListIdSchema,
  providerConnectionId: ProviderConnectionIdSchema,
  replyTo: Schema.Trim,
  subject: CampaignSubject,
});

const decodeValues = Schema.decodeSync(CampaignFormValues);

const mailAddress = Schema.toStandardSchemaV1(MailAddress)["~standard"];

const FieldIssue = Schema.Struct({ message: Schema.String });

const decodeFieldIssue = Schema.decodeUnknownOption(FieldIssue);

const issue = (message: string) => ({ message });

const optionalAddressIssue = (value: string) => {
  if (value.trim() === "") {
    return;
  }

  const result = mailAddress.validate(value);

  return result instanceof Promise ? undefined : result.issues?.at(0);
};

// WARNING: every rule is a field validator; TanStack skips form-level validators while any field has an error, so their errors would arrive a round later.
const CHECKS = {
  fromEmail: { onSubmit: Schema.toStandardSchemaV1(MailAddress) },
  fromName: { onSubmit: Schema.toStandardSchemaV1(SenderName) },
  html: { onSubmit: Schema.toStandardSchemaV1(CampaignHtml) },
  listId: {
    onSubmit: ({ value }: { value: string }) =>
      value === "" ? issue("Choose a list.") : undefined,
  },
  providerConnectionId: {
    onSubmit: ({ value }: { value: string }) =>
      value === "" ? issue("Choose a provider connection.") : undefined,
  },
  replyTo: {
    onSubmit: ({ value }: { value: string }) => optionalAddressIssue(value),
  },
  subject: { onSubmit: Schema.toStandardSchemaV1(CampaignSubject) },
};

type Tab = "html" | "preview";

const only = <T,>(items: readonly T[]) =>
  items.length === 1 ? items.at(0) : undefined;

const defaultsFor = (
  lists: readonly List[],
  connections: readonly ProviderConnection[],
  campaign?: Campaign
) => {
  if (campaign !== undefined) {
    const values: typeof CampaignFormValues.Encoded = {
      fromEmail: campaign.from.email,
      fromName: campaign.from.name ?? "",
      html: campaign.html,
      listId: lists.some((list) => list.id === campaign.listId)
        ? campaign.listId
        : "",
      providerConnectionId: connections.some(
        (connection) => connection.id === campaign.providerConnectionId
      )
        ? (campaign.providerConnectionId ?? "")
        : "",
      replyTo: campaign.replyTo ?? "",
      subject: campaign.subject,
    };

    return values;
  }

  const connection = only(connections);

  const values: typeof CampaignFormValues.Encoded = {
    fromEmail: connection?.from.email ?? "",
    fromName: connection?.from.name ?? "",
    html: "",
    listId: only(lists)?.id ?? "",
    providerConnectionId: connection?.id ?? "",
    replyTo: "",
    subject: "",
  };

  return values;
};

const draftFrom = (value: typeof CampaignFormValues.Type) => {
  const draft: Types.Mutable<typeof CampaignDraft.Type> = {
    from:
      value.fromName === ""
        ? { email: value.fromEmail }
        : { email: value.fromEmail, name: value.fromName },
    html: value.html,
    listId: value.listId,
    providerConnectionId: value.providerConnectionId,
    subject: value.subject,
  };

  if (value.replyTo !== "") {
    draft.replyTo = value.replyTo;
  }

  return draft satisfies typeof CampaignDraft.Type;
};

const useFieldError = (field: AnyFieldApi) => {
  const submissions = useStore(
    field.form.store,
    (state) => state.submissionAttempts
  );

  const message = Option.getOrUndefined(
    Option.map(
      decodeFieldIssue(field.state.meta.errors.at(0)),
      (found) => found.message
    )
  );

  return {
    message,
    submissions,
    // WARNING: keyed by submission so a repeated error is a new alert, which screen readers announce again.
    error:
      message === undefined
        ? undefined
        : {
            match: true as const,
            message: (
              <span key={submissions} role="alert">
                {message}
              </span>
            ),
          },
  };
};

const ChoiceField = ({
  children,
  description,
  field,
  label,
  placeholder,
  valueLabel,
}: {
  children: React.ReactNode;
  description?: string;
  field: AnyFieldApi;
  label: string;
  placeholder: string;
  valueLabel: string | undefined;
}) => {
  const { error } = useFieldError(field);

  return (
    <Select
      className={`${FIELD} min-w-0`}
      description={
        error === undefined && description !== undefined ? (
          <span className="wrap-anywhere">{description}</span>
        ) : undefined
      }
      error={error}
      label={label}
      name={field.name}
      onValueChange={(value) => field.handleChange(String(value ?? ""))}
      placeholder={placeholder}
      renderValue={() => valueLabel ?? placeholder}
      value={field.state.value === "" ? null : String(field.state.value)}
    >
      {children}
    </Select>
  );
};

const subscribedNow = (list: List) => {
  const { subscribed } = list.subscriptions;

  if (subscribed === 0) {
    return `No one is subscribed to ${list.name} yet. You can save the draft, but it can’t be sent until someone is.`;
  }

  return subscribed === 1
    ? "1 contact is subscribed to it now."
    : `${formatCount(subscribed)} contacts are subscribed to it now.`;
};

const ContentField = ({
  field,
  onTab,
  tab,
}: {
  field: AnyFieldApi;
  onTab: (tab: Tab) => void;
  tab: Tab;
}) => {
  const { message, submissions } = useFieldError(field);
  const id = useId();
  const hintId = useId();
  const html = String(field.state.value);
  const bytes = campaignHtmlBytes(html);
  const tooLong = bytes > MAX_CAMPAIGN_HTML_BYTES;
  const kilobytes = html === "" ? 0 : Math.ceil(bytes / KIB);
  const invalid = message !== undefined;

  const hint =
    tab === "html"
      ? "Paste the whole email from your editor. Mailquilt sends it exactly as it is."
      : "As the email arrives. Links in the preview don’t open.";

  let content = (
    <EmailPreview className="h-[22rem] max-sm:h-[18rem]" html={html} />
  );

  if (tab === "html") {
    content = (
      <Textarea
        aria-describedby={hintId}
        aria-invalid={invalid}
        className={`h-[22rem] w-full resize-y font-mono text-sm leading-5 max-sm:h-[18rem] max-sm:text-lg max-sm:leading-6 pointer-coarse:text-lg ${invalid ? "!ring-kumo-danger" : ""}`}
        id={id}
        name={field.name}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
        placeholder="<!doctype html>"
        spellCheck={false}
        value={html}
        variant={invalid ? "error" : "default"}
      />
    );
  } else if (html.trim() === "") {
    content = (
      <div className="flex h-[22rem] items-center justify-center rounded-xl bg-kumo-recessed p-6 text-center text-sm text-pretty text-kumo-subtle ring ring-kumo-hairline max-sm:h-[18rem]">
        Paste the email’s HTML on the HTML tab to see it here.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-end justify-between gap-3">
        {tab === "html" ? (
          <label
            className="text-base font-medium text-kumo-default"
            htmlFor={id}
          >
            Content
          </label>
        ) : (
          <span className="text-base font-medium text-kumo-default">
            Content
          </span>
        )}
        <Tabs
          indicatorClassName="transition-none"
          onValueChange={(value) =>
            onTab(value === "preview" ? "preview" : "html")
          }
          size="sm"
          tabs={[
            { label: "HTML", value: "html" },
            { label: "Preview", value: "preview" },
          ]}
          value={tab}
          variant="segmented"
        />
      </div>
      {content}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        {invalid ? (
          <p
            className="min-w-[14rem] flex-1 text-sm leading-snug text-pretty text-kumo-danger"
            id={hintId}
            key={submissions}
            role="alert"
          >
            {message}
          </p>
        ) : (
          <p
            className="min-w-[14rem] flex-1 text-sm leading-snug text-pretty text-kumo-subtle"
            id={hintId}
          >
            {hint}
          </p>
        )}
        <p
          className={`shrink-0 text-sm leading-snug tabular-nums ${tooLong ? "text-kumo-danger" : "text-kumo-subtle"}`}
        >
          {formatCount(kilobytes)} KB of {MAX_CAMPAIGN_HTML_BYTES / KIB} KB
        </p>
      </div>
    </div>
  );
};

/**
 * A Campaign's draft: the List it goes to, the Provider Connection it goes
 * through and who it's from, its subject and its HTML, with a preview. With
 * one List or one connection, it's chosen already; choosing a connection
 * fills in who it's from. Fields are checked with the same schemas the API
 * uses.
 */
export const CampaignForm = ({
  busy,
  busyLabel,
  campaign,
  cancelHref,
  connections,
  failureMessage,
  lists,
  onSubmit,
  submitLabel,
}: {
  busy: boolean;
  /** The submit button's label while saving, such as "Saving draft…". */
  busyLabel: string;
  /** The draft being edited; a new one without it. */
  campaign?: Campaign;
  cancelHref: string;
  connections: readonly ProviderConnection[];
  failureMessage: string | undefined;
  lists: readonly List[];
  onSubmit: (draft: typeof CampaignDraft.Type) => void;
  submitLabel: string;
}) => {
  const [tab, setTab] = useState<Tab>("html");

  const form = useForm({
    defaultValues: defaultsFor(lists, connections, campaign),
    onSubmit: ({ value }) => {
      if (!busy) {
        onSubmit(draftFrom(decodeValues(value)));
      }
    },
    // WARNING: the HTML's error and its field show only on the HTML tab, and focus moves to the first field with an error once this returns, so the tab must be drawn before then.
    onSubmitInvalid: ({ formApi }) => {
      if ((formApi.getFieldMeta("html")?.errors.length ?? 0) > 0) {
        flushSync(() => setTab("html"));
      }
    },
  });

  const listId = useStore(form.store, (state) => state.values.listId);

  const connectionId = useStore(
    form.store,
    (state) => state.values.providerConnectionId
  );

  const list = lists.find((candidate) => candidate.id === listId);

  const connection = connections.find(
    (candidate) => candidate.id === connectionId
  );

  return (
    <form
      className="flex flex-col"
      noValidate
      onSubmit={(event) => submitForm(event, form)}
    >
      <SettingsSection
        about="Everyone subscribed to the list at the moment you send. Pending and unsubscribed contacts don’t get it."
        title="Who gets it"
      >
        <form.Field name="listId" validators={CHECKS.listId}>
          {(field) => (
            <ChoiceField
              description={list === undefined ? undefined : subscribedNow(list)}
              field={field}
              label="List"
              placeholder="Choose a list"
              valueLabel={list?.name}
            >
              {lists.map((candidate) => (
                <Select.Option
                  className="mq-count-option *:first:min-w-0 *:first:flex-1"
                  key={candidate.id}
                  value={candidate.id}
                >
                  <span className="flex w-full justify-between gap-6">
                    <span className="wrap-anywhere">{candidate.name}</span>
                    <span className="whitespace-nowrap text-kumo-subtle tabular-nums">
                      {formatCount(candidate.subscriptions.subscribed)}{" "}
                      subscribed
                    </span>
                  </span>
                </Select.Option>
              ))}
            </ChoiceField>
          )}
        </form.Field>
      </SettingsSection>
      <SettingsSection
        about="The provider connection it goes out through, and who it says it’s from. Your provider must allow the from email."
        title="From"
      >
        <form.Field
          listeners={{
            onChange: ({ value }) => {
              const chosen = connections.find(
                (candidate) => candidate.id === value
              );

              if (chosen !== undefined) {
                form.setFieldValue("fromName", chosen.from.name ?? "");
                form.setFieldValue("fromEmail", chosen.from.email);
              }
            },
          }}
          name="providerConnectionId"
          validators={CHECKS.providerConnectionId}
        >
          {(field) => (
            <ChoiceField
              description={
                connection === undefined
                  ? undefined
                  : `It sends as ${connection.from.email} unless you change the from email below.`
              }
              field={field}
              label="Provider connection"
              placeholder="Choose a connection"
              valueLabel={connection?.name}
            >
              {connections.map((candidate) => (
                <Select.Option
                  className="wrap-anywhere"
                  key={candidate.id}
                  value={candidate.id}
                >
                  {candidate.name}
                </Select.Option>
              ))}
            </ChoiceField>
          )}
        </form.Field>
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
              description={
                connection === undefined ? (
                  "Filled in from the connection you choose."
                ) : (
                  <span className="wrap-anywhere">
                    Filled in from {connection.name}. A change here is for this
                    campaign only.
                  </span>
                )
              }
              field={field}
              inputMode="email"
              label="From email"
              placeholder="news@example.com"
              size="base"
              type="email"
            />
          )}
        </form.Field>
        <form.Field name="replyTo" validators={CHECKS.replyTo}>
          {(field) => (
            <FormField
              autoComplete="off"
              className={FIELD}
              description="Where replies go. Leave it empty and they go to the from email."
              field={field}
              inputMode="email"
              label="Reply-to email (optional)"
              placeholder="hello@example.com"
              size="base"
              type="email"
            />
          )}
        </form.Field>
      </SettingsSection>
      <SettingsSection
        about="The subject line, and the HTML from the editor you design in."
        title="Email"
      >
        <form.Field name="subject" validators={CHECKS.subject}>
          {(field) => (
            <FormField
              autoComplete="off"
              className={FIELD}
              field={field}
              label="Subject"
              size="base"
            />
          )}
        </form.Field>
        <form.Field name="html" validators={CHECKS.html}>
          {(field) => <ContentField field={field} onTab={setTab} tab={tab} />}
        </form.Field>
        {failureMessage === undefined ? null : (
          <Banner role="alert" title={failureMessage} variant="error" />
        )}
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
          <LinkButton href={cancelHref} variant="secondary">
            Cancel
          </LinkButton>
          <Button aria-busy={busy} type="submit" variant="primary">
            {busy ? busyLabel : submitLabel}
          </Button>
        </div>
      </SettingsSection>
    </form>
  );
};
