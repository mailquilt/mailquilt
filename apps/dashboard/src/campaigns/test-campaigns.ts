import { http, HttpResponse } from "msw";

import { ACME } from "../organizations/test-organizations.tsx";

/** Shared answers for the Campaign tests, shaped as the API sends them. */
export const ORGANIZATION = "*/api/organizations/:organizationId";

export const CAMPAIGNS = `${ORGANIZATION}/campaigns`;

export const CAMPAIGN = `${CAMPAIGNS}/:campaignId`;

export const POSTMARK = {
  createdAt: "2026-11-22T09:00:00.000Z",
  from: { email: "news@acme.example", name: "Acme News" },
  id: "pcn_01h455vb4pex5vsknk084sn02q",
  name: "Postmark",
  provider: "smtp",
  signsIn: true,
  smtp: { host: "smtp.postmarkapp.com", port: 587, security: "starttls" },
};

export const ROAST = {
  createdAt: "2026-11-02T09:00:00.000Z",
  id: "lst_01h455vb4pex5vsknk084sn02q",
  name: "Roast of the month",
  subscriptions: { pending: 0, subscribed: 3, unsubscribed: 0 },
};

export const DRAFT = {
  createdAt: "2026-11-24T09:14:00.000Z",
  from: { email: "news@acme.example", name: "Acme News" },
  html: "<p>Hello</p>",
  id: "cmp_01h455vb4pex5vsknk084sn02q",
  listId: ROAST.id,
  providerConnectionId: POSTMARK.id,
  recipients: { failed: 0, sent: 0, total: 0 },
  replyTo: null,
  sendingStartedAt: null,
  sentAt: null,
  status: "draft",
  subject: "December roast: Ethiopia Guji Hambela",
};

export const SENDING = {
  ...DRAFT,
  recipients: { failed: 0, sent: 0, total: 3 },
  sendingStartedAt: "2026-11-24T10:42:00.000Z",
  status: "sending",
};

export const SENT = {
  ...SENDING,
  recipients: { failed: 1, sent: 2, total: 3 },
  sentAt: "2026-11-24T10:45:00.000Z",
  status: "sent",
};

/** The Organization, its one connection and its one List. */
export const ready = ({
  connections = [POSTMARK],
  lists = [ROAST],
}: {
  connections?: readonly object[];
  lists?: readonly object[];
} = {}) => [
  http.get("*/api/organizations", () => HttpResponse.json([ACME])),
  http.get(`${ORGANIZATION}/provider-connections`, () =>
    HttpResponse.json(connections)
  ),
  http.get(`${ORGANIZATION}/lists`, () => HttpResponse.json(lists)),
  http.get(`${ORGANIZATION}/lists/:listId`, ({ params }) => {
    const list = lists.find(
      (candidate) => "id" in candidate && candidate.id === params.listId
    );

    return list === undefined
      ? HttpResponse.json({ _tag: "ListNotFound" }, { status: 404 })
      : HttpResponse.json(list);
  }),
];
