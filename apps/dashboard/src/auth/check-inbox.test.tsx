import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
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

import { CheckInbox, RESEND_COOLDOWN_SECONDS } from "./check-inbox.tsx";

const api = setupServer();

let handedOver: unknown;

const renderCheckInbox = (email: string | undefined) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CheckInbox
        email={email}
        onSent={(sentTo) => {
          handedOver = sentTo;
        }}
      />
    </QueryClientProvider>
  );

describe("check your inbox", () => {
  beforeAll(() => api.listen({ onUnhandledFrame: "error" }));
  afterEach(() => {
    cleanup();
    api.resetHandlers();
    vi.useRealTimers();
    handedOver = undefined;
  });

  afterAll(() => api.close());

  it("offers no inbox button when the provider isn't known", () => {
    renderCheckInbox("ada@northwind.studio");

    expect(screen.queryByRole("link", { name: /^Open /u })).toBeNull();
  });

  it("opens Gmail on a search for the email, spam included", () => {
    renderCheckInbox("ada@gmail.com");

    const link = screen.getByRole("link", { name: "Open Gmail" });

    expect(link.getAttribute("href")).toContain("in%3Aanywhere");
  });

  it("lets the person send a new link only after the cooldown", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    let sent = 0;
    api.use(
      http.post("*/api/auth/send-verification-email", () => {
        sent += 1;

        return HttpResponse.json({ status: true });
      })
    );

    renderCheckInbox("ada@northwind.studio");

    expect(
      screen
        .getByRole("button", {
          name: `Send a new link in ${RESEND_COOLDOWN_SECONDS}s`,
        })
        .hasAttribute("disabled")
    ).toBeTruthy();

    for (let second = 0; second < RESEND_COOLDOWN_SECONDS; second += 1) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }

    vi.useRealTimers();
    fireEvent.click(screen.getByRole("button", { name: "Send a new link" }));

    await expect(
      screen.findByText("We sent a new link to ada@northwind.studio.")
    ).resolves.toBeDefined();
    expect(sent).toBe(1);
  });

  it("unlocks a new link once the minute has passed, even after the tab slept", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });

    renderCheckInbox("ada@northwind.studio");
    act(() => {
      vi.setSystemTime(Date.now() + 2 * 60 * 1000);
      vi.advanceTimersByTime(1000);
    });

    expect(
      screen
        .getByRole("button", { name: "Send a new link" })
        .hasAttribute("disabled")
    ).toBeFalsy();
  });

  it("clears the not-sent message once the address is edited", async () => {
    api.use(
      http.post("*/api/auth/send-verification-email", () =>
        HttpResponse.json({ message: "Unavailable" }, { status: 503 })
      )
    );

    renderCheckInbox(undefined);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ada@northwind.studio" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send a new link" }));
    await expect(screen.findByRole("alert")).resolves.toBeDefined();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ada@northwind.org" },
    });

    await expect.poll(() => screen.queryByRole("alert")).toBeNull();
  });

  it("asks for the address when it was opened without one, then sends a link", async () => {
    api.use(
      http.post("*/api/auth/send-verification-email", () =>
        HttpResponse.json({ status: true })
      )
    );

    renderCheckInbox(undefined);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ada@northwind.studio" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send a new link" }));

    await expect.poll(() => handedOver).toBe("ada@northwind.studio");
  });
});
