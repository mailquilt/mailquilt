import { cleanup, fireEvent, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { CreateOrganizationForm } from "./create-organization-form.tsx";
import { useCreateOrganization, useOrganizations } from "./organizations.tsx";
import { ACME, renderWithOrganizations } from "./test-organizations.tsx";

const api = setupServer();

const FormOnHome = () => {
  const create = useCreateOrganization();

  return <CreateOrganizationForm create={create} layout="step" />;
};

const ActiveName = () => {
  const { active } = useOrganizations();

  return <p data-testid="active">{active?.name ?? "none"}</p>;
};

const submitName = async (name: string) => {
  fireEvent.change(await screen.findByLabelText("Organization name"), {
    target: { value: name },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create organization" }));
};

describe("create organization form", () => {
  beforeAll(() => api.listen({ onUnhandledFrame: "error" }));
  afterEach(() => {
    cleanup();
    api.resetHandlers();
    sessionStorage.clear();
    localStorage.clear();
  });

  afterAll(() => api.close());

  it("creates the organization and works in it from then on", async () => {
    let created: unknown;
    let organizations: readonly (typeof ACME)[] = [];
    api.use(
      http.get("*/api/organizations", () => HttpResponse.json(organizations)),
      http.post("*/api/organizations", async ({ request }) => {
        created = await request.json();
        organizations = [ACME];

        return HttpResponse.json(ACME, { status: 201 });
      })
    );

    renderWithOrganizations(
      <>
        <FormOnHome />
        <ActiveName />
      </>
    );
    await expect
      .poll(() => screen.getByTestId("active").textContent)
      .toBe("none");
    await submitName("  Acme Newsletter ");

    await expect
      .poll(() => screen.getByTestId("active").textContent)
      .toBe("Acme Newsletter");
    expect(created).toStrictEqual({ name: "Acme Newsletter" });
    expect(screen.queryByText("Created Acme Newsletter")).toBeNull();
  });

  it("asks for a name instead of sending only spaces", async () => {
    let requested = false;
    api.use(
      http.get("*/api/organizations", () => HttpResponse.json([])),
      http.post("*/api/organizations", () => {
        requested = true;

        return HttpResponse.json(ACME, { status: 201 });
      })
    );

    renderWithOrganizations(<FormOnHome />);
    await submitName("   ");

    await expect(
      screen.findByText("Enter a name for your organization.")
    ).resolves.toBeDefined();
    expect(requested).toBeFalsy();
  });

  it("says so when the organization couldn't be created", async () => {
    api.use(
      http.get("*/api/organizations", () => HttpResponse.json([])),
      http.post("*/api/organizations", () => HttpResponse.error())
    );

    renderWithOrganizations(<FormOnHome />);
    await submitName("Acme Newsletter");

    await expect(
      screen.findByText(
        "Mailquilt couldn’t create the organization. Check your connection, then try again."
      )
    ).resolves.toBeDefined();
  });
});
