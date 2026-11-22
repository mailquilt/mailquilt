import { cleanup, fireEvent, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  ACME,
  renderWithOrganizations,
} from "../organizations/test-organizations.tsx";
import { SetupSteps } from "./setup-steps.tsx";

const api = setupServer();

describe("setup steps", () => {
  beforeAll(() => api.listen({ onUnhandledFrame: "error" }));
  afterEach(() => {
    cleanup();
    api.resetHandlers();
  });

  afterAll(() => api.close());

  it("starts with naming an organization", async () => {
    api.use(http.get("*/api/organizations", () => HttpResponse.json([])));

    renderWithOrganizations(<SetupSteps />);

    await expect(
      screen.findByRole("list", {
        name: "Steps to your first campaign, 0 of 5 done",
      })
    ).resolves.toBeDefined();
    await expect(
      screen.findByLabelText("Organization name")
    ).resolves.toBeDefined();
  });

  it("marks naming an organization done once one exists", async () => {
    api.use(http.get("*/api/organizations", () => HttpResponse.json([ACME])));

    renderWithOrganizations(<SetupSteps />);

    await expect(
      screen.findByRole("list", {
        name: "Steps to your first campaign, 1 of 5 done",
      })
    ).resolves.toBeDefined();
    expect(screen.queryByLabelText("Organization name")).toBeNull();
  });

  it("moves focus to the news that the organization is ready, so it is read out", async () => {
    let organizations: readonly (typeof ACME)[] = [];
    api.use(
      http.get("*/api/organizations", () => HttpResponse.json(organizations)),
      http.post("*/api/organizations", () => {
        organizations = [ACME];

        return HttpResponse.json(ACME, { status: 201 });
      })
    );

    renderWithOrganizations(<SetupSteps />);
    fireEvent.change(await screen.findByLabelText("Organization name"), {
      target: { value: "Acme Newsletter" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create organization" })
    );

    await expect
      .poll(() => document.activeElement?.textContent)
      .toBe("Acme Newsletter is ready, and you’re its owner.");
  });
});
