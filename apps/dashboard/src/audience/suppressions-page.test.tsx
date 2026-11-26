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
import { WRAP_POINT } from "./format.ts";
import { SuppressionsPage } from "./suppressions-page.tsx";

const api = setupServer();

const organization = Schema.decodeUnknownSync(Organization)(ACME);

const SUPPRESSIONS = "*/api/organizations/:organizationId/suppressions";

const suppression = (id: string, email: string, reason: string) => ({
  createdAt: "2026-11-21T09:00:00.000Z",
  email,
  id: `sup_01h455vb4pex5vsknk084sn0${id}`,
  reason,
});

const ADA = suppression("2q", "ada@example.com", "manual");

const BOUNCED = suppression("2p", "gone@example.com", "hard-bounce");

const COMPLAINED = suppression("2n", "angry@example.com", "complaint");

const page = (suppressions: readonly object[]) => ({
  next: null,
  previous: null,
  start: 0,
  suppressions,
  total: suppressions.length,
});

const withSuppressions = (suppressions: () => readonly object[]) =>
  api.use(
    http.get("*/api/organizations", () => HttpResponse.json([ACME])),
    http.get(SUPPRESSIONS, () => HttpResponse.json(page(suppressions())))
  );

const renderPage = () =>
  renderWithOrganizations(
    <SuppressionsPage
      onSearch={() => {}}
      organization={organization}
      search={{}}
    />
  );

const shownText = (text: string) =>
  expect(
    screen.findByText((_, element) =>
      element === null
        ? false
        : element.textContent?.replaceAll(WRAP_POINT, "") === text &&
          [...element.children].every(
            (child) => child.textContent?.replaceAll(WRAP_POINT, "") !== text
          )
    )
  ).resolves.toBeTruthy();

const csvFile = (lines: readonly string[]) =>
  new File([lines.join("\n")], "suppressions-export.csv", {
    type: "text/csv",
  });

const chooseFile = async (file: File) => {
  const [importCsv] = await screen.findAllByRole("button", {
    name: "Import CSV",
  });

  fireEvent.click(importCsv ?? document.body);
  fireEvent.change(await screen.findByLabelText("CSV file"), {
    target: { files: [file] },
  });
};

const submitDialog = (label: string) =>
  fireEvent.submit(
    screen
      .getByRole("button", { name: label })
      .closest("[role=dialog]")
      ?.querySelector("form") ?? document.body
  );

describe("suppressions page", () => {
  beforeAll(() => api.listen({ onUnhandledFrame: "error" }));
  afterEach(() => {
    cleanup();
    api.resetHandlers();
  });

  afterAll(() => api.close());

  it("shows why each address is suppressed, and offers Remove only for one added by hand", async () => {
    withSuppressions(() => [ADA, BOUNCED, COMPLAINED]);
    renderPage();

    const ada = await screen.findByRole("row", { name: /ada@/u });
    const bounced = screen.getByRole("row", { name: /gone@/u });
    const complained = screen.getByRole("row", { name: /angry@/u });

    expect(ada.textContent).toContain("Added by hand");
    expect(
      within(ada).getByRole("button", {
        name: "Remove suppression of ada@example.com",
      })
    ).toBeTruthy();
    expect(bounced.textContent).toContain("Hard bounce");
    expect(complained.textContent).toContain("Spam complaint");

    for (const locked of [bounced, complained]) {
      expect(within(locked).queryByRole("button")).toBeNull();
      expect(locked.textContent).toContain("Can’t be removed");
    }
  });

  it("invites the first suppression when there are none", async () => {
    withSuppressions(() => []);
    renderPage();

    await expect(
      screen.findByText("No suppressed addresses yet")
    ).resolves.toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "Suppress addresses" })
    ).toHaveLength(1);
  });

  it("suppresses pasted addresses, each once, and says how many already were", async () => {
    let sent: unknown;
    withSuppressions(() => [ADA]);
    api.use(
      http.post(SUPPRESSIONS, async ({ request }) => {
        sent = await request.json();

        return HttpResponse.json({ added: 2, alreadySuppressed: 1 });
      })
    );
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "Suppress addresses" })
    );
    fireEvent.change(await screen.findByLabelText("Email addresses"), {
      target: {
        value:
          "ada@example.com,\ngrace@example.com  ALAN@example.com\nAda@Example.com",
      },
    });
    submitDialog("Suppress 3 addresses");

    await expect(
      screen.findByText("2 addresses suppressed")
    ).resolves.toBeTruthy();
    expect(screen.getByText("1 was already suppressed.")).toBeTruthy();
    expect(sent).toStrictEqual({
      emails: ["ada@example.com", "grace@example.com", "ALAN@example.com"],
    });
  });

  it("says which typed entry isn't an address, and suppresses none of them", async () => {
    let posted = false;
    withSuppressions(() => [ADA]);
    api.use(
      http.post(SUPPRESSIONS, () => {
        posted = true;

        return HttpResponse.json({ added: 1, alreadySuppressed: 0 });
      })
    );
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "Suppress addresses" })
    );
    fireEvent.change(await screen.findByLabelText("Email addresses"), {
      target: { value: "ada@example.com\nlucia.ferreira@" },
    });
    submitDialog("Suppress 1 address");

    await expect(
      screen.findByText("“lucia.ferreira@” isn’t an email address.")
    ).resolves.toBeTruthy();
    expect(posted).toBeFalsy();
  });

  it("imports a CSV's addresses 250 at a time, and reports the rows that weren't addresses", async () => {
    const batches: number[] = [];
    withSuppressions(() => [ADA]);
    api.use(
      http.post(SUPPRESSIONS, async ({ request }) => {
        // SAFETY: the page sends Suppressions as JSON with their addresses in `emails`.
        const { emails } = (await request.json()) as { emails: string[] };
        batches.push(emails.length);

        return HttpResponse.json({
          added: emails.length,
          alreadySuppressed: 0,
        });
      })
    );
    renderPage();

    await chooseFile(
      csvFile([
        "Name,Email",
        ...Array.from(
          { length: 260 },
          (_, index) => `Reader ${index},reader-${index}@example.com`
        ),
        "Jane,jane at example dot com",
      ])
    );

    await expect(
      screen.findByText("260 addresses to suppress")
    ).resolves.toBeTruthy();
    expect(screen.getByText("jane at example dot com")).toBeTruthy();

    submitDialog("Suppress 260 addresses");

    await expect(
      screen.findByText("260 addresses suppressed")
    ).resolves.toBeTruthy();
    expect(screen.getByText("1 row wasn’t an address.")).toBeTruthy();
    expect(batches).toStrictEqual([250, 10]);
  });

  it("offers to suppress the rest of a CSV when the import stops partway, and sends only those", async () => {
    const batches: string[][] = [];
    withSuppressions(() => [ADA]);
    api.use(
      http.post(
        SUPPRESSIONS,
        async ({ request }) => {
          // SAFETY: the page sends Suppressions as JSON with their addresses in `emails`.
          const { emails } = (await request.json()) as { emails: string[] };
          batches.push(emails);

          return HttpResponse.json({
            added: emails.length,
            alreadySuppressed: 0,
          });
        },
        { once: true }
      ),
      http.post(SUPPRESSIONS, () => HttpResponse.error(), { once: true }),
      http.post(SUPPRESSIONS, async ({ request }) => {
        // SAFETY: the page sends Suppressions as JSON with their addresses in `emails`.
        const { emails } = (await request.json()) as { emails: string[] };
        batches.push(emails);

        return HttpResponse.json({
          added: emails.length,
          alreadySuppressed: 0,
        });
      })
    );
    renderPage();

    await chooseFile(
      csvFile(
        Array.from({ length: 300 }, (_, index) => `reader-${index}@example.com`)
      )
    );
    await screen.findByRole("button", { name: "Suppress 300 addresses" });
    submitDialog("Suppress 300 addresses");

    await expect(
      screen.findByText(
        "The import stopped: Mailquilt couldn’t reach its server."
      )
    ).resolves.toBeTruthy();

    submitDialog("Suppress the other 50");

    await expect(
      screen.findByText("300 addresses suppressed")
    ).resolves.toBeTruthy();
    expect(batches.map((batch) => batch.length)).toStrictEqual([250, 50]);
    expect(batches[1]?.[0]).toBe("reader-250@example.com");
  });

  it("says nothing was suppressed when an import stops at its first request", async () => {
    withSuppressions(() => [ADA]);
    api.use(http.post(SUPPRESSIONS, () => HttpResponse.error()));
    renderPage();

    await chooseFile(
      csvFile(["email", "ada@example.com", "grace@example.com"])
    );
    await screen.findByRole("button", { name: "Suppress 2 addresses" });
    submitDialog("Suppress 2 addresses");

    await expect(
      screen.findByText("Nothing was suppressed yet, so trying again is safe.")
    ).resolves.toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Suppress 2 addresses" })
    ).toBeTruthy();
  });

  it("refuses a file that isn't a CSV before reading it", async () => {
    withSuppressions(() => [ADA]);
    renderPage();

    await chooseFile(
      new File(["x"], "budget-2026.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
    );

    await expect(screen.findByRole("alert")).resolves.toHaveProperty(
      "textContent",
      "budget-2026.xlsx isn’t a CSV file. Save it as CSV (comma-separated) from the program it came from, then choose the CSV file."
    );
  });

  it("removes a suppression added by hand after asking", async () => {
    let suppressions: readonly object[] = [ADA, BOUNCED];
    withSuppressions(() => suppressions);
    api.use(
      http.delete(`${SUPPRESSIONS}/:suppressionId`, () => {
        suppressions = [BOUNCED];

        return new HttpResponse(null, { status: 204 });
      })
    );
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Remove suppression of ada@example.com",
      })
    );
    submitDialog("Remove suppression");

    await expect(
      screen.findByText("Suppression removed")
    ).resolves.toBeTruthy();
    await shownText("Campaigns no longer leave out ada@example.com.");
    expect(document.activeElement?.textContent).toBe(
      "Removed the suppression of ada@example.com."
    );
    expect(screen.queryByRole("row", { name: /ada@/u })).toBeNull();
  });

  it("offers Try again when the suppressions don't load, and shows them once they do", async () => {
    let failing = true;
    api.use(
      http.get("*/api/organizations", () => HttpResponse.json([ACME])),
      http.get(SUPPRESSIONS, () =>
        failing ? HttpResponse.error() : HttpResponse.json(page([ADA]))
      )
    );
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    failing = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await expect(
      screen.findByRole("row", { name: /ada@/u })
    ).resolves.toBeTruthy();
  });

  it("asks for more than 250 typed addresses to be split or imported, and suppresses none", async () => {
    let posted = false;
    withSuppressions(() => [ADA]);
    api.use(
      http.post(SUPPRESSIONS, () => {
        posted = true;

        return HttpResponse.json({ added: 1, alreadySuppressed: 0 });
      })
    );
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "Suppress addresses" })
    );
    fireEvent.change(await screen.findByLabelText("Email addresses"), {
      target: {
        value: Array.from(
          { length: 251 },
          (_, index) => `reader-${index}@example.com`
        ).join("\n"),
      },
    });
    submitDialog("Suppress 251 addresses");

    await expect(
      screen.findByText(
        "That’s 251 addresses. Suppress up to 250 at a time, or import them from a CSV."
      )
    ).resolves.toBeTruthy();
    expect(posted).toBeFalsy();
  });

  it("reads the addresses from the column the member chooses", async () => {
    let sent: unknown;
    withSuppressions(() => [ADA]);
    api.use(
      http.post(SUPPRESSIONS, async ({ request }) => {
        sent = await request.json();

        return HttpResponse.json({ added: 1, alreadySuppressed: 0 });
      })
    );
    renderPage();

    await chooseFile(
      csvFile(["Billing contact,Email", "billing@example.com,ada@example.com"])
    );
    fireEvent.click(
      await screen.findByRole("combobox", { name: "Addresses from column" })
    );

    const billing = await screen.findByRole("option", {
      name: "Billing contact",
    });

    fireEvent.pointerDown(billing, { pointerType: "mouse" });
    fireEvent.pointerUp(billing, { pointerType: "mouse" });
    fireEvent.click(billing);
    submitDialog("Suppress 1 address");

    await expect(
      screen.findByText("1 address suppressed")
    ).resolves.toBeTruthy();
    expect(sent).toStrictEqual({ emails: ["billing@example.com"] });
  });

  it("says the suppression couldn't be removed when the server can't be reached, and keeps it", async () => {
    withSuppressions(() => [ADA]);
    api.use(
      http.delete(`${SUPPRESSIONS}/:suppressionId`, () => HttpResponse.error())
    );
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Remove suppression of ada@example.com",
      })
    );
    submitDialog("Remove suppression");

    await expect(screen.findByRole("alert")).resolves.toHaveProperty(
      "textContent",
      "Mailquilt couldn’t remove the suppression. Check your connection, then try again."
    );
    expect(
      screen.getByRole("row", { hidden: true, name: /ada@/u })
    ).toBeTruthy();
  });
});
