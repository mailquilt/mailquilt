import { Organization, ProviderConnectionIdSchema } from "@repo/domain";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { Deferred, Effect, Schema } from "effect";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  ACME,
  renderWithOrganizations,
} from "../organizations/test-organizations.tsx";
import { ConnectPage, EditPage } from "./connection-pages.tsx";

const api = setupServer();

const organization = Schema.decodeUnknownSync(Organization)(ACME);

const POSTMARK = {
  createdAt: "2026-11-22T09:00:00.000Z",
  from: { email: "news@acme.example" },
  id: "pcn_01h455vb4pex5vsknk084sn02q",
  name: "Postmark",
  provider: "smtp",
  signsIn: true,
  emailsPerMinute: null,
  smtp: { host: "smtp.postmarkapp.com", port: 587, security: "starttls" },
};

const CONNECTIONS = "*/api/organizations/:organizationId/provider-connections";

const CONNECTION = `${CONNECTIONS}/:providerConnectionId`;

const Body = Schema.Record(Schema.String, Schema.Unknown);

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

const submit = () =>
  fireEvent.submit(
    screen
      .getByRole("button", { name: /^Connect$|^Save changes$/u })
      .closest("form") ?? document.body
  );

const recordBody =
  (bodies: unknown[], status: number) =>
  async ({ request }: { request: Request }) => {
    bodies.push(Schema.decodeUnknownSync(Body)(await request.json()));

    return HttpResponse.json(POSTMARK, { status });
  };

const answerWith = (status: number) => {
  const received = Deferred.makeUnsafe<typeof Body.Type>();

  return {
    handler: async ({ request }: { request: Request }) => {
      Deferred.doneUnsafe(
        received,
        Effect.succeed(Schema.decodeUnknownSync(Body)(await request.json()))
      );

      return HttpResponse.json(POSTMARK, { status });
    },
    received: Effect.runPromise(Deferred.await(received)),
  };
};

const renderEdit = () =>
  renderWithOrganizations(
    <EditPage
      organization={organization}
      providerConnectionId={ProviderConnectionIdSchema.make(POSTMARK.id)}
    />
  );

describe("connecting and editing an SMTP server", () => {
  beforeAll(() => api.listen({ onUnhandledFrame: "error" }));
  afterEach(() => {
    cleanup();
    api.resetHandlers();
  });

  afterAll(() => api.close());

  it("connects a server with its sign-in and sender", async () => {
    const create = answerWith(201);
    api.use(
      http.get("*/api/organizations", () => HttpResponse.json([ACME])),
      http.get(CONNECTIONS, () => HttpResponse.json([POSTMARK])),
      http.post(CONNECTIONS, create.handler)
    );
    renderWithOrganizations(<ConnectPage organization={organization} />);

    await screen.findByLabelText("Name");
    type("Name", "Postmark");
    type("Host", "smtp.postmarkapp.com");
    type("Username", "token");
    type("Password", "secret token");
    type("From name (optional)", "Acme News");
    type("From email", "news@acme.example");
    submit();

    await expect(create.received).resolves.toStrictEqual({
      credentials: { password: "secret token", username: "token" },
      from: { email: "news@acme.example", name: "Acme News" },
      name: "Postmark",
      smtp: { host: "smtp.postmarkapp.com", port: 587, security: "starttls" },
    });
  });

  it("says what each empty field needs, and focuses the first", async () => {
    api.use(http.get("*/api/organizations", () => HttpResponse.json([ACME])));
    renderWithOrganizations(<ConnectPage organization={organization} />);

    await screen.findByLabelText("Name");
    submit();

    await expect(
      screen.findByText("Enter a name for the connection.")
    ).resolves.toBeTruthy();
    expect(screen.getByText("Enter the server’s host name.")).toBeTruthy();
    expect(screen.getByText("Enter an email address.")).toBeTruthy();
    expect(screen.getByText("Enter the username.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("Name"));
  });

  it("counts the fields left to fix beside Connect", async () => {
    api.use(http.get("*/api/organizations", () => HttpResponse.json([ACME])));
    renderWithOrganizations(<ConnectPage organization={organization} />);

    await screen.findByLabelText("Name");
    submit();

    await expect(
      screen.findByText("Fix 5 fields to connect.")
    ).resolves.toBeTruthy();
  });

  it("picks the usual port when the encryption changes", async () => {
    api.use(http.get("*/api/organizations", () => HttpResponse.json([ACME])));
    renderWithOrganizations(<ConnectPage organization={organization} />);

    fireEvent.click(await screen.findByRole("radio", { name: /^TLS/u }));

    expect(screen.getByLabelText("Port")).toHaveProperty("value", "465");
  });

  it("asks for the username and password again when the server changes", async () => {
    const bodies: unknown[] = [];
    api.use(
      http.get("*/api/organizations", () => HttpResponse.json([ACME])),
      http.get(CONNECTIONS, () => HttpResponse.json([POSTMARK])),
      http.put(CONNECTION, recordBody(bodies, 200))
    );
    renderEdit();

    await screen.findByDisplayValue("smtp.postmarkapp.com");
    type("Host", "smtp.elsewhere.example");

    expect(
      screen
        .getByRole("radio", { name: "Enter new ones" })
        .getAttribute("aria-checked")
    ).toBe("true");

    fireEvent.click(screen.getByRole("radio", { name: "Keep the saved ones" }));
    submit();

    await expect(
      screen.findByText(/You changed the server, so enter the username/u)
    ).resolves.toBeTruthy();
    expect(bodies).toStrictEqual([]);
  });

  it("keeps the saved sign-in when only the name changes", async () => {
    const update = answerWith(200);
    api.use(
      http.get("*/api/organizations", () => HttpResponse.json([ACME])),
      http.get(CONNECTIONS, () => HttpResponse.json([POSTMARK])),
      http.put(CONNECTION, update.handler)
    );
    renderEdit();

    await screen.findByDisplayValue("Postmark");
    type("Name", "Postmark (broadcasts)");
    submit();

    await expect(update.received).resolves.toStrictEqual({
      from: { email: "news@acme.example" },
      name: "Postmark (broadcasts)",
      smtp: { host: "smtp.postmarkapp.com", port: 587, security: "starttls" },
    });
  });

  it("says so when the connection was deleted while being edited", async () => {
    api.use(
      http.get("*/api/organizations", () => HttpResponse.json([ACME])),
      http.get(CONNECTIONS, () => HttpResponse.json([POSTMARK])),
      http.put(CONNECTION, () =>
        HttpResponse.json(
          { _tag: "ProviderConnectionNotFound" },
          { status: 404 }
        )
      )
    );
    renderEdit();

    await screen.findByDisplayValue("Postmark");
    submit();

    const alert = await screen.findByRole("alert");

    expect(alert.textContent).toContain("This connection no longer exists");
  });
});
