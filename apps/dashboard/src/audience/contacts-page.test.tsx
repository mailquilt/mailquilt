import { ListIdSchema, Organization } from "@repo/domain";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { Schema } from "effect";
import { delay, http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { useState } from "react";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  ACME,
  renderWithOrganizations,
} from "../organizations/test-organizations.tsx";
import type { ContactSearch } from "./contact-search.ts";
import { ContactsPage } from "./contacts-page.tsx";

const api = setupServer();

const organization = Schema.decodeUnknownSync(Organization)(ACME);

const NEWS = {
  createdAt: "2026-11-02T09:00:00.000Z",
  id: "lst_01h455vb4pex5vsknk084sn02q",
  name: "Weekly news",
  subscriptions: { pending: 1, subscribed: 1, unsubscribed: 1 },
};

const subscribed = (listId: string, status: string) => ({
  createdAt: "2026-11-20T09:00:00.000Z",
  listId,
  status,
});

const ADA = {
  createdAt: "2026-11-21T09:00:00.000Z",
  email: "ada@example.com",
  id: "cnt_01h455vb4pex5vsknk084sn02q",
  subscriptions: [subscribed(NEWS.id, "subscribed")],
};

const ALAN = {
  createdAt: "2026-11-20T09:00:00.000Z",
  email: "alan@example.com",
  id: "cnt_01h455vb4pex5vsknk084sn02p",
  subscriptions: [subscribed(NEWS.id, "unsubscribed")],
};

const page = (
  contacts: readonly object[],
  extra: Partial<{
    total: number;
    next: string | null;
    previous: string | null;
  }> = {}
) => ({
  contacts,
  next: null,
  previous: null,
  start: 0,
  total: contacts.length,
  ...extra,
});

const audience = ({
  contacts = page([ADA, ALAN]),
  lists = [NEWS],
}: {
  contacts?: object;
  lists?: readonly object[];
} = {}) => [
  http.get("*/api/organizations", () => HttpResponse.json([ACME])),
  http.get("*/api/organizations/:organizationId/lists", () =>
    HttpResponse.json(lists)
  ),
  http.get("*/api/organizations/:organizationId/contacts", () =>
    HttpResponse.json(contacts)
  ),
];

const renderPage = (search: ContactSearch = {}) => {
  const onSearch = vi.fn<(next: ContactSearch) => void>();

  renderWithOrganizations(
    <ContactsPage
      onSearch={onSearch}
      organization={organization}
      search={search}
    />
  );

  return onSearch;
};

const PagingContacts = () => {
  const [search, setSearch] = useState<ContactSearch>({});

  return (
    <ContactsPage
      onSearch={setSearch}
      organization={organization}
      search={search}
    />
  );
};

describe("contacts page", () => {
  beforeAll(() => api.listen({ onUnhandledFrame: "error" }));
  afterEach(() => {
    cleanup();
    api.resetHandlers();
  });

  afterAll(() => api.close());

  it("shows every contact with the lists they're on and their status on each", async () => {
    api.use(...audience());

    renderPage();

    const table = await screen.findByRole("table", { name: "Contacts" });

    expect(
      within(table).getByRole("row", { name: /ada@example\.com/u }).textContent
    ).toContain("Weekly news, subscribed");
    expect(
      within(table).getByRole("row", { name: /alan@example\.com/u }).textContent
    ).toContain("Weekly news, unsubscribed");
    expect(screen.getByText("1–2 of 2")).toBeTruthy();
  });

  it("asks for one list's contacts and shows their status on it", async () => {
    let asked: URLSearchParams | undefined;
    api.use(
      http.get(
        "*/api/organizations/:organizationId/contacts",
        ({ request }) => {
          asked = new URL(request.url).searchParams;

          return HttpResponse.json(page([ALAN]));
        }
      ),
      ...audience()
    );

    renderPage({ list: ListIdSchema.make(NEWS.id), status: "unsubscribed" });

    const table = await screen.findByRole("table", {
      name: "Contacts on Weekly news",
    });

    expect(asked?.get("list")).toBe(NEWS.id);
    expect(asked?.get("status")).toBe("unsubscribed");
    expect(
      within(table).getByRole("columnheader", { name: "Status" })
    ).toBeTruthy();
    expect(within(table).getByText("Unsubscribed")).toBeTruthy();
  });

  it("asks for the next page after the last contact shown", async () => {
    api.use(
      ...audience({ contacts: page([ADA], { next: ADA.id, total: 51 }) })
    );

    const onSearch = renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Next" }));

    expect(onSearch).toHaveBeenCalledWith({ after: ADA.id });
  });

  it("asks for the page before the first contact shown", async () => {
    api.use(
      ...audience({ contacts: page([ADA], { previous: ADA.id, total: 51 }) })
    );

    const onSearch = renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Previous" }));

    expect(onSearch).toHaveBeenCalledWith({ before: ADA.id });
  });

  it("keeps Previous and Next off until the asked-for page arrives", async () => {
    api.use(
      http.get(
        "*/api/organizations/:organizationId/contacts",
        async ({ request }) => {
          if (new URL(request.url).searchParams.has("after")) {
            await delay("infinite");
          }

          return HttpResponse.json(
            page([ADA, ALAN], { next: ALAN.id, total: 3 })
          );
        }
      ),
      ...audience()
    );

    renderWithOrganizations(<PagingContacts />);

    fireEvent.click(await screen.findByRole("button", { name: "Next" }));

    expect(
      screen.getByRole("button", { name: "Next" }).hasAttribute("disabled")
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Previous" }).hasAttribute("disabled")
    ).toBeTruthy();
  });

  it("starts a new contact on the list the table is filtered by", async () => {
    let created: unknown;
    api.use(
      http.post(
        "*/api/organizations/:organizationId/contacts",
        async ({ request }) => {
          created = await request.json();

          return HttpResponse.json(ADA, { status: 201 });
        }
      ),
      ...audience({ contacts: page([ADA]) })
    );

    renderPage({ list: ListIdSchema.make(NEWS.id) });

    fireEvent.click(await screen.findByRole("button", { name: "Add contact" }));
    fireEvent.change(await screen.findByLabelText("Email address"), {
      target: { value: "grace@example.com" },
    });
    fireEvent.submit(
      screen.getByLabelText("Email address").closest("form") ?? document.body
    );

    await expect(
      screen.findByText("Added ada@example.com", {
        normalizer: (text) => text.replaceAll("\u200B", ""),
      })
    ).resolves.toBeTruthy();
    expect(created).toStrictEqual({
      email: "grace@example.com",
      listIds: [NEWS.id],
    });
  });

  it("says so when the list in the link isn't in the organization", async () => {
    api.use(
      http.get("*/api/organizations/:organizationId/contacts", () =>
        HttpResponse.json({ _tag: "ListNotFound" }, { status: 404 })
      ),
      ...audience()
    );

    const onSearch = renderPage({ list: ListIdSchema.make(NEWS.id) });

    fireEvent.click(
      await screen.findByRole("button", { name: "Show all contacts" })
    );

    expect(screen.getByText("That list isn’t in Acme Newsletter")).toBeTruthy();
    expect(onSearch).toHaveBeenCalledWith({});
  });

  it("invites the first contact when the organization has none", async () => {
    api.use(...audience({ contacts: page([]) }));

    renderPage();

    await expect(screen.findByText("No contacts yet")).resolves.toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("offers one Add contact on a list with no one on it, in its empty state", async () => {
    api.use(...audience({ contacts: page([]) }));

    renderPage({ list: ListIdSchema.make(NEWS.id) });

    await expect(
      screen.findByText("No one is on Weekly news yet")
    ).resolves.toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Add contact" })).toHaveLength(
      1
    );
  });

  it("doesn't offer Add contact beside contacts that didn't load", async () => {
    api.use(
      http.get("*/api/organizations/:organizationId/contacts", () =>
        HttpResponse.error()
      ),
      ...audience()
    );

    renderPage();

    await screen.findByRole("button", { name: "Try again" });

    expect(screen.queryByRole("button", { name: "Add contact" })).toBeNull();
  });

  it("keeps the list filter in place and shows the selection in its own bar", async () => {
    api.use(...audience());

    renderPage();

    fireEvent.click(
      await screen.findByRole("checkbox", { name: "Select ada@example.com" })
    );

    const bar = screen.getByRole("region", { name: "Selected contacts" });

    expect(bar.textContent).toContain("1 selected");
    expect(screen.getByRole("combobox", { name: "List" })).toBeTruthy();

    fireEvent.click(
      within(bar).getByRole("button", { name: "Clear selection" })
    );

    await expect
      .poll(() => screen.queryByRole("region", { name: "Selected contacts" }))
      .toBeNull();
  });

  it("offers Try again when contacts don't load, and shows them once they do", async () => {
    let fail = true;
    api.use(
      http.get("*/api/organizations/:organizationId/contacts", () =>
        fail ? HttpResponse.error() : HttpResponse.json(page([ADA]))
      ),
      ...audience()
    );

    renderPage();

    const tryAgain = await screen.findByRole("button", { name: "Try again" });
    fail = false;
    fireEvent.click(tryAgain);

    await expect(
      screen.findByRole("table", { name: "Contacts" })
    ).resolves.toBeTruthy();
  });

  it("says on the field when the address is already a contact", async () => {
    api.use(
      http.post("*/api/organizations/:organizationId/contacts", () =>
        HttpResponse.json({ _tag: "ContactAlreadyExists" }, { status: 409 })
      ),
      ...audience()
    );

    renderPage();

    const [addContact] = await screen.findAllByRole("button", {
      name: "Add contact",
    });

    fireEvent.click(addContact ?? document.body);
    fireEvent.change(await screen.findByLabelText("Email address"), {
      target: { value: "ADA@example.com" },
    });
    fireEvent.submit(
      screen.getByLabelText("Email address").closest("form") ?? document.body
    );

    await expect(
      screen.findByText(
        "Acme Newsletter already has a contact with this address."
      )
    ).resolves.toBeTruthy();
  });

  it("doesn't put a duplicate error on an address typed after submitting", async () => {
    let edited = false;
    api.use(
      http.post("*/api/organizations/:organizationId/contacts", async () => {
        await vi.waitFor(() => {
          if (!edited) {
            throw new Error("The test hasn't edited the address yet");
          }
        });

        return HttpResponse.json(
          { _tag: "ContactAlreadyExists" },
          { status: 409 }
        );
      }),
      ...audience()
    );

    renderPage();

    const [addContact] = await screen.findAllByRole("button", {
      name: "Add contact",
    });

    fireEvent.click(addContact ?? document.body);
    const email = await screen.findByLabelText("Email address");

    const submit = within(await screen.findByRole("dialog")).getByRole(
      "button",
      { name: "Add contact" }
    );

    fireEvent.change(email, { target: { value: "ada@example.com" } });
    fireEvent.submit(email.closest("form") ?? document.body);

    await vi.waitFor(() =>
      expect(submit.hasAttribute("disabled")).toBeTruthy()
    );
    fireEvent.change(email, { target: { value: "grace@example.com" } });
    edited = true;

    await vi.waitFor(() => expect(submit.hasAttribute("disabled")).toBeFalsy());
    expect(
      screen.queryByText(
        "Acme Newsletter already has a contact with this address."
      )
    ).toBeNull();
  });

  it("adds the selected contacts to a list and says who stayed unsubscribed", async () => {
    let added: unknown;
    api.use(
      http.post(
        "*/api/organizations/:organizationId/lists/:listId/subscriptions",
        async ({ request }) => {
          added = await request.json();

          return HttpResponse.json({
            added: 0,
            alreadySubscribed: 1,
            leftPending: 0,
            leftUnsubscribed: 1,
          });
        }
      ),
      ...audience()
    );

    renderPage();

    fireEvent.click(
      await screen.findByRole("checkbox", {
        name: "Select every contact on this page",
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Add to list" }));
    fireEvent.click(await screen.findByRole("radio", { name: "Weekly news" }));
    fireEvent.submit(
      screen.getByRole("radio", { name: "Weekly news" }).closest("form") ??
        document.body
    );

    await expect(
      screen.findByText("Nobody new was added to Weekly news")
    ).resolves.toBeTruthy();
    expect(
      screen.getByText(
        "1 was already subscribed. 1 stays unsubscribed, as they chose."
      )
    ).toBeTruthy();
    expect(added).toStrictEqual({ contactIds: [ADA.id, ALAN.id] });
  });
});
