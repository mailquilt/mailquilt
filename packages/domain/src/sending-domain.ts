import { Schema, SchemaTransformation } from "effect";

import { SendingDomainIdSchema } from "./ids.ts";

const MAX_DOMAIN_LENGTH = 253;

const MAX_SELECTOR_LENGTH = 63;

/** The most DKIM selectors a Sending Domain can have: SES gives three. */
export const MAX_DKIM_SELECTORS = 5;

// WARNING: ASCII only, as email addresses are; a domain with other letters is written in its `xn--` form. The last label starts with a letter, so an IP address is refused. Either case passes, so a typed client can send one as typed; decoding lowercases it.
const DOMAIN_NAME =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/iu;

const SELECTOR_LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";

const DKIM_SELECTOR = new RegExp(
  `^${SELECTOR_LABEL}(?:\\.${SELECTOR_LABEL})*$`,
  "iu"
);

/**
 * A domain name, such as `example.com` or `mail.example.com`. Spaces around
 * it are trimmed, and it's lowercased, since DNS ignores case.
 */
export const DomainName = Schema.Trim.pipe(
  Schema.decodeTo(
    Schema.String.check(
      Schema.isNonEmpty({ message: "Enter a domain." }),
      Schema.isMaxLength(MAX_DOMAIN_LENGTH, {
        message: `Use at most ${MAX_DOMAIN_LENGTH} characters.`,
      }),
      Schema.isPattern(DOMAIN_NAME, {
        message: "Enter a domain like example.com.",
      })
    ),
    SchemaTransformation.toLowerCase()
  )
);

/**
 * The selector a Provider publishes a DKIM key under, at
 * `<selector>._domainkey.<domain>`, such as `s1` or one of SES's three
 * tokens. Spaces around it are trimmed, and it's lowercased.
 */
export const DkimSelector = Schema.Trim.pipe(
  Schema.decodeTo(
    Schema.String.check(
      Schema.isNonEmpty({ message: "Enter a selector." }),
      Schema.isMaxLength(MAX_SELECTOR_LENGTH, {
        message: `Use at most ${MAX_SELECTOR_LENGTH} characters.`,
      }),
      Schema.isPattern(DKIM_SELECTOR, {
        message: "Enter only the selector, the part before ._domainkey.",
      })
    ),
    SchemaTransformation.toLowerCase()
  )
);

/** A Sending Domain's DKIM selectors: at least one, each once. */
export const DkimSelectors = Schema.NonEmptyArray(DkimSelector).check(
  Schema.isMaxLength(MAX_DKIM_SELECTORS, {
    message: `Enter at most ${MAX_DKIM_SELECTORS} selectors.`,
  }),
  Schema.isUnique({ message: "Enter each selector once." })
);

/**
 * How one DKIM selector checked: `missing` has no DKIM record, `revoked`
 * has one with an empty key, and `invalid` has records that aren't a DKIM
 * key. Any of them fails, and blocks sending.
 */
export const DkimCheck = Schema.Struct({
  selector: DkimSelector,
  name: Schema.String,
  status: Schema.Literals(["pass", "fail"]),
  problem: Schema.NullOr(Schema.Literals(["missing", "revoked", "invalid"])),
});

/**
 * How the domain's DMARC record checked. `name` is where it was found, or
 * where it was looked for first when there's none. `missing` and `invalid`
 * (several records, or no valid policy) fail and block sending; a policy of
 * `none` only warns. `policy` is what applies to this domain: a parent
 * domain's record applies its subdomain policy, if it has one.
 */
export const DmarcCheck = Schema.Struct({
  name: Schema.String,
  status: Schema.Literals(["pass", "warn", "fail"]),
  problem: Schema.NullOr(
    Schema.Literals(["missing", "invalid", "policy-none"])
  ),
  record: Schema.NullOr(Schema.String),
  policy: Schema.NullOr(Schema.Literals(["none", "quarantine", "reject"])),
});

/**
 * How SPF checked on the return path, or on the domain itself when it has
 * none: `missing` has no SPF record and `several` has more than one, which
 * receivers treat as an error. Either only warns.
 */
export const SpfCheck = Schema.Struct({
  name: Schema.String,
  status: Schema.Literals(["pass", "warn"]),
  problem: Schema.NullOr(Schema.Literals(["missing", "several"])),
  record: Schema.NullOr(Schema.String),
});

/**
 * How the return path checked: `aligned` when it's the domain or under it,
 * so SPF counts toward DMARC (the domain itself only, under a strict `aspf`),
 * and `hasMx` when it can receive the bounces sent back to it. Either
 * missing only warns.
 */
export const ReturnPathCheck = Schema.Struct({
  name: Schema.String,
  status: Schema.Literals(["pass", "warn"]),
  aligned: Schema.Boolean,
  hasMx: Schema.Boolean,
});

/**
 * What a Sending Domain's DNS showed when it was last checked. `status` is
 * `blocked` when a DKIM selector or DMARC fails, so a Campaign can't be sent
 * from it, `warning` when only weaker problems were found, and `ready`
 * otherwise. `returnPath` is null when the domain has none.
 */
export const SendingDomainCheck = Schema.Struct({
  checkedAt: Schema.DateTimeUtc,
  status: Schema.Literals(["ready", "warning", "blocked"]),
  dkim: Schema.NonEmptyArray(DkimCheck),
  dmarc: DmarcCheck,
  spf: SpfCheck,
  returnPath: Schema.NullOr(ReturnPathCheck),
});

/**
 * A domain an Organization sends email from, with the DKIM selectors its
 * Provider signs under, the return path its Provider sends bounces to, if
 * it set one, and what its DNS showed when last checked, or null before the
 * first check.
 */
export class SendingDomain extends Schema.Class<SendingDomain>("SendingDomain")(
  {
    id: SendingDomainIdSchema,
    domain: DomainName,
    dkimSelectors: DkimSelectors,
    returnPath: Schema.NullOr(DomainName),
    check: Schema.NullOr(SendingDomainCheck),
    createdAt: Schema.DateTimeUtc,
  }
) {}

/** What a new Sending Domain is made from. Without `returnPath`, it has none. */
export const NewSendingDomain = Schema.Struct({
  domain: DomainName,
  dkimSelectors: DkimSelectors,
  returnPath: Schema.optionalKey(DomainName),
});
