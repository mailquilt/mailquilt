import { Banner, Button, LinkButton } from "@cloudflare/kumo";
import type { Organization } from "@repo/domain";
import {
  DkimSelector,
  DomainName,
  MAX_DKIM_SELECTORS,
  SendingDomainAlreadyExists,
} from "@repo/domain";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { Predicate, Schema } from "effect";
import { useRef } from "react";
import { flushSync } from "react-dom";

import { FormField } from "../forms/form-field.tsx";
import { submitForm } from "../forms/submit-form.ts";
import { PlusIcon, TrashIcon } from "../icons/icons.tsx";
import { PageFrame } from "../layout/page-frame.tsx";
import { PageHeader } from "../layout/page-header.tsx";
import { SettingsSection } from "../layout/settings-section.tsx";
import { ICON_BUTTON } from "./domain-status.tsx";
import { useAddSendingDomain } from "./domains-api.ts";

const FIELD = "w-full max-sm:h-11 pointer-coarse:h-11";

const DOMAIN_CHECK = Schema.toStandardSchemaV1(DomainName);

const SELECTOR_CHECK = Schema.toStandardSchemaV1(DkimSelector);

const decodeDomain = Schema.decodeSync(DomainName);

const decodeSelector = Schema.decodeSync(DkimSelector);

const firstIssue = (
  check: typeof DOMAIN_CHECK | typeof SELECTOR_CHECK,
  value: string
) => {
  const result = check["~standard"].validate(value);

  if (result instanceof Promise || result.issues === undefined) {
    return;
  }

  return result.issues.at(0);
};

const selectorIssue = (value: string, selectors: readonly string[]) => {
  const issue = firstIssue(SELECTOR_CHECK, value);

  if (issue !== undefined) {
    return issue;
  }

  const same = selectors.filter(
    (other) => other.trim().toLowerCase() === value.trim().toLowerCase()
  );

  return same.length > 1 ? { message: "Enter each selector once." } : undefined;
};

const failureOf = (failure: Error | null, domain: string) => {
  if (failure === null) {
    return;
  }

  if (failure instanceof SendingDomainAlreadyExists) {
    return `${domain} is already added. Open it from Domains to see its records.`;
  }

  return Predicate.isTagged(failure, "SignInRequired")
    ? "You’ve been signed out. Sign in again, then add it."
    : "Mailquilt couldn’t add the domain. Check your connection, then try again.";
};

/**
 * Adds a Sending Domain, with the DKIM selectors its Provider gave and an
 * optional return path, then opens its page, which checks it. `domain`
 * starts it filled in, from a draft's page.
 */
export const AddDomainPage = ({
  domain,
  organization,
}: {
  domain?: string;
  organization: Organization;
}) => {
  const add = useAddSendingDomain(organization.id);
  const navigate = useNavigate();
  const selectorList = useRef<HTMLFieldSetElement>(null);

  // WARNING: adding the last selector allowed takes away Add another selector, and removing one takes its own button, so focus moves to the selector added or the one before it, once it's drawn.
  const focusSelector = (index: number) => {
    const inputs =
      selectorList.current?.querySelectorAll<HTMLInputElement>("input");

    inputs?.[index]?.focus();
  };

  const form = useForm({
    defaultValues: {
      domain: domain ?? "",
      returnPath: "",
      selectors: [""],
    },
    onSubmit: ({ value }) => {
      if (add.isPending) {
        return;
      }

      const returnPath = value.returnPath.trim();

      const toAdd = {
        dkimSelectors: [
          decodeSelector(value.selectors[0] ?? ""),
          ...value.selectors
            .slice(1)
            .map((selector) => decodeSelector(selector)),
        ] as const,
        domain: decodeDomain(value.domain),
      };

      add.mutate(
        returnPath === ""
          ? toAdd
          : { ...toAdd, returnPath: decodeDomain(returnPath) },
        {
          onSuccess: (added) =>
            navigate({
              params: { sendingDomainId: added.id },
              to: "/domains/$sendingDomainId",
            }),
        }
      );
    },
  });

  return (
    <PageFrame>
      <div className="mq-capped">
        <PageHeader
          crumbs={[{ href: "/domains", label: "Domains" }]}
          description={
            domain === undefined
              ? "Mailquilt shows the DNS records it needs, and checks them as soon as it’s added."
              : `Your draft is from an address at ${domain}. Add it, and Mailquilt shows the DNS records it needs and checks them.`
          }
          title="Add a domain"
        />
      </div>
      <form
        className="flex flex-col"
        noValidate
        onSubmit={(event) => submitForm(event, form)}
      >
        <SettingsSection
          about="The part after @ in the address your Campaigns are sent from."
          title="Domain"
        >
          <form.Field
            name="domain"
            validators={{
              onSubmit: ({ value }) => firstIssue(DOMAIN_CHECK, value),
            }}
          >
            {(field) => (
              <FormField
                autoCapitalize="none"
                autoComplete="off"
                className={FIELD}
                description="Such as example.com, or news.example.com for a subdomain."
                field={field}
                inputMode="url"
                label="Domain"
                placeholder="example.com"
                size="base"
                spellCheck={false}
              />
            )}
          </form.Field>
        </SettingsSection>
        <SettingsSection
          about="Your provider signs your email with keys it publishes in your DNS, each under a selector. Amazon SES shows three on the domain’s identity, under DomainKeys Identified Mail; most others show one."
          title="DKIM selectors"
        >
          <form.Field mode="array" name="selectors">
            {(selectors) => (
              <fieldset
                className="flex min-w-0 flex-col gap-3"
                ref={selectorList}
              >
                <legend className="sr-only">DKIM selectors</legend>
                {selectors.state.value.map((_, index) => (
                  <div
                    className="flex items-start gap-2"
                    // oxlint-disable-next-line no-array-index-key -- TanStack Form names array fields by position, so the position is the field's identity.
                    key={index}
                  >
                    <div className="min-w-0 flex-1">
                      <form.Field
                        name={`selectors[${index}]`}
                        validators={{
                          onSubmit: ({ fieldApi, value }) =>
                            selectorIssue(
                              value,
                              fieldApi.form.state.values.selectors
                            ),
                        }}
                      >
                        {(field) => (
                          <FormField
                            autoCapitalize="none"
                            autoComplete="off"
                            className={`${FIELD} font-mono`}
                            description={
                              index === 0
                                ? "Only the part before ._domainkey."
                                : undefined
                            }
                            field={field}
                            label={`Selector ${index + 1}`}
                            size="base"
                            spellCheck={false}
                          />
                        )}
                      </form.Field>
                    </div>
                    {index === 0 ? null : (
                      <button
                        aria-label={`Remove selector ${index + 1}`}
                        className={`${ICON_BUTTON} mt-7 size-9`}
                        onClick={() => {
                          flushSync(() => selectors.removeValue(index));
                          focusSelector(index - 1);
                        }}
                        type="button"
                      >
                        <TrashIcon aria-hidden="true" className="size-4" />
                      </button>
                    )}
                  </div>
                ))}
                {selectors.state.value.length < MAX_DKIM_SELECTORS ? (
                  <Button
                    className="w-fit"
                    icon={PlusIcon}
                    onClick={() => {
                      const added = selectors.state.value.length;

                      flushSync(() => selectors.pushValue(""));
                      focusSelector(added);
                    }}
                    variant="secondary"
                  >
                    Add another selector
                  </Button>
                ) : (
                  <p className="text-sm text-kumo-subtle">
                    A domain can have up to {MAX_DKIM_SELECTORS} selectors.
                  </p>
                )}
              </fieldset>
            )}
          </form.Field>
        </SettingsSection>
        <SettingsSection
          about="Where your provider sends bounces back to, which Amazon SES calls a custom MAIL FROM domain. With one under this domain, SPF counts toward DMARC too. Leave it empty if your provider hasn’t given you one."
          title="Return path"
        >
          <form.Field
            name="returnPath"
            validators={{
              onSubmit: ({ value }) =>
                value.trim() === ""
                  ? undefined
                  : firstIssue(DOMAIN_CHECK, value),
            }}
          >
            {(field) => (
              <FormField
                autoCapitalize="none"
                autoComplete="off"
                className={FIELD}
                description="Such as mail.example.com."
                field={field}
                inputMode="url"
                label="Return path domain (optional)"
                placeholder="mail.example.com"
                size="base"
                spellCheck={false}
              />
            )}
          </form.Field>
          {add.error === null ? null : (
            <Banner
              role="alert"
              title={failureOf(add.error, form.state.values.domain.trim())}
              variant="error"
            />
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
                    Fix {errors} {errors === 1 ? "field" : "fields"} to add the
                    domain.
                  </p>
                )
              }
            </form.Subscribe>
            <LinkButton href="/domains" variant="secondary">
              Cancel
            </LinkButton>
            <Button aria-busy={add.isPending} type="submit" variant="primary">
              {add.isPending ? "Adding…" : "Add domain"}
            </Button>
          </div>
        </SettingsSection>
      </form>
    </PageFrame>
  );
};
