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

import { OrganizationSwitcher } from "./organization-switcher.tsx";
import { ACME, BOLT, renderWithOrganizations } from "./test-organizations.tsx";

const api = setupServer();

const openNewOrganization = async () => {
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Organization: Acme Newsletter, Owner",
    })
  );
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "New organization" })
  );
};

describe("organization switcher", () => {
  beforeAll(() => api.listen({ onUnhandledFrame: "error" }));
  afterEach(() => {
    cleanup();
    api.resetHandlers();
    sessionStorage.clear();
    localStorage.clear();
    window.happyDOM?.setViewport({ height: 768, width: 1024 });
  });

  afterAll(() => api.close());

  it("switches this tab to another organization and remembers it", async () => {
    api.use(
      http.get("*/api/organizations", () => HttpResponse.json([ACME, BOLT]))
    );

    renderWithOrganizations(<OrganizationSwitcher />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Organization: Acme Newsletter, Owner",
      })
    );
    fireEvent.click(
      await screen.findByRole("menuitemradio", { name: /Bolt Weekly/u })
    );

    await expect(
      screen.findByRole("button", { name: "Organization: Bolt Weekly, Owner" })
    ).resolves.toBeDefined();
    await expect.poll(() => screen.queryByRole("menu")).toBeNull();

    cleanup();
    renderWithOrganizations(<OrganizationSwitcher />);

    await expect(
      screen.findByRole("button", { name: "Organization: Bolt Weekly, Owner" })
    ).resolves.toBeDefined();
  });

  it("leads to the settings of the organization the tab works in", async () => {
    api.use(http.get("*/api/organizations", () => HttpResponse.json([ACME])));

    renderWithOrganizations(<OrganizationSwitcher />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Organization: Acme Newsletter, Owner",
      })
    );

    const item = await screen.findByRole("menuitem", {
      name: "Organization settings",
    });

    expect(item.closest("a")?.getAttribute("href")).toBe("/settings");
  });

  it("keeps a tab in its organization when another tab switches", async () => {
    api.use(
      http.get("*/api/organizations", () => HttpResponse.json([ACME, BOLT]))
    );

    renderWithOrganizations(<OrganizationSwitcher />);
    await screen.findByRole("button", {
      name: "Organization: Acme Newsletter, Owner",
    });

    localStorage.setItem("mailquilt.organization", BOLT.id);
    cleanup();
    renderWithOrganizations(<OrganizationSwitcher />);

    await expect(
      screen.findByRole("button", {
        name: "Organization: Acme Newsletter, Owner",
      })
    ).resolves.toBeDefined();
  });

  it.each([
    { layout: "desktop dialog", width: 1024 },
    { layout: "phone sheet", width: 390 },
  ])(
    "creates an organization from the menu's $layout, switches to it and says so",
    async ({ width }) => {
      window.happyDOM?.setViewport({ height: 844, width });
      let organizations: readonly (typeof ACME | typeof BOLT)[] = [ACME];
      api.use(
        http.get("*/api/organizations", () => HttpResponse.json(organizations)),
        http.post("*/api/organizations", () => {
          organizations = [ACME, BOLT];

          return HttpResponse.json(BOLT, { status: 201 });
        })
      );

      renderWithOrganizations(<OrganizationSwitcher />);
      fireEvent.click(
        await screen.findByRole("button", {
          name: "Organization: Acme Newsletter, Owner",
        })
      );
      fireEvent.click(
        await screen.findByRole("menuitem", { name: "New organization" })
      );
      fireEvent.change(await screen.findByLabelText("Organization name"), {
        target: { value: "Bolt Weekly" },
      });
      fireEvent.click(
        screen.getByRole("button", { name: "Create organization" })
      );

      await expect(
        screen.findByRole("button", {
          name: "Organization: Bolt Weekly, Owner",
        })
      ).resolves.toBeDefined();
      await expect(
        screen.findByText("Created Bolt Weekly")
      ).resolves.toBeDefined();
    }
  );

  it("holds the dialog open, showing progress, while the organization is created", async () => {
    let answer = false;
    api.use(
      http.get("*/api/organizations", () => HttpResponse.json([ACME])),
      http.post("*/api/organizations", async () => {
        await vi.waitUntil(() => answer, { timeout: 5000 });

        return HttpResponse.json(BOLT, { status: 201 });
      })
    );

    renderWithOrganizations(<OrganizationSwitcher />);
    await openNewOrganization();
    fireEvent.change(await screen.findByLabelText("Organization name"), {
      target: { value: "Bolt Weekly" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create organization" })
    );

    const dialog = await screen.findByRole("dialog");

    await expect
      .poll(() => screen.getByRole("button", { name: /Create organization/u }))
      .toHaveProperty("disabled", true);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBe(dialog);

    answer = true;

    await expect(
      screen.findByText("Created Bolt Weekly")
    ).resolves.toBeDefined();
  });

  it("closes the dialog once the organization exists, without waiting for the list to reload", async () => {
    let organizations: readonly (typeof ACME | typeof BOLT)[] = [ACME];
    let lists = 0;
    let reloaded = false;
    api.use(
      http.get("*/api/organizations", async () => {
        lists += 1;

        if (lists > 1) {
          await vi.waitUntil(() => reloaded, { timeout: 5000 });
        }

        return HttpResponse.json(organizations);
      }),
      http.post("*/api/organizations", () => {
        organizations = [ACME, BOLT];

        return HttpResponse.json(BOLT, { status: 201 });
      })
    );

    renderWithOrganizations(<OrganizationSwitcher />);
    await openNewOrganization();
    fireEvent.change(await screen.findByLabelText("Organization name"), {
      target: { value: "Bolt Weekly" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create organization" })
    );

    await expect(
      screen.findByText("Created Bolt Weekly")
    ).resolves.toBeDefined();

    reloaded = true;
  });

  it("keeps what was typed when the screen turns between phone and desktop widths", async () => {
    api.use(http.get("*/api/organizations", () => HttpResponse.json([ACME])));

    renderWithOrganizations(<OrganizationSwitcher />);
    await openNewOrganization();
    fireEvent.change(await screen.findByLabelText("Organization name"), {
      target: { value: "Bolt Weekly" },
    });

    window.happyDOM?.setViewport({ height: 390, width: 390 });

    await expect
      .poll(() => screen.queryByLabelText("Organization name"))
      .toHaveProperty("value", "Bolt Weekly");
  });

  it("puts the cursor in the name field when the desktop dialog opens", async () => {
    api.use(http.get("*/api/organizations", () => HttpResponse.json([ACME])));

    renderWithOrganizations(<OrganizationSwitcher />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Organization: Acme Newsletter, Owner",
      })
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "New organization" })
    );
    const field = await screen.findByLabelText("Organization name");

    await expect.poll(() => document.activeElement).toBe(field);
  });

  it("returns focus to the switcher after creating from the phone sheet", async () => {
    window.happyDOM?.setViewport({ height: 844, width: 390 });
    let organizations: readonly (typeof ACME | typeof BOLT)[] = [ACME];
    api.use(
      http.get("*/api/organizations", () => HttpResponse.json(organizations)),
      http.post("*/api/organizations", () => {
        organizations = [ACME, BOLT];

        return HttpResponse.json(BOLT, { status: 201 });
      })
    );

    renderWithOrganizations(<OrganizationSwitcher />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Organization: Acme Newsletter, Owner",
      })
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "New organization" })
    );
    fireEvent.change(await screen.findByLabelText("Organization name"), {
      target: { value: "Bolt Weekly" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create organization" })
    );

    const switcher = await screen.findByRole("button", {
      name: "Organization: Bolt Weekly, Owner",
    });

    await expect.poll(() => document.activeElement).toBe(switcher);
  });
});
