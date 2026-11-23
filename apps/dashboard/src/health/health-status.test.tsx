import { Toasty } from "@cloudflare/kumo";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, within } from "@testing-library/react";
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

import { HealthStatus } from "./health-status.tsx";

const API_TITLE = "Can’t reach the Mailquilt API";
const DATABASE_TITLE = "Mailquilt can’t reach its database";
const RECHECK_MS = 10_000;

const api = setupServer();

const healthy = () =>
  http.get("/health", () => HttpResponse.json({ database: "connected" }));

const databaseUnreachable = () =>
  http.get("/health", () =>
    HttpResponse.json({ _tag: "DatabaseUnreachable" }, { status: 503 })
  );

const apiUnreachable = () => http.get("/health", () => HttpResponse.error());

const renderHealthStatus = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <Toasty>
        <HealthStatus />
      </Toasty>
    </QueryClientProvider>
  );

  return queryClient;
};

const notifications = () =>
  within(screen.getByRole("region", { name: "Notifications" }));

const recheck = () => act(() => vi.advanceTimersByTimeAsync(RECHECK_MS));

describe("health status", () => {
  beforeAll(() => api.listen({ onUnhandledFrame: "error" }));
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    api.resetHandlers();
  });

  afterAll(() => api.close());

  it("says nothing while the API and its database are healthy", async () => {
    api.use(healthy());

    const queryClient = renderHealthStatus();

    await expect
      .poll(() => queryClient.getQueryState(["health"])?.status)
      .toBe("success");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps one toast, changing its words when the problem changes, and clears it once a re-check succeeds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.use(apiUnreachable());

    renderHealthStatus();

    await expect(notifications().findByText(API_TITLE)).resolves.toBeDefined();

    api.use(databaseUnreachable());
    await recheck();

    await expect(
      notifications().findByText(DATABASE_TITLE)
    ).resolves.toBeDefined();
    expect(notifications().queryByText(API_TITLE)).toBeNull();
    expect(notifications().getAllByRole("dialog")).toHaveLength(1);

    api.use(healthy());
    await recheck();

    await expect
      .poll(() => notifications().queryByText(DATABASE_TITLE))
      .toBeNull();
  });
});
