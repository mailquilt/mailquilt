import { cleanup, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  ACME,
  renderWithOrganizations,
} from "../organizations/test-organizations.tsx";
import { AppShell } from "./app-shell.tsx";
import { SignedInOnly } from "./session-gates.tsx";

const api = setupServer();

const SESSION = {
  session: { expiresAt: "2026-12-01T00:00:00.000Z", id: "s", userId: "u" },
  user: { email: "ada@example.com", emailVerified: true, id: "u", name: "Ada" },
};

const ADA = {
  createdAt: "2026-11-21T09:00:00.000Z",
  email: "ada@example.com",
  id: "cnt_01h455vb4pex5vsknk084sn02q",
  subscriptions: [],
};

const POSTMARK = {
  createdAt: "2026-11-22T09:00:00.000Z",
  from: { email: "news@acme.example", name: "Acme News" },
  id: "pcn_01h455vb4pex5vsknk084sn02q",
  name: "Postmark",
  provider: "smtp",
  signsIn: true,
  smtp: { host: "smtp.postmarkapp.com", port: 587, security: "starttls" },
};

const ORGANIZATION = "*/api/organizations/:organizationId";

describe("app shell", () => {
  beforeAll(() => api.listen({ onUnhandledFrame: "error" }));
  afterEach(() => {
    cleanup();
    api.resetHandlers();
  });

  afterAll(() => api.close());

  it("counts what each built page holds beside it, and leaves out a count that couldn't load", async () => {
    api.use(
      http.get("*/health", () => HttpResponse.json({ database: "connected" })),
      http.get("*/api/auth/get-session", () => HttpResponse.json(SESSION)),
      http.get("*/api/organizations", () => HttpResponse.json([ACME])),
      http.get(`${ORGANIZATION}/contacts`, () =>
        HttpResponse.json({
          contacts: [ADA],
          next: ADA.id,
          previous: null,
          start: 0,
          total: 12_480,
        })
      ),
      http.get(`${ORGANIZATION}/provider-connections`, () =>
        HttpResponse.json([POSTMARK])
      ),
      http.get(`${ORGANIZATION}/lists`, () => HttpResponse.error())
    );

    renderWithOrganizations(
      <SignedInOnly>
        <AppShell>
          <p>Page</p>
        </AppShell>
      </SignedInOnly>
    );

    await expect(
      screen.findByRole("link", { name: "Contacts, 12,480" }, { timeout: 3000 })
    ).resolves.toBeDefined();
    await expect(
      screen.findByRole("link", { name: "Providers, 1" }, { timeout: 3000 })
    ).resolves.toBeDefined();
    expect(screen.getByRole("link", { name: "Lists" })).toBeDefined();
  });
});
