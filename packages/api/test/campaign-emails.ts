import { SmtpOutbox } from "@repo/core/testing";
import type { ListId } from "@repo/domain";
import { Effect, pipe } from "effect";

import type { ownOrganization } from "./accounts.ts";
import { APP_URL, AppFetch, QueueWorker } from "./harness.ts";

/** A signed-in person's typed client and their Organization's path params. */
export type Owner = Effect.Success<typeof ownOrganization>;

let campaigns = 0;

export const newList = ({ client, params }: Owner, name: string) =>
  client.lists.create({ params, payload: { name } });

/** Subscribes `emails` to `listId` and sends a Campaign to it and to `alsoListIds`. */
export const startCampaign = (
  owner: Owner,
  listId: ListId,
  emails: readonly string[],
  alsoListIds: readonly ListId[] = []
) =>
  Effect.gen(function* startSendingToList() {
    campaigns += 1;

    const { client, params } = owner;

    yield* pipe(
      emails,
      Effect.forEach((email) =>
        client.contacts
          .create({ params, payload: { email, listIds: [listId] } })
          .pipe(Effect.ignore)
      )
    );

    const connection = yield* client.providerConnections.create({
      params,
      payload: {
        from: { email: "hello@acme.example" },
        name: "Postmark",
        smtp: { host: "smtp.example.com", port: 587, security: "starttls" },
      },
    });

    const subject = `News #${campaigns}`;

    const campaign = yield* client.campaigns.create({
      params,
      payload: {
        from: { email: "news@acme.example", name: "Acme News" },
        html: "<html><body><p>Hello!</p></body></html>",
        excludedListIds: [],
        listIds: [listId, ...alsoListIds],
        providerConnectionId: connection.id,
        replyTo: "replies@acme.example",
        subject,
      },
    });

    yield* client.organizations.updatePostalAddress({
      params,
      payload: { postalAddress: "14 Mill Lane\nBristol BS1 4XE" },
    });
    yield* client.campaigns.send({
      params: { ...params, campaignId: campaign.id },
    });

    return { campaignId: campaign.id, subject };
  });

export const sentWith = (subject: string) =>
  Effect.gen(function* sentEmails() {
    const outbox = yield* SmtpOutbox;

    return (yield* outbox.sent)
      .filter((sent) => sent.email.subject === subject)
      .map((sent) => sent.email);
  });

export const sendCampaign = (
  owner: Owner,
  listId: ListId,
  emails: readonly string[],
  alsoListIds: readonly ListId[] = []
) =>
  Effect.gen(function* sendToList() {
    const { subject } = yield* startCampaign(
      owner,
      listId,
      emails,
      alsoListIds
    );

    yield* (yield* QueueWorker).deliverAll;

    return yield* sentWith(subject);
  });

export const unsubscribePath = (email: {
  readonly headers?: Record<string, string>;
}) =>
  (email.headers?.["List-Unsubscribe"] ?? "").slice(`<${APP_URL}`.length, -1);

export const responseOf = (response: Response) =>
  Effect.gen(function* readResponse() {
    return {
      html: (yield* Effect.promise(() => response.text())).replaceAll(
        "<wbr/>",
        ""
      ),
      location: response.headers.get("location"),
      status: response.status,
    };
  });

export const open = (path: string) =>
  Effect.gen(function* openPage() {
    const fetch = yield* AppFetch;

    return yield* responseOf(
      yield* Effect.promise(() => fetch(`${APP_URL}${path}`))
    );
  });

export const post = (path: string, body: string) =>
  Effect.gen(function* postForm() {
    const fetch = yield* AppFetch;

    return yield* responseOf(
      yield* Effect.promise(() =>
        fetch(`${APP_URL}${path}`, {
          body,
          headers: { "content-type": "application/x-www-form-urlencoded" },
          method: "POST",
          redirect: "manual",
        })
      )
    );
  });

export const postMultipart = (path: string) =>
  Effect.gen(function* postMultipartForm() {
    const fetch = yield* AppFetch;
    const body = new FormData();

    body.set("List-Unsubscribe", "One-Click");

    return yield* responseOf(
      yield* Effect.promise(() =>
        fetch(`${APP_URL}${path}`, {
          body,
          method: "POST",
          redirect: "manual",
        })
      )
    );
  });

export const statusOn = (
  { client, params }: Owner,
  listId: ListId,
  email: string
) =>
  Effect.gen(function* subscriptionStatus() {
    const page = yield* client.contacts.list({
      params,
      query: { list: listId },
    });

    return page?.contacts
      .find((contact) => contact.email === email)
      ?.subscriptions.find((subscription) => subscription.listId === listId)
      ?.status;
  });
