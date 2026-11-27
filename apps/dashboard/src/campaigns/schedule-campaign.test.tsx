import { CampaignIdSchema, Organization } from "@repo/domain";
import { focusManager } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  screen,
  within,
} from "@testing-library/react";
import { Schema } from "effect";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  ACME,
  renderWithOrganizations,
} from "../organizations/test-organizations.tsx";
import { CampaignPage } from "./campaign-page.tsx";
import { CAMPAIGN, DRAFT, ready, RECIPIENT_COUNT } from "./test-campaigns.ts";

const api = setupServer();

const organization = Schema.decodeUnknownSync(Organization)(ACME);

const SCHEDULE = `${CAMPAIGN}/schedule`;

const NOW = new Date("2026-11-27T10:20:00.000Z");

const NINE_IN_NEW_YORK = {
  at: "2026-11-30T14:00:00.000Z",
  missed: null,
  timeZone: "America/New_York",
};

const SCHEDULED = {
  ...DRAFT,
  schedule: NINE_IN_NEW_YORK,
  status: "scheduled",
};

const renderPage = () =>
  renderWithOrganizations(
    <CampaignPage
      campaignId={CampaignIdSchema.make(DRAFT.id)}
      organization={organization}
    />
  );

const statusLine = () => document.querySelector("header p")?.textContent ?? "";

const openSchedule = async () => {
  fireEvent.click(await screen.findByRole("button", { name: "Schedule" }));

  return screen.findByRole("dialog", { name: "Schedule this campaign" });
};

const pickDay = async (dialog: HTMLElement, name: RegExp) => {
  fireEvent.click(within(dialog).getByRole("button", { name: /^Day /u }));
  fireEvent.click(await screen.findByRole("button", { name }));
};

const typeTime = (dialog: HTMLElement, time: string) =>
  fireEvent.change(within(dialog).getByLabelText("Time (24-hour)"), {
    target: { value: time },
  });

const submit = (dialog: HTMLElement) =>
  fireEvent.submit(dialog.querySelector("form") ?? document.body);

describe("scheduling a campaign", () => {
  const zone = process.env.TZ;

  beforeAll(() => {
    // WARNING: the viewer's time zone is the browser's, so the tests set one; what they show "for you" depends on it.
    process.env.TZ = "Europe/London";
    api.listen({ onUnhandledFrame: "error" });
  });

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, shouldAdvanceTime: true });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    api.resetHandlers();
  });

  afterAll(() => {
    process.env.TZ = zone;
    api.close();
  });

  it("schedules a draft for a day and time in the time zone chosen, and says when that is for you", async () => {
    const asked: unknown[] = [];
    api.use(
      ...ready(),
      http.get(CAMPAIGN, () => HttpResponse.json(DRAFT)),
      http.put(SCHEDULE, async ({ request }) => {
        asked.push(await request.json());

        return HttpResponse.json(SCHEDULED);
      })
    );
    renderPage();

    const dialog = await openSchedule();
    expect(dialog.textContent).toContain(
      "Choose a day and a time to see exactly when it goes."
    );

    await pickDay(dialog, /November 30/u);
    typeTime(dialog, "900");
    fireEvent.click(
      within(dialog).getByRole("combobox", { name: /Time zone/u })
    );
    fireEvent.change(await screen.findByLabelText("Search time zones"), {
      target: { value: "new york" },
    });
    fireEvent.click(await screen.findByRole("option", { name: /^New York/u }));

    await expect
      .poll(() => dialog.textContent)
      .toContain("Monday, Nov 30 at 9:00 in New York");
    expect(dialog.textContent).toContain("That’s 14:00 for you in London.");

    submit(dialog);

    await expect
      .poll(statusLine)
      .toContain(
        "Scheduled for Monday, Nov 30 at 9:00 in New York (14:00 for you)."
      );
    expect(asked).toStrictEqual([
      { localDateTime: "2026-11-30T09:00", timeZone: "America/New_York" },
    ]);
    await expect(
      screen.findByText("Scheduled for Monday, Nov 30 at 9:00")
    ).resolves.toBeDefined();
    expect(
      within(document.querySelector("header") ?? document.body)
        .getAllByRole("button")
        .map((button) => button.textContent)
    ).toStrictEqual(["Cancel schedule", "Change time"]);
  });

  it("asks for a day and a time, and won't schedule a time that has passed", async () => {
    let asked = 0;
    api.use(
      ...ready(),
      http.get(CAMPAIGN, () => HttpResponse.json(DRAFT)),
      http.put(SCHEDULE, () => {
        asked += 1;

        return HttpResponse.json(SCHEDULED);
      })
    );
    renderPage();

    const dialog = await openSchedule();
    submit(dialog);

    const dayButton = within(dialog).getByRole("button", { name: /^Day /u });

    await expect
      .poll(
        () =>
          document.querySelector(
            `[id="${dayButton.getAttribute("aria-describedby")}"]`
          )?.textContent
      )
      .toBe("Choose a day.");
    expect(
      within(dialog).getByText(
        "Give a time on the 24-hour clock, such as 9:00 or 14:30."
      )
    ).toBeDefined();

    await pickDay(dialog, /November 27/u);
    typeTime(dialog, "9:00");

    await expect(
      within(dialog).findByText("9:00 has passed. It’s 10:20 now.")
    ).resolves.toBeDefined();

    submit(dialog);
    expect(asked).toBe(0);
  });

  it("says on the Time field when the server finds the time has passed", async () => {
    api.use(
      ...ready(),
      http.get(CAMPAIGN, () => HttpResponse.json(DRAFT)),
      http.put(SCHEDULE, () =>
        HttpResponse.json({ _tag: "ScheduleInPast" }, { status: 422 })
      )
    );
    renderPage();

    const dialog = await openSchedule();
    await pickDay(dialog, /November 28/u);
    typeTime(dialog, "9:00");
    submit(dialog);

    await expect(
      within(dialog).findByText(
        "Mailquilt’s server says that time has passed. Check your device’s clock, or choose a later time."
      )
    ).resolves.toBeDefined();
    expect(screen.getByRole("dialog", { name: "Schedule this campaign" })).toBe(
      dialog
    );
  });

  it("closes and says why when the server refuses it for having no one to send to", async () => {
    api.use(
      ...ready(),
      http.get(CAMPAIGN, () => HttpResponse.json(DRAFT)),
      http.put(SCHEDULE, () =>
        HttpResponse.json({ _tag: "NoSubscribedContacts" }, { status: 409 })
      )
    );
    renderPage();

    const dialog = await openSchedule();
    await pickDay(dialog, /November 30/u);
    typeTime(dialog, "9:00");
    submit(dialog);

    await expect(
      screen.findByText("No one to send to yet")
    ).resolves.toBeDefined();
    expect(statusLine()).toContain("Draft");
  });

  it("cancels a schedule at once, and keeps the time it had in the toast", async () => {
    let cancels = 0;
    api.use(
      ...ready(),
      http.get(CAMPAIGN, () => HttpResponse.json(SCHEDULED)),
      http.delete(SCHEDULE, () => {
        cancels += 1;

        return HttpResponse.json({ ...DRAFT });
      })
    );
    renderPage();

    await expect
      .poll(statusLine)
      .toContain(
        "Scheduled for Monday, Nov 30 at 9:00 in New York (14:00 for you). Nothing has been sent, and it can’t be edited until you cancel the schedule."
      );

    fireEvent.click(screen.getByRole("button", { name: "Cancel schedule" }));

    await expect.poll(statusLine).toContain("Draft, created");
    expect(cancels).toBe(1);
    await expect(
      screen.findByText("Schedule cancelled")
    ).resolves.toBeDefined();
    expect(
      screen.getByText(
        "It was set for 9:00 on Monday, Nov 30 in New York. It’s a draft again, and nothing was sent."
      )
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Schedule" })).toBeDefined();
  });

  it("moves a schedule, starting from the time it has", async () => {
    const asked: unknown[] = [];
    api.use(
      ...ready(),
      http.get(CAMPAIGN, () => HttpResponse.json(SCHEDULED)),
      http.put(SCHEDULE, async ({ request }) => {
        asked.push(await request.json());

        return HttpResponse.json({
          ...SCHEDULED,
          schedule: { ...NINE_IN_NEW_YORK, at: "2026-11-30T15:00:00.000Z" },
        });
      })
    );
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Change time" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Change when it sends",
    });

    expect(
      within(dialog).getByRole("button", { name: "Day Mon, Nov 30" })
    ).toBeDefined();
    typeTime(dialog, "10:00");
    expect(dialog.textContent).toContain(
      "It’s set for Monday, Nov 30 at 9:00 in New York now."
    );
    submit(dialog);

    await expect
      .poll(statusLine)
      .toContain("Scheduled for Monday, Nov 30 at 10:00 in New York");
    expect(asked).toStrictEqual([
      { localDateTime: "2026-11-30T10:00", timeZone: "America/New_York" },
    ]);
    await expect(
      screen.findByText("Moved to Monday, Nov 30 at 10:00")
    ).resolves.toBeDefined();
  });

  it("schedules a draft that missed its time again from the zone and time it had", async () => {
    const asked: unknown[] = [];
    api.use(
      ...ready({ recipients: 3 }),
      http.get(CAMPAIGN, () =>
        HttpResponse.json({
          ...DRAFT,
          schedule: { ...NINE_IN_NEW_YORK, missed: "no-subscribed-contacts" },
        })
      ),
      http.put(SCHEDULE, async ({ request }) => {
        asked.push(await request.json());

        return HttpResponse.json(SCHEDULED);
      })
    );
    renderPage();

    const dialog = await openSchedule();

    await pickDay(dialog, /November 30/u);
    submit(dialog);

    await expect
      .poll(() => asked)
      .toStrictEqual([
        { localDateTime: "2026-11-30T09:00", timeZone: "America/New_York" },
      ]);
  });

  it("offers today in the chosen time zone when it's still today there", async () => {
    vi.setSystemTime(new Date("2026-11-28T03:00:00.000Z"));

    const asked: unknown[] = [];
    api.use(
      ...ready(),
      http.get(CAMPAIGN, () => HttpResponse.json(DRAFT)),
      http.put(SCHEDULE, async ({ request }) => {
        asked.push(await request.json());

        return HttpResponse.json(SCHEDULED);
      })
    );
    renderPage();

    const dialog = await openSchedule();

    fireEvent.click(
      within(dialog).getByRole("combobox", { name: /Time zone/u })
    );
    fireEvent.change(await screen.findByLabelText("Search time zones"), {
      target: { value: "los angeles" },
    });
    fireEvent.click(
      await screen.findByRole("option", { name: /^Los Angeles/u })
    );
    await pickDay(dialog, /November 27/u);
    typeTime(dialog, "22:00");
    submit(dialog);

    await expect
      .poll(() => asked)
      .toStrictEqual([
        { localDateTime: "2026-11-27T22:00", timeZone: "America/Los_Angeles" },
      ]);
  });

  it("warns that a scheduled campaign whose connection was deleted won't be sent, and keeps its schedule's actions", async () => {
    api.use(
      ...ready({ connections: [] }),
      http.get(CAMPAIGN, () => HttpResponse.json(SCHEDULED))
    );
    renderPage();

    await expect(
      screen.findByText(
        "It won’t be sent at 9:00 on Monday, Nov 30 in New York"
      )
    ).resolves.toBeDefined();
    expect(
      within(document.querySelector("header") ?? document.body)
        .getAllByRole("button")
        .map((button) => button.textContent)
    ).toStrictEqual(["Cancel schedule", "Change time"]);
  });

  it("says a campaign someone else scheduled is scheduled, not already sending", async () => {
    let asked = 0;
    api.use(
      ...ready(),
      http.get(CAMPAIGN, () => {
        asked += 1;

        return HttpResponse.json(asked === 1 ? DRAFT : SCHEDULED);
      }),
      http.post(`${CAMPAIGN}/send`, () =>
        HttpResponse.json({ _tag: "CampaignNotDraft" }, { status: 409 })
      )
    );
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Send now" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Send this campaign now?",
    });

    submit(dialog);

    await expect.poll(statusLine).toContain("Scheduled for Monday, Nov 30");
    expect(screen.queryByText(/already sending/u)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Cancel schedule" })
    ).toBeDefined();
  });

  it("starts Change time from the schedule as it is now, after someone else moved it", async () => {
    let asked = 0;
    api.use(
      ...ready(),
      http.get(CAMPAIGN, () => {
        asked += 1;

        return HttpResponse.json(
          asked === 1
            ? SCHEDULED
            : {
                ...SCHEDULED,
                schedule: {
                  ...NINE_IN_NEW_YORK,
                  at: "2026-11-30T15:00:00.000Z",
                },
              }
        );
      })
    );
    renderPage();

    await expect.poll(statusLine).toContain("at 9:00 in New York");

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    await expect.poll(statusLine).toContain("at 10:00 in New York");

    fireEvent.click(screen.getByRole("button", { name: "Change time" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Change when it sends",
    });

    expect(within(dialog).getByLabelText("Time (24-hour)")).toHaveProperty(
      "value",
      "10:00"
    );
  });

  it("counts again when a scheduled campaign comes back as a draft that missed its time", async () => {
    let asked = 0;
    let counted = 0;
    api.use(
      http.get(RECIPIENT_COUNT, () => {
        counted += 1;

        return HttpResponse.json({ recipients: counted === 1 ? 3 : 0 });
      }),
      ...ready(),
      http.get(CAMPAIGN, () => {
        asked += 1;

        return HttpResponse.json(
          asked === 1
            ? SCHEDULED
            : {
                ...DRAFT,
                schedule: {
                  ...NINE_IN_NEW_YORK,
                  missed: "no-subscribed-contacts",
                },
              }
        );
      })
    );
    renderPage();

    await expect.poll(statusLine).toContain("Scheduled for");

    await act(() => vi.advanceTimersByTimeAsync(60 * 60 * 1000));

    await expect(
      screen.findByText(
        /Everyone subscribed to Roast of the month is or was on a list/u
      )
    ).resolves.toBeDefined();
    expect(screen.queryByText(/would get it now/u)).toBeNull();
  });

  it("says why a draft missed its time, with what to do while that still holds", async () => {
    api.use(
      ...ready({ connections: [] }),
      http.get(CAMPAIGN, () =>
        HttpResponse.json({
          ...DRAFT,
          schedule: { ...NINE_IN_NEW_YORK, missed: "no-provider-connection" },
        })
      )
    );
    renderPage();

    await expect(
      screen.findByText("It wasn’t sent at 9:00 on Monday, Nov 30 in New York")
    ).resolves.toBeDefined();
    expect(
      screen.getByText(
        "Its provider connection was deleted before then, so it went back to being a draft. Edit it to choose another connection, then schedule it again or send it now."
      )
    ).toBeDefined();
    expect(screen.queryByText(/Choose a provider connection/u)).toBeNull();
    expect(screen.queryByRole("button", { name: "Schedule" })).toBeNull();
  });

  it("offers Schedule and Send now again once what a draft missed its time for has gone", async () => {
    api.use(
      ...ready({ recipients: 3 }),
      http.get(CAMPAIGN, () =>
        HttpResponse.json({
          ...DRAFT,
          schedule: { ...NINE_IN_NEW_YORK, missed: "no-subscribed-contacts" },
        })
      )
    );
    renderPage();

    await expect(
      screen.findByText(
        "No one would have got it then, so it went back to being a draft. 3 contacts would get it now: schedule it again, or send it now."
      )
    ).resolves.toBeDefined();
    expect(screen.getByRole("button", { name: "Schedule" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Send now" })).toBeDefined();
  });
});
