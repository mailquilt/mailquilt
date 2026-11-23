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
import { consistentSearch } from "./contact-search.ts";
import type { ContactSearch } from "./contact-search.ts";
import { ContactsPage } from "./contacts-page.tsx";
import { WRAP_POINT } from "./format.ts";

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
    start: number;
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

const NavigatedContacts = ({
  back,
  start,
}: {
  back: ContactSearch;
  start: ContactSearch;
}) => {
  const [search, setSearch] = useState<ContactSearch>(start);

  return (
    <>
      <button onClick={() => setSearch(back)} type="button">
        Go back
      </button>
      <ContactsPage
        onSearch={(next) => setSearch(consistentSearch(next))}
        organization={organization}
        search={search}
      />
    </>
  );
};

const goBack = () => fireEvent.click(screen.getByText("Go back"));

const PagingContacts = () => {
  const [search, setSearch] = useState<ContactSearch>({});

  return (
    <ContactsPage
      onSearch={(next) => setSearch(consistentSearch(next))}
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
          const params = new URL(request.url).searchParams;

          if (params.has("list")) {
            asked = params;
          }

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

    fireEvent.click(await screen.findByRole("button", { name: "Next page" }));

    expect(onSearch).toHaveBeenCalledWith({ after: ADA.id });
  });

  it("asks for the page before the first contact shown", async () => {
    api.use(
      ...audience({ contacts: page([ADA], { previous: ADA.id, total: 51 }) })
    );

    const onSearch = renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "Previous page" })
    );

    expect(onSearch).toHaveBeenCalledWith({ before: ADA.id });
  });

  it("ignores the pager, and keeps it focusable, until the asked-for page arrives", async () => {
    let pagesAsked = 0;
    api.use(
      http.get(
        "*/api/organizations/:organizationId/contacts",
        async ({ request }) => {
          const params = new URL(request.url).searchParams;

          if (params.has("after") || params.has("before")) {
            pagesAsked += 1;
            await delay("infinite");
          }

          return HttpResponse.json(
            page([ADA, ALAN], { next: ALAN.id, previous: ADA.id, total: 3 })
          );
        }
      ),
      ...audience()
    );

    renderWithOrganizations(<PagingContacts />);

    const next = await screen.findByRole("button", { name: "Next page" });

    fireEvent.click(next);

    await expect.poll(() => pagesAsked).toBe(1);
    expect(next.hasAttribute("disabled")).toBeFalsy();

    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    await delay(50);

    expect(pagesAsked).toBe(1);
  });

  it("keeps keyboard focus on the pager when the last page turns Next off", async () => {
    api.use(
      http.get("*/api/organizations/:organizationId/contacts", ({ request }) =>
        HttpResponse.json(
          new URL(request.url).searchParams.has("after")
            ? page([ALAN], { previous: ALAN.id, start: 50, total: 51 })
            : page([ADA], { next: ADA.id, total: 51 })
        )
      ),
      ...audience()
    );

    renderWithOrganizations(<PagingContacts />);

    const next = await screen.findByRole("button", { name: "Next page" });
    next.focus();
    fireEvent.click(next);

    await expect
      .poll(() => document.activeElement?.getAttribute("aria-label"))
      .toBe("Previous page");
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
        normalizer: (text) => text.replaceAll(WRAP_POINT, ""),
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

    expect(document.activeElement).toBe(
      screen.getByRole("checkbox", {
        name: "Select every contact on this page",
      })
    );
    await expect
      .poll(() => screen.queryByRole("region", { name: "Selected contacts" }))
      .toBeNull();
  });

  it("leaves the count out of the title when the page didn't load", async () => {
    api.use(
      http.get("*/api/organizations/:organizationId/lists", () =>
        HttpResponse.error()
      ),
      ...audience()
    );

    renderPage();

    await screen.findByRole("button", { name: "Try again" });

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Contacts"
    );
  });

  it("counts everyone on the list in the title, whatever status is shown", async () => {
    api.use(...audience({ contacts: page([ADA]) }));

    renderPage({
      list: ListIdSchema.make(NEWS.id),
      status: "subscribed",
    });

    const title = await screen.findByRole("heading", { level: 1 });

    await expect.poll(() => title.textContent).toContain("3 on this list");
  });

  it("doesn't bring Add to list back by itself after the page moves on while it was open", async () => {
    api.use(...audience());

    renderWithOrganizations(
      <NavigatedContacts
        back={{ list: ListIdSchema.make(NEWS.id) }}
        start={{}}
      />
    );

    fireEvent.click(
      await screen.findByRole("checkbox", { name: "Select ada@example.com" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Add to list" }));
    await screen.findByRole("dialog");

    goBack();
    await expect.poll(() => screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(
      await screen.findByRole("checkbox", { name: "Select ada@example.com" })
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the list filter in place while the next rows load", async () => {
    let answer = false;
    api.use(
      http.get(
        "*/api/organizations/:organizationId/contacts",
        async ({ request }) => {
          if (new URL(request.url).searchParams.has("list")) {
            return HttpResponse.json(page([]));
          }

          await vi.waitUntil(() => answer, { timeout: 5000 });

          return HttpResponse.json(page([ADA]));
        }
      ),
      ...audience()
    );

    renderWithOrganizations(
      <NavigatedContacts
        back={{}}
        start={{ list: ListIdSchema.make(NEWS.id) }}
      />
    );

    const filter = await screen.findByRole("combobox", { name: "List" });

    goBack();
    await delay(50);

    expect(filter.isConnected).toBeTruthy();

    answer = true;

    await expect(
      screen.findByRole("table", { name: "Contacts" })
    ).resolves.toBeTruthy();
    expect(filter.isConnected).toBeTruthy();
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
