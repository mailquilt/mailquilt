import { Organization } from "@repo/domain";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { Schema } from "effect";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  ACME,
  renderWithOrganizations,
} from "../organizations/test-organizations.tsx";
import { ListsPage } from "./lists-page.tsx";

const api = setupServer();

const organization = Schema.decodeUnknownSync(Organization)(ACME);

const NEWS = {
  createdAt: "2026-11-02T09:00:00.000Z",
  id: "lst_01h455vb4pex5vsknk084sn02q",
  name: "Weekly news",
  subscriptions: { pending: 386, subscribed: 1204, unsubscribed: 52 },
};

describe("lists page", () => {
  beforeAll(() => api.listen({ onUnhandledFrame: "error" }));
  afterEach(() => {
    cleanup();
    api.resetHandlers();
  });

  afterAll(() => api.close());

  it("shows each list's counts and opens its contacts", async () => {
    api.use(
      http.get("*/api/organizations", () => HttpResponse.json([ACME])),
      http.get("*/api/organizations/:organizationId/lists", () =>
        HttpResponse.json([NEWS])
      )
    );

    renderWithOrganizations(<ListsPage organization={organization} />);

    const row = await screen.findByRole("row", { name: /Weekly news/u });

    expect(row.textContent).toContain("1,204");
    expect(row.textContent).toContain("386");
    expect(
      within(row)
        .getByRole("link", { name: "Weekly news" })
        .getAttribute("href")
    ).toBe(`/contacts?list=${NEWS.id}`);
  });

  it("draws every list's make-up to the biggest list's scale", async () => {
    const SMALL = {
      createdAt: "2026-11-03T09:00:00.000Z",
      id: "lst_01h455vb4pex5vsknk084sn02r",
      name: "Small news",
      subscriptions: { pending: 0, subscribed: 821, unsubscribed: 0 },
    };

    api.use(
      http.get("*/api/organizations", () => HttpResponse.json([ACME])),
      http.get("*/api/organizations/:organizationId/lists", () =>
        HttpResponse.json([NEWS, SMALL])
      )
    );

    renderWithOrganizations(<ListsPage organization={organization} />);

    const row = await screen.findByRole("row", { name: /Small news/u });
    const subscribed = row.querySelector('[data-status="subscribed"]');

    expect(
      subscribed instanceof HTMLElement
        ? subscribed.style.getPropertyValue("--mq-share")
        : undefined
    ).toBe("50%");
  });

  it("creates the first list from the empty page", async () => {
    let lists: readonly object[] = [];
    api.use(
      http.get("*/api/organizations", () => HttpResponse.json([ACME])),
      http.get("*/api/organizations/:organizationId/lists", () =>
        HttpResponse.json(lists)
      ),
      http.post("*/api/organizations/:organizationId/lists", () => {
        lists = [NEWS];

        return HttpResponse.json(NEWS, { status: 201 });
      })
    );

    renderWithOrganizations(<ListsPage organization={organization} />);

    await expect(screen.findByText("No lists yet")).resolves.toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "New list" }));
    fireEvent.change(await screen.findByLabelText("List name"), {
      target: { value: "Weekly news" },
    });
    fireEvent.submit(
      screen.getByLabelText("List name").closest("form") ?? document.body
    );

    await expect(
      screen.findByText("Created Weekly news")
    ).resolves.toBeTruthy();
    await expect(
      screen.findByRole("row", { name: /Weekly news/u })
    ).resolves.toBeTruthy();
  });
});
