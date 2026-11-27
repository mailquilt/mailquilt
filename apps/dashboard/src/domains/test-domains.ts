const CHECKED_AT = "2026-11-27T10:40:00.000Z";

const passingDkim = (selector: string, domain: string) => ({
  name: `${selector}._domainkey.${domain}`,
  problem: null,
  selector,
  status: "pass",
});

/** acme.example, sent from with Postmark's one selector, with every record passing. */
export const ACME_DOMAIN = {
  check: {
    checkedAt: CHECKED_AT,
    dkim: [passingDkim("pm", "acme.example")],
    dmarc: {
      name: "_dmarc.acme.example",
      policy: "reject",
      problem: null,
      record: "v=DMARC1; p=reject",
      status: "pass",
    },
    returnPath: null,
    spf: {
      name: "acme.example",
      problem: null,
      record: "v=spf1 include:spf.mtasv.net ~all",
      status: "pass",
    },
    status: "ready",
  },
  createdAt: "2026-11-22T09:00:00.000Z",
  dkimSelectors: ["pm"],
  domain: "acme.example",
  id: "sdm_01h455vb4pex5vsknk084sn02q",
  returnPath: null,
};

/** acme.example when its DKIM key is missing and it has no DMARC record. */
export const ACME_DOMAIN_HELD = {
  ...ACME_DOMAIN,
  check: {
    ...ACME_DOMAIN.check,
    dkim: [
      {
        name: "pm._domainkey.acme.example",
        problem: "missing",
        selector: "pm",
        status: "fail",
      },
    ],
    dmarc: {
      name: "_dmarc.acme.example",
      policy: null,
      problem: "missing",
      record: null,
      status: "fail",
    },
    status: "blocked",
  },
};
