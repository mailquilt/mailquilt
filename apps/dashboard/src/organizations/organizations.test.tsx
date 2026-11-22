import { cleanup, fireEvent, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { SetupSteps } from "../home/setup-steps.tsx";
import { ACME, renderWithOrganizations } from "./test-organizations.tsx";

const api = setupServer();

describe("organizations", () => {
  beforeAll(() => api.listen({ onUnhandledFrame: "error" }));
  afterEach(() => {
    cleanup();
    api.resetHandlers();
  });

  afterAll(() => api.close());

  it("shows the signed-in pages only once it knows the person's organizations", async () => {
    let listed = false;
    api.use(
      http.get("*/api/organizations", async () => {
        await vi.waitUntil(() => listed, { timeout: 5000 });

        return HttpResponse.json([ACME]);
      })
    );

    renderWithOrganizations(<SetupSteps />);

    await expect
      .poll(() => screen.queryByRole("status", { name: "Loading" }))
      .not.toBeNull();
    expect(screen.queryByRole("list")).toBeNull();

    listed = true;

    await expect(
      screen.findByRole("list", {
        name: "Steps to your first campaign, 1 of 5 done",
      })
    ).resolves.toBeDefined();
  });

  it("offers to try again when organizations couldn't be loaded", async () => {
    let available = false;
    api.use(
      http.get("*/api/organizations", () =>
        available ? HttpResponse.json([ACME]) : HttpResponse.error()
      )
    );

    renderWithOrganizations(<SetupSteps />);
    const retry = await screen.findByRole("button", { name: "Try again" });

    available = true;
    fireEvent.click(retry);

    await expect(
      screen.findByRole("list", {
        name: "Steps to your first campaign, 1 of 5 done",
      })
    ).resolves.toBeDefined();
  });
});
