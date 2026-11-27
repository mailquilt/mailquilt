import { assert, describe, it } from "@effect/vitest";
import { DnsLookupFailed } from "@repo/domain";
import { DateTime, Effect, Exit, Layer } from "effect";
import { Dns, Host } from "effect/net";
import { TestClock } from "effect/testing";

import {
  checkSendingDomainDns,
  dkimProblemOf,
  dmarcCheckOf,
  dmarcNamesFor,
  returnPathAligned,
  spfCheckOf,
} from "./sending-domain-check.ts";

const KEY = "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDwIRP/UC3SBsEmGqZ9ZJW3/DkM";

const txt = (...chunks: [string, ...string[]]) =>
  Dns.makeRecordUnsafe("TXT", { chunks });

const zone = (records: Record<string, readonly Dns.DnsRecord[]>) =>
  Dns.layerStatic({ records });

const ACME = {
  dkimSelectors: ["s1"],
  domain: "acme.example",
  returnPath: null,
} as const;

describe("whether a DKIM selector's records publish a key", () => {
  it.each([
    ["no records", [], "missing"],
    ["a DKIM key", [`v=DKIM1; k=rsa; p=${KEY}`], null],
    ["a key without a version", [`k=rsa; p=${KEY}`], null],
    [
      "a key folded across lines",
      [`v=DKIM1; p=${KEY.slice(0, 20)} ${KEY.slice(20)}`],
      null,
    ],
    ["only an empty key", ["v=DKIM1; k=rsa; p="], "revoked"],
    ["a record that isn't a key", ["v=spf1 -all"], "invalid"],
    ["another DKIM version", [`v=DKIM2; p=${KEY}`], "invalid"],
    ["a key that isn't base64", ["v=DKIM1; p=not a key!"], "invalid"],
  ] as const)("%s is %s", (_, records, problem) => {
    assert.strictEqual(dkimProblemOf(records), problem);
  });
});

describe("where a domain's DMARC policy is looked for", () => {
  it("looks at the domain, then each parent short of the top-level domain", () => {
    assert.deepStrictEqual(dmarcNamesFor("news.mail.example.com"), [
      "_dmarc.news.mail.example.com",
      "_dmarc.mail.example.com",
      "_dmarc.example.com",
    ]);
  });

  it("jumps from a long domain to its last seven labels", () => {
    assert.deepStrictEqual(dmarcNamesFor("a.b.c.d.e.f.g.h.i.example"), [
      "_dmarc.a.b.c.d.e.f.g.h.i.example",
      "_dmarc.d.e.f.g.h.i.example",
      "_dmarc.e.f.g.h.i.example",
      "_dmarc.f.g.h.i.example",
      "_dmarc.g.h.i.example",
      "_dmarc.h.i.example",
      "_dmarc.i.example",
    ]);
  });
});

describe("what a DMARC record says for a domain", () => {
  it.each([
    [
      "the domain's own reject",
      ["v=DMARC1; p=reject"],
      true,
      "pass",
      null,
      "reject",
    ],
    [
      "the domain's own none",
      ["v=DMARC1; p=none; rua=mailto:d@acme.example"],
      true,
      "warn",
      "policy-none",
      "none",
    ],
    [
      "the domain's own, ignoring its subdomain policy",
      ["v=DMARC1; p=reject; sp=none"],
      true,
      "pass",
      null,
      "reject",
    ],
    [
      "a parent's subdomain policy",
      ["v=DMARC1; p=reject; sp=none"],
      false,
      "warn",
      "policy-none",
      "none",
    ],
    [
      "a parent's policy without a subdomain policy",
      ["v=DMARC1; p=quarantine"],
      false,
      "pass",
      null,
      "quarantine",
    ],
    [
      "a parent's invalid subdomain policy, falling back to its own",
      ["v=DMARC1; p=reject; sp=bogus"],
      false,
      "pass",
      null,
      "reject",
    ],
    ["no records", [], true, "fail", "missing", null],
    [
      "several records",
      ["v=DMARC1; p=reject", "v=DMARC1; p=none"],
      true,
      "fail",
      "invalid",
      null,
    ],
    [
      "no policy",
      ["v=DMARC1; rua=mailto:d@acme.example"],
      true,
      "fail",
      "invalid",
      null,
    ],
    ["an unknown policy", ["v=DMARC1; p=block"], true, "fail", "invalid", null],
  ] as const)("%s", (_, records, ownDomain, status, problem, policy) => {
    const { check } = dmarcCheckOf("_dmarc.acme.example", records, ownDomain);

    assert.deepStrictEqual(
      { policy: check.policy, problem: check.problem, status: check.status },
      { policy, problem, status }
    );
  });

  it("reads strict SPF alignment", () => {
    assert.isTrue(
      dmarcCheckOf("_dmarc.acme.example", ["v=DMARC1; p=reject; aspf=s"], true)
        .strictSpf
    );
  });
});

describe("what a name's SPF records say", () => {
  it.each([
    ["no SPF record", ["google-site-verification=abc"], "warn", "missing"],
    ["one SPF record", ["v=spf1 include:amazonses.com ~all"], "pass", null],
    [
      "several SPF records",
      ["v=spf1 -all", "v=spf1 include:_spf.google.com ~all"],
      "warn",
      "several",
    ],
  ] as const)("%s", (_, records, status, problem) => {
    const check = spfCheckOf("acme.example", records);

    assert.deepStrictEqual(
      { problem: check.problem, status: check.status },
      { problem, status }
    );
  });
});

describe("whether a return path is aligned with its domain", () => {
  it.each([
    ["the domain itself", "acme.example", false, true],
    ["a subdomain", "bounce.acme.example", false, true],
    ["another domain", "amazonses.com", false, false],
    ["a domain that only ends the same", "notacme.example", false, false],
    ["a subdomain under strict alignment", "bounce.acme.example", true, false],
  ] as const)("%s", (_, returnPath, strict, aligned) => {
    assert.strictEqual(
      returnPathAligned(returnPath, "acme.example", strict),
      aligned
    );
  });
});

describe("checking a Sending Domain's DNS", () => {
  it.effect("is ready when every record is in place", () =>
    Effect.gen(function* readyDomain() {
      yield* TestClock.setTime(Date.parse("2026-11-27T10:00:00Z"));

      const check = yield* checkSendingDomainDns({
        dkimSelectors: ["s1", "s2"],
        domain: "acme.example",
        returnPath: "bounce.acme.example",
      }).pipe(
        Effect.provide(
          zone({
            "_dmarc.acme.example": [txt("v=DMARC1; p=quar", "antine")],
            "bounce.acme.example": [
              txt("v=spf1 include:amazonses.com ~all"),
              Dns.makeRecordUnsafe("MX", {
                exchange: Host.domainNameFromStringUnsafe(
                  "feedback-smtp.eu-west-1.amazonses.com."
                ),
                priority: 10,
              }),
            ],
            "s1._domainkey.acme.example": [txt(`v=DKIM1; p=${KEY}`)],
            "s2._domainkey.acme.example": [
              txt(`v=DKIM1; p=${KEY.slice(0, 30)}`, KEY.slice(30)),
            ],
          })
        )
      );

      assert.deepStrictEqual(check, {
        checkedAt: DateTime.makeUnsafe("2026-11-27T10:00:00Z"),
        dkim: [
          {
            name: "s1._domainkey.acme.example",
            problem: null,
            selector: "s1",
            status: "pass",
          },
          {
            name: "s2._domainkey.acme.example",
            problem: null,
            selector: "s2",
            status: "pass",
          },
        ],
        dmarc: {
          name: "_dmarc.acme.example",
          policy: "quarantine",
          problem: null,
          record: "v=DMARC1; p=quarantine",
          status: "pass",
        },
        returnPath: {
          aligned: true,
          hasMx: true,
          name: "bounce.acme.example",
          status: "pass",
        },
        spf: {
          name: "bounce.acme.example",
          problem: null,
          record: "v=spf1 include:amazonses.com ~all",
          status: "pass",
        },
        status: "ready",
      });
    }).pipe(Effect.provide(TestClock.layer()))
  );

  it.effect("is blocked when one DKIM selector has no key", () =>
    Effect.gen(function* missingSelector() {
      const check = yield* checkSendingDomainDns({
        ...ACME,
        dkimSelectors: ["s1", "s2"],
      }).pipe(
        Effect.provide(
          zone({
            "_dmarc.acme.example": [txt("v=DMARC1; p=reject")],
            "acme.example": [txt("v=spf1 -all")],
            "s1._domainkey.acme.example": [txt(`v=DKIM1; p=${KEY}`)],
          })
        )
      );

      assert.strictEqual(check.status, "blocked");
      assert.strictEqual(check.dkim[1]?.problem, "missing");
    })
  );

  it.effect("is blocked when no DMARC record is found up the tree", () =>
    Effect.gen(function* missingDmarc() {
      const check = yield* checkSendingDomainDns({
        ...ACME,
        domain: "news.acme.example",
      }).pipe(
        Effect.provide(
          zone({
            "_dmarc.news.acme.example": [txt("google-site-verification=x")],
            "news.acme.example": [txt("v=spf1 -all")],
            "s1._domainkey.news.acme.example": [txt(`v=DKIM1; p=${KEY}`)],
          })
        )
      );

      assert.strictEqual(check.status, "blocked");
      assert.strictEqual(check.dmarc.name, "_dmarc.news.acme.example");
      assert.strictEqual(check.dmarc.problem, "missing");
    })
  );

  it.effect("uses a parent domain's DMARC record", () =>
    Effect.gen(function* parentDmarc() {
      const check = yield* checkSendingDomainDns({
        ...ACME,
        domain: "news.acme.example",
      }).pipe(
        Effect.provide(
          zone({
            "_dmarc.acme.example": [txt("v=DMARC1; p=reject")],
            "news.acme.example": [txt("v=spf1 -all")],
            "s1._domainkey.news.acme.example": [txt(`v=DKIM1; p=${KEY}`)],
          })
        )
      );

      assert.strictEqual(check.status, "ready");
      assert.strictEqual(check.dmarc.name, "_dmarc.acme.example");
    })
  );

  it.effect("warns when the return path can't receive bounces", () =>
    Effect.gen(function* returnPathWithoutMx() {
      const check = yield* checkSendingDomainDns({
        ...ACME,
        returnPath: "bounce.acme.example",
      }).pipe(
        Effect.provide(
          zone({
            "_dmarc.acme.example": [txt("v=DMARC1; p=reject")],
            "bounce.acme.example": [txt("v=spf1 include:amazonses.com ~all")],
            "s1._domainkey.acme.example": [txt(`v=DKIM1; p=${KEY}`)],
          })
        )
      );

      assert.strictEqual(check.status, "warning");
      assert.deepStrictEqual(check.returnPath, {
        aligned: true,
        hasMx: false,
        name: "bounce.acme.example",
        status: "warn",
      });
    })
  );

  it.effect(
    "warns when the return path takes no mail, by a null MX record",
    () =>
      Effect.gen(function* nullMx() {
        const check = yield* checkSendingDomainDns({
          ...ACME,
          returnPath: "bounce.acme.example",
        }).pipe(
          Effect.provide(
            zone({
              "_dmarc.acme.example": [txt("v=DMARC1; p=reject")],
              "bounce.acme.example": [
                txt("v=spf1 include:amazonses.com ~all"),
                Dns.makeRecordUnsafe("MX", {
                  exchange: Host.domainNameFromStringUnsafe("."),
                  priority: 0,
                }),
              ],
              "s1._domainkey.acme.example": [txt(`v=DKIM1; p=${KEY}`)],
            })
          )
        );

        assert.strictEqual(check.returnPath?.hasMx, false);
      })
  );

  it.effect("fails, naming the name, when a lookup fails", () =>
    Effect.gen(function* lookupTimesOut() {
      const exit = yield* checkSendingDomainDns(ACME).pipe(
        Effect.provide(
          Layer.succeed(
            Dns.Dns,
            Dns.make({
              lookup: () => Effect.succeed([]),
              resolve: (name, type) =>
                name.startsWith("_dmarc.")
                  ? Effect.fail(
                      new Dns.DnsError({
                        hostname: name,
                        method: "resolve",
                        reason: "Timeout",
                        recordType: type,
                      })
                    )
                  : Effect.succeed([]),
            })
          )
        ),
        Effect.exit
      );

      assert.deepStrictEqual(
        exit,
        Exit.fail(
          new DnsLookupFailed({
            detail: "The DNS lookup timed out.",
            name: "_dmarc.acme.example",
          })
        )
      );
    })
  );
});
