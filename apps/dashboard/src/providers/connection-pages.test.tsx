import { Organization, ProviderConnectionIdSchema } from "@repo/domain";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
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
  defaultForCampaigns: false,
  smtp: { host: "smtp.postmarkapp.com", port: 587, security: "starttls" },
};

const SES = {
  createdAt: "2026-11-27T09:00:00.000Z",
  defaultForCampaigns: true,
  emailsPerMinute: null,
  from: { email: "news@acme.example" },
  id: "pcn_01h455vb4pex5vsknk084sn02r",
  name: "SES",
  provider: "ses",
  ses: { region: "eu-west-1" },
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

const renderEdit = (id = POSTMARK.id) =>
  renderWithOrganizations(
    <EditPage
      organization={organization}
      providerConnectionId={ProviderConnectionIdSchema.make(id)}
    />
  );

const chooseRegion = async (name: RegExp) => {
  fireEvent.click(screen.getByRole("combobox", { name: /Region/u }));

  const region = await screen.findByRole("option", { name });

  // WARNING: Base UI's Select picks an option on the pointer's release, which happy-dom only sends when asked.
  fireEvent.pointerDown(region, { pointerType: "mouse" });
  fireEvent.pointerUp(region, { pointerType: "mouse" });
  fireEvent.click(region);
};

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
      emailsPerMinute: null,
      from: { email: "news@acme.example", name: "Acme News" },
      name: "Postmark",
      provider: "smtp",
      smtp: { host: "smtp.postmarkapp.com", port: 587, security: "starttls" },
    });
  });

  it("keeps connecting when the Provider is changed while the request is on its way", async () => {
    let answer: (response: Response) => void = () => {};

    api.use(
      http.get("*/api/organizations", () => HttpResponse.json([ACME])),
      http.post(
        CONNECTIONS,
        () =>
          new Promise<Response>((resolve) => {
            answer = resolve;
          })
      )
    );

    const router = renderWithOrganizations(
      <ConnectPage organization={organization} />
    );

    await screen.findByLabelText("Name");
    type("Name", "Postmark");
    type("Host", "smtp.postmarkapp.com");
    type("Username", "token");
    type("Password", "secret token");
    type("From email", "news@acme.example");
    submit();

    await screen.findByRole("button", { name: "Connecting…" });
    fireEvent.click(screen.getByRole("radio", { name: /Amazon SES/u }));
    answer(HttpResponse.json(POSTMARK, { status: 201 }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/providers")
    );
  });

  it("connects an SES account with its Region, access key and a sending rate", async () => {
    const create = answerWith(201);
    api.use(
      http.get("*/api/organizations", () => HttpResponse.json([ACME])),
      http.get(CONNECTIONS, () => HttpResponse.json([POSTMARK])),
      http.post(CONNECTIONS, create.handler)
    );
    renderWithOrganizations(<ConnectPage organization={organization} />);

    fireEvent.click(await screen.findByRole("radio", { name: /Amazon SES/u }));
    type("Name", "SES");
    await chooseRegion(/^Europe \(Ireland\)/u);
    type("Access key ID", " AKIAIOSFODNN7EXAMPLE ");
    type("Secret access key", "the secret");
    type("Most emails a minute (optional)", "600");
    type("From email", "news@acme.example");
    submit();

    await expect(create.received).resolves.toStrictEqual({
      credentials: {
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "the secret",
      },
      emailsPerMinute: 600,
      from: { email: "news@acme.example" },
      name: "SES",
      provider: "ses",
      ses: { region: "eu-west-1" },
    });
  });

  it("refuses a sending rate that isn't a whole number from 10 to 60,000 a minute", async () => {
    api.use(http.get("*/api/organizations", () => HttpResponse.json([ACME])));
    renderWithOrganizations(<ConnectPage organization={organization} />);

    await screen.findByLabelText("Name");
    type("Most emails a minute (optional)", "5");
    submit();

    await expect(
      screen.findByText(
        "Enter a whole number of emails from 10 to 60,000 a minute."
      )
    ).resolves.toBeTruthy();
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
      emailsPerMinute: null,
      from: { email: "news@acme.example" },
      name: "Postmark (broadcasts)",
      provider: "smtp",
      smtp: { host: "smtp.postmarkapp.com", port: 587, security: "starttls" },
    });
  });

  it("keeps an SES account's saved access key when only its name changes", async () => {
    const update = answerWith(200);
    api.use(
      http.get("*/api/organizations", () => HttpResponse.json([ACME])),
      http.get(CONNECTIONS, () => HttpResponse.json([POSTMARK, SES])),
      http.put(CONNECTION, update.handler)
    );
    renderEdit(SES.id);

    await screen.findByLabelText("Name");
    type("Name", "SES (Ireland)");
    submit();

    await expect(update.received).resolves.toStrictEqual({
      emailsPerMinute: null,
      from: { email: "news@acme.example" },
      name: "SES (Ireland)",
      provider: "ses",
      ses: { region: "eu-west-1" },
    });
  });

  it("says to enter the access key again when the Region changed while it was kept", async () => {
    api.use(
      http.get("*/api/organizations", () => HttpResponse.json([ACME])),
      http.get(CONNECTIONS, () => HttpResponse.json([SES])),
      http.put(CONNECTION, () =>
        HttpResponse.json({ _tag: "CredentialsRequired" }, { status: 422 })
      )
    );
    renderEdit(SES.id);

    await screen.findByLabelText("Name");
    submit();

    await expect(
      screen.findByText(
        "You changed the Region, so enter the access key again. Mailquilt only sends it to the account it was entered for."
      )
    ).resolves.toBeTruthy();
  });

  it("asks for the access key again when an SES account's Region changes", async () => {
    api.use(
      http.get("*/api/organizations", () => HttpResponse.json([ACME])),
      http.get(CONNECTIONS, () => HttpResponse.json([SES]))
    );
    renderEdit(SES.id);

    await screen.findByLabelText("Name");
    expect(screen.queryByLabelText("Access key ID")).toBeNull();

    await chooseRegion(/^Europe \(London\)/u);

    await expect(screen.findByLabelText("Access key ID")).resolves.toBeTruthy();
    expect(
      screen
        .getByRole("radio", { name: "Enter a new one" })
        .getAttribute("aria-checked")
    ).toBe("true");
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
