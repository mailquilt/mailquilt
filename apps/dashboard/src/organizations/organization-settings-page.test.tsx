import { cleanup, fireEvent, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { OrganizationSettingsPage } from "./organization-settings-page.tsx";
import { useOrganizations } from "./organizations.tsx";
import { BOLT, renderWithOrganizations } from "./test-organizations.tsx";

const api = setupServer();

const POSTAL_ADDRESS = `*/api/organizations/${BOLT.id}/postal-address`;

const Page = () => {
  const { active } = useOrganizations();

  return active === null ? null : (
    <OrganizationSettingsPage organization={active} />
  );
};

const addressField = () =>
  screen.findByRole("textbox", { name: "Postal address" });

const typeAddress = async (value: string) =>
  fireEvent.change(await addressField(), { target: { value } });

const save = () =>
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

describe("Organization settings", () => {
  beforeAll(() => api.listen({ onUnhandledFrame: "error" }));
  afterEach(() => {
    cleanup();
    api.resetHandlers();
  });

  afterAll(() => api.close());

  it("saves the postal address, trimmed, and says so", async () => {
    const saved: unknown[] = [];
    api.use(
      http.get("*/api/organizations", () => HttpResponse.json([BOLT])),
      http.put(POSTAL_ADDRESS, async ({ request }) => {
        saved.push(await request.json());

        return HttpResponse.json({
          ...BOLT,
          postalAddress: "14 Mill Lane\nBristol BS1 4XE",
        });
      })
    );
    renderWithOrganizations(<Page />);

    await typeAddress("  14 Mill Lane\nBristol BS1 4XE  ");
    save();

    await expect(
      screen.findByText("Saved the postal address")
    ).resolves.toBeDefined();
    expect(saved).toStrictEqual([
      { postalAddress: "14 Mill Lane\nBristol BS1 4XE" },
    ]);
  });

  it("refuses an address that's only spaces, says why on the field and saves nothing", async () => {
    let saves = 0;
    api.use(
      http.get("*/api/organizations", () => HttpResponse.json([BOLT])),
      http.put(POSTAL_ADDRESS, () => {
        saves += 1;

        return HttpResponse.json(BOLT);
      })
    );
    renderWithOrganizations(<Page />);

    await typeAddress(" \n ");
    save();

    await expect(screen.findByRole("alert")).resolves.toHaveProperty(
      "textContent",
      "Enter your organization’s postal address."
    );
    expect(document.activeElement).toBe(await addressField());
    expect(saves).toBe(0);
  });

  it("shows how every campaign's footer reads with the address as it's typed", async () => {
    api.use(http.get("*/api/organizations", () => HttpResponse.json([BOLT])));
    renderWithOrganizations(<Page />);

    const caption = await screen.findByText("How it ends every campaign");
    const footer = caption.closest("figure") ?? caption;

    expect(footer.textContent).toContain("Your postal address goes here");

    await typeAddress("1 Main Street\n\nSpringfield");

    expect(footer.textContent).toContain(
      "Bolt Weekly, 1 Main Street, Springfield"
    );
  });

  it("keeps what was typed and says so when the address can't be saved, until it's changed", async () => {
    api.use(
      http.get("*/api/organizations", () => HttpResponse.json([BOLT])),
      http.put(POSTAL_ADDRESS, () => HttpResponse.error())
    );
    renderWithOrganizations(<Page />);

    await typeAddress("1 Main Street");
    save();

    await expect(screen.findByRole("alert")).resolves.toHaveProperty(
      "textContent",
      "Mailquilt couldn’t save the postal address. Check your connection, then try again."
    );
    const field = await addressField();

    expect(field.textContent).toBe("1 Main Street");

    await typeAddress("1 Main Street, Springfield");

    expect(screen.queryByRole("alert")).toBeNull();
  });
});
