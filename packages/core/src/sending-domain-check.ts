import type {
  DkimCheck,
  DmarcCheck,
  ReturnPathCheck,
  SendingDomainCheck,
  SpfCheck,
} from "@repo/domain";
import { DnsLookupFailed } from "@repo/domain";
import { DateTime, Effect } from "effect";
import { Dns } from "effect/net";

/** What a Sending Domain's DNS is checked for. */
export interface SendingDomainToCheck {
  readonly domain: string;
  readonly dkimSelectors: readonly [string, ...string[]];
  readonly returnPath: string | null;
}

// WARNING: DMARCbis looks up at most 8 names, so a long domain jumps from itself to its last 7 labels; each lookup is a subrequest on Workers.
const MAX_DMARC_LABELS = 7;

const DMARC_RECORD = /^v\s*=\s*DMARC1\s*(?:;|$)/iu;

const SPF_RECORD = /^v=spf1(?:\s|$)/iu;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/u;

const WHITESPACE = /\s+/gu;

// WARNING: an MX record naming the root (RFC 7505's null MX) says the domain takes no mail, so it can't receive bounces.
const NULL_MX = ".";

const POLICIES = ["none", "quarantine", "reject"] as const;

const DNS_FAILURES: Record<Dns.DnsErrorReason, string> = {
  BadName: "The name isn't one DNS can look up.",
  InvalidResponse: "The DNS server's answer couldn't be read.",
  NotFound: "The name has no records.",
  Refused: "The DNS server refused the lookup or couldn't be reached.",
  ServerFailure: "The DNS server failed to answer.",
  Temporary: "The DNS server failed to answer.",
  Timeout: "The DNS lookup timed out.",
  Unknown: "The DNS lookup failed.",
  Unsupported: "This deployment can't look up DNS records.",
};

const lookupFailed = (name: string) => (error: Dns.DnsError) =>
  error.reason === "NotFound"
    ? Effect.succeed([])
    : Effect.fail(
        new DnsLookupFailed({ detail: DNS_FAILURES[error.reason], name })
      );

const txtRecords = (name: string) =>
  Effect.gen(function* txtRecordsAt() {
    const dns = yield* Dns.Dns;

    return yield* dns.resolve(name, "TXT").pipe(
      Effect.map((records) => records.map((record) => record.chunks.join(""))),
      Effect.catchTag("DnsError", lookupFailed(name))
    );
  });

const hasMxRecords = (name: string) =>
  Effect.gen(function* mxRecordsAt() {
    const dns = yield* Dns.Dns;

    const exchanges = yield* dns.resolve(name, "MX").pipe(
      Effect.map((records) => records.map((record) => record.exchange)),
      Effect.catchTag("DnsError", lookupFailed(name))
    );

    return exchanges.some((exchange) => exchange !== NULL_MX);
  });

const tagPairsOf = (record: string) =>
  record.split(";").flatMap((part) => {
    const equals = part.indexOf("=");

    return equals === -1
      ? []
      : [
          [
            part.slice(0, equals).trim().toLowerCase(),
            part.slice(equals + 1).trim(),
          ] as const,
        ];
  });

const tagsOf = (record: string) => new Map(tagPairsOf(record));

// WARNING: RFC 6376 makes a DKIM record that repeats a tag invalid as a whole, so receivers discard it whichever value is a key.
const repeatsATag = (record: string) =>
  tagPairsOf(record).length !== tagsOf(record).size;

/**
 * Whether one DKIM selector's TXT records publish a key: `missing` with no
 * records, `revoked` when its only keys are empty, and `invalid` when none
 * of them is a DKIM key.
 */
export const dkimProblemOf = (records: readonly string[]) => {
  if (records.length === 0) {
    return "missing" as const;
  }

  const keys = records.flatMap((record) => {
    if (repeatsATag(record)) {
      return [];
    }

    const tags = tagsOf(record);
    const key = tags.get("p");
    const isDkim = (tags.get("v") ?? "DKIM1").toUpperCase() === "DKIM1";

    return key !== undefined && isDkim ? [key.replaceAll(WHITESPACE, "")] : [];
  });

  if (keys.some((key) => BASE64.test(key))) {
    return null;
  }

  return keys.includes("") ? ("revoked" as const) : ("invalid" as const);
};

const checkDkim = (domain: string, selector: string) =>
  Effect.gen(function* checkDkimSelector() {
    const name = `${selector}._domainkey.${domain}`;
    const problem = dkimProblemOf(yield* txtRecords(name));

    return {
      name,
      problem,
      selector,
      status: problem === null ? "pass" : "fail",
    } satisfies typeof DkimCheck.Type;
  });

/**
 * The names a domain's DMARC policy is looked for at, in order: its own,
 * then each parent's, short of the top-level domain (DMARCbis's tree walk).
 */
export const dmarcNamesFor = (domain: string) => {
  const labels = domain.split(".");
  const longest = Math.min(labels.length - 1, MAX_DMARC_LABELS);

  const parents = Array.from({ length: Math.max(longest - 1, 0) }, (_, index) =>
    labels.slice(-(longest - index)).join(".")
  );

  return [domain, ...parents].map((name) => `_dmarc.${name}`);
};

const policyOf = (value: string | undefined) => {
  const policy = value?.toLowerCase();

  return POLICIES.find((known) => known === policy);
};

/**
 * What the DMARC records found at `name` say for the domain: `ownDomain`
 * when they're the domain's own, else a parent's, whose subdomain policy
 * (`sp`) applies if it has one. Several records, no valid `p`, or an `sp`
 * that isn't valid, are `invalid`: receivers then apply no DMARC policy.
 */
export const dmarcCheckOf = (
  name: string,
  records: readonly string[],
  ownDomain: boolean
) => {
  const [record, ...others] = records;

  if (record === undefined || others.length > 0) {
    return {
      check: {
        name,
        policy: null,
        problem: record === undefined ? "missing" : "invalid",
        record: record === undefined ? null : records.join("\n"),
        status: "fail",
      } satisfies typeof DmarcCheck.Type,
      strictSpf: false,
    };
  }

  const tags = tagsOf(record);
  const domainPolicy = policyOf(tags.get("p"));

  const subdomainPolicy = tags.has("sp")
    ? policyOf(tags.get("sp"))
    : domainPolicy;

  const strictSpf = tags.get("aspf")?.toLowerCase() === "s";

  if (domainPolicy === undefined || subdomainPolicy === undefined) {
    return {
      check: {
        name,
        policy: null,
        problem: "invalid",
        record,
        status: "fail",
      } satisfies typeof DmarcCheck.Type,
      strictSpf,
    };
  }

  const policy = ownDomain ? domainPolicy : subdomainPolicy;

  return {
    check: {
      name,
      policy,
      problem: policy === "none" ? "policy-none" : null,
      record,
      status: policy === "none" ? "warn" : "pass",
    } satisfies typeof DmarcCheck.Type,
    strictSpf,
  };
};

const checkDmarc = (domain: string) =>
  Effect.gen(function* checkDmarcPolicy() {
    const names = dmarcNamesFor(domain);

    for (const [index, name] of names.entries()) {
      const records = (yield* txtRecords(name)).filter((record) =>
        DMARC_RECORD.test(record)
      );

      if (records.length > 0) {
        return dmarcCheckOf(name, records, index === 0);
      }
    }

    return dmarcCheckOf(names[0] ?? `_dmarc.${domain}`, [], true);
  });

/** How a name's TXT records publish SPF: `missing` with none, `several` with more than one. */
export const spfCheckOf = (name: string, records: readonly string[]) => {
  const spf = records.filter((record) => SPF_RECORD.test(record));
  const [record] = spf;

  if (record === undefined) {
    return {
      name,
      problem: "missing",
      record: null,
      status: "warn",
    } satisfies typeof SpfCheck.Type;
  }

  if (spf.length > 1) {
    return {
      name,
      problem: "several",
      record: spf.join("\n"),
      status: "warn",
    } satisfies typeof SpfCheck.Type;
  }

  return {
    name,
    problem: null,
    record,
    status: "pass",
  } satisfies typeof SpfCheck.Type;
};

/**
 * Whether bounces sent to `returnPath` count toward DMARC for `domain`: it's
 * the domain or under it, or only the domain itself when DMARC asks for
 * strict SPF alignment.
 */
export const returnPathAligned = (
  returnPath: string,
  domain: string,
  strictSpf: boolean
) => returnPath === domain || (!strictSpf && returnPath.endsWith(`.${domain}`));

const returnPathCheckOf = (
  domain: SendingDomainToCheck,
  strictSpf: boolean,
  hasMx: boolean
) => {
  if (domain.returnPath === null) {
    return null;
  }

  const aligned = returnPathAligned(
    domain.returnPath,
    domain.domain,
    strictSpf
  );

  return {
    aligned,
    hasMx,
    name: domain.returnPath,
    status: aligned && hasMx ? "pass" : "warn",
  } satisfies typeof ReturnPathCheck.Type;
};

/**
 * `blocked` when a DKIM selector or DMARC fails, `warning` when anything
 * else warns, and `ready` otherwise.
 */
export const sendingDomainStatusOf = (
  check: Omit<typeof SendingDomainCheck.Type, "checkedAt" | "status">
) => {
  if (
    check.dkim.some((selector) => selector.status === "fail") ||
    check.dmarc.status === "fail"
  ) {
    return "blocked" as const;
  }

  return check.dmarc.status === "warn" ||
    check.spf.status === "warn" ||
    check.returnPath?.status === "warn"
    ? ("warning" as const)
    : ("ready" as const);
};

/**
 * Checks a Sending Domain's DNS now: each DKIM selector's key, DMARC's
 * policy, SPF on the return path or else the domain, and the return path's
 * alignment and MX records. A name with no records is a result; a lookup
 * that fails, such as a timeout, fails the whole check.
 */
export const checkSendingDomainDns = (domain: SendingDomainToCheck) =>
  Effect.gen(function* checkDns() {
    const [firstSelector, ...otherSelectors] = domain.dkimSelectors;
    const spfName = domain.returnPath ?? domain.domain;

    // WARNING: lookups run one at a time, as some networks drop DNS queries sent at once over UDP and each lost one waits out its timeout.
    const { dkim, dmarc, spf, hasMx } = yield* Effect.all({
      dkim: Effect.all([
        checkDkim(domain.domain, firstSelector),
        ...otherSelectors.map((selector) => checkDkim(domain.domain, selector)),
      ]),
      dmarc: checkDmarc(domain.domain),
      hasMx:
        domain.returnPath === null
          ? Effect.succeed(false)
          : hasMxRecords(domain.returnPath),
      spf: txtRecords(spfName).pipe(
        Effect.map((records) => spfCheckOf(spfName, records))
      ),
    });

    const results = {
      dkim,
      dmarc: dmarc.check,
      returnPath: returnPathCheckOf(domain, dmarc.strictSpf, hasMx),
      spf,
    };

    return {
      ...results,
      checkedAt: yield* DateTime.now,
      status: sendingDomainStatusOf(results),
    } satisfies typeof SendingDomainCheck.Type;
  });
