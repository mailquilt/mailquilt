import type { ProviderConnection, SendingDomain } from "@repo/domain";
import { DateTime } from "effect";

import { formatDay } from "../audience/format.ts";

/** One record's result: passes, warns, is missing or wrong, or hasn't been checked yet. */
export type Mark = "pass" | "warn" | "fail" | "pending";

/** The three things a Sending Domain needs, in the order they're set up. */
export type RecordGroup = "dkim" | "dmarc" | "spf";

/** A DNS record a Sending Domain needs, and what its last check found there. */
export interface DnsRecordRow {
  readonly key: string;
  readonly group: RecordGroup;
  readonly type: string;
  readonly name: string;
  /** The exact value to publish, when Mailquilt knows it. */
  readonly value?: string;
  /** What to publish instead, when only the Provider knows the value. */
  readonly valueFrom?: string;
  readonly mark: Mark;
  /** What it is, in words for a screen reader's list of copy buttons: "DKIM key 2", "DMARC record". */
  readonly label: string;
  /** A record that's there but isn't right, rather than missing. */
  readonly wrong?: boolean;
  /** What the check found, in words. */
  readonly found: string;
}

/** What a Sending Domain's status is, as the dashboard shows it. */
export type DomainStatus = "ready" | "warning" | "blocked" | "unchecked";

/** The DMARC record Mailquilt suggests: one that asks inboxes to quarantine what fails. */
export const SUGGESTED_DMARC = "v=DMARC1; p=quarantine";

const DKIM_FOUND = {
  invalid: "The record here isn’t a DKIM key.",
  missing: "No record here yet.",
  revoked: "The key here is empty, which means it was revoked.",
} as const;

/** The domain of an email address, lowercased. */
export const domainOf = (email: string) =>
  email.slice(email.lastIndexOf("@") + 1).toLowerCase();

/**
 * The SES connection that sends from the domain, if any: then Mailquilt
 * knows SES's own values for its records (Easy DKIM's CNAME targets, SPF,
 * and the MX for its Region).
 */
export const sesConnectionFor = (
  domain: SendingDomain,
  connections: readonly ProviderConnection[]
) =>
  connections.find(
    (connection) =>
      connection.provider === "ses" &&
      domainOf(connection.from.email) === domain.domain
  );

const dkimRows = (domain: SendingDomain, ses: ProviderConnection | undefined) =>
  domain.dkimSelectors.map((selector, index) => {
    const result = domain.check?.dkim.find(
      (dkim) => dkim.selector === selector
    );

    let mark: Mark = "pending";
    let found = "";
    let wrong = false;

    if (result?.status === "pass") {
      mark = "pass";
      found = "Its key is published.";
    } else if (result !== undefined) {
      mark = "fail";
      found = DKIM_FOUND[result.problem ?? "missing"];
      wrong = result.problem === "revoked" || result.problem === "invalid";
    }

    return {
      found,
      label:
        domain.dkimSelectors.length === 1
          ? "DKIM key"
          : `DKIM key ${index + 1}`,
      wrong,
      group: "dkim",
      key: `dkim-${selector}`,
      mark,
      name: `${selector}._domainkey.${domain.domain}`,
      ...(ses === undefined
        ? {
            type: "CNAME or TXT",
            valueFrom: "The value your provider gave you for this selector",
          }
        : { type: "CNAME", value: `${selector}.dkim.amazonses.com` }),
    } satisfies DnsRecordRow;
  });

const dmarcRow = (domain: SendingDomain) => {
  const { check } = domain;
  const own = `_dmarc.${domain.domain}`;

  const base = {
    group: "dmarc",
    key: "dmarc",
    label: "DMARC record",
    name: own,
    type: "TXT",
    value: SUGGESTED_DMARC,
  } as const;

  if (check === null) {
    return {
      ...base,
      found: "",
      mark: "pending",
    } satisfies DnsRecordRow;
  }

  const { dmarc } = check;

  if (dmarc.problem === "missing") {
    return {
      ...base,
      found: `No DMARC record on ${domain.domain}${domain.domain.split(".").length > 2 ? " or the domains above it" : ""}.`,
      mark: "fail",
    } satisfies DnsRecordRow;
  }

  const elsewhere = dmarc.name === own ? "" : ` on ${dmarc.name}`;

  if (dmarc.problem === "invalid") {
    return {
      ...base,
      found: `There’s more than one DMARC record${elsewhere}, or it has no valid policy. Keep one, with a policy of quarantine or reject.`,
      mark: "fail",
      wrong: true,
      name: dmarc.name,
    } satisfies DnsRecordRow;
  }

  if (dmarc.problem === "policy-none") {
    return {
      ...base,
      found: `Found${elsewhere}, with a policy of none: inboxes are asked to do nothing with email that fails. Gmail and Yahoo accept it, but quarantine protects your domain from people sending as you.`,
      mark: "warn",
      name: dmarc.name,
    } satisfies DnsRecordRow;
  }

  return {
    ...base,
    found: `Found${elsewhere}: ${dmarc.record ?? ""}`,
    mark: "pass",
    name: dmarc.name,
  } satisfies DnsRecordRow;
};

const spfFound = (domain: SendingDomain) => {
  const spf = domain.check?.spf;
  const returnPath = domain.check?.returnPath;

  if (spf === undefined) {
    return { found: "", mark: "pending" as const };
  }

  if (spf.problem === "missing") {
    return { found: "No SPF record here.", mark: "warn" as const };
  }

  if (spf.problem === "several") {
    return {
      found:
        "There’s more than one SPF record here, which inboxes treat as an error. Merge them into one.",
      mark: "warn" as const,
    };
  }

  if (returnPath?.aligned === false) {
    return {
      found: `It isn’t under ${domain.domain}, so SPF doesn’t count toward DMARC.`,
      mark: "warn" as const,
    };
  }

  return { found: `Found: ${spf.record ?? ""}`, mark: "pass" as const };
};

const mxFound = (hasMx: boolean | undefined) => {
  if (hasMx === undefined) {
    return { found: "", mark: "pending" } as const;
  }

  return hasMx
    ? ({ found: "Found.", mark: "pass" } as const)
    : ({
        found: "No MX record here, so bounces sent to it are lost.",
        mark: "warn",
      } as const);
};

const spfRows = (
  domain: SendingDomain,
  ses: ProviderConnection | undefined
) => {
  const name = domain.returnPath ?? domain.domain;
  const region = ses?.provider === "ses" ? ses.ses.region : undefined;

  const spf = {
    ...spfFound(domain),
    group: "spf",
    key: "spf",
    label: "SPF record",
    name,
    type: "TXT",
    ...(ses === undefined
      ? { valueFrom: "The SPF record your provider gave you" }
      : { value: "v=spf1 include:amazonses.com ~all" }),
  } satisfies DnsRecordRow;

  if (domain.returnPath === null) {
    return [spf];
  }

  const mx = mxFound(domain.check?.returnPath?.hasMx);

  return [
    spf,
    {
      ...mx,
      group: "spf",
      key: "mx",
      label: "MX record",
      name,
      type: "MX",
      ...(region === undefined
        ? { valueFrom: "The MX record your provider gave you" }
        : { value: `10 feedback-smtp.${region}.amazonses.com` }),
    } satisfies DnsRecordRow,
  ];
};

/** Every record a Sending Domain needs, in setup order, each with what its last check found. */
export const recordsOf = (
  domain: SendingDomain,
  connections: readonly ProviderConnection[]
) => {
  const ses = sesConnectionFor(domain, connections);

  return [...dkimRows(domain, ses), dmarcRow(domain), ...spfRows(domain, ses)];
};

/** A Sending Domain's status, from its last check. */
export const statusOf = (domain: SendingDomain) =>
  (domain.check?.status ?? "unchecked") satisfies DomainStatus;

/** How many of a domain's records only warn. */
export const warningsIn = (records: readonly DnsRecordRow[]) =>
  records.filter((record) => record.mark === "warn").length;

/** What stops a domain sending, in a few words, for the list: the records that fail. */
export const blockedBy = (records: readonly DnsRecordRow[]) => {
  const dkim = records.filter(
    (record) => record.group === "dkim" && record.mark === "fail"
  ).length;

  const dmarc = records.some(
    (record) => record.group === "dmarc" && record.mark === "fail"
  );

  const parts = [
    ...(dkim === 0
      ? []
      : [`${dkim} DKIM ${dkim === 1 ? "record" : "records"}`]),
    ...(dmarc ? ["DMARC"] : []),
  ];

  return parts.join(" and ");
};

const MINUTE_MS = 60_000;

const HOUR_MINUTES = 60;

/** When a check ran, as words after "Checked": "just now", "4 minutes ago", "at 10:42", "on Nov 26". */
export const checkedWhen = (at: DateTime.Utc, now: DateTime.Utc) => {
  const minutes = Math.floor(
    (DateTime.toEpochMillis(now) - DateTime.toEpochMillis(at)) / MINUTE_MS
  );

  if (minutes < 1) {
    return "just now";
  }

  if (minutes < HOUR_MINUTES) {
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  }

  const day = DateTime.toDate(at);

  if (day.toDateString() === DateTime.toDate(now).toDateString()) {
    return `at ${day.toLocaleTimeString("en", { hour: "numeric", hourCycle: "h23", minute: "2-digit" })}`;
  }

  return `on ${formatDay(at)}`;
};

const WARNING_WORDS = new Map([
  ["dmarc", "DMARC’s policy is none"],
  ["mx", "The return path has no MX record"],
  ["spf", "SPF needs a look"],
]);

/** What a domain's status comes down to, in a few words, for the Domains table. */
export const summaryOf = (
  domain: SendingDomain,
  records: readonly DnsRecordRow[]
) => {
  const status = statusOf(domain);

  if (status === "unchecked") {
    return "Open it to check its DNS records";
  }

  if (status === "blocked") {
    return `Fix ${blockedBy(records)}`;
  }

  if (status === "warning") {
    return records
      .flatMap((record) =>
        record.mark === "warn"
          ? [WARNING_WORDS.get(record.key) ?? record.found]
          : []
      )
      .join(". ");
  }

  return "Every record passes";
};
