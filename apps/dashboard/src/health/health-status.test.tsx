import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { HealthStatus } from "./health-status.tsx";

const api = setupServer();

const renderHealthStatus = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <HealthStatus />
    </QueryClientProvider>
  );

  return queryClient;
};

describe("health status", () => {
  beforeAll(() => api.listen({ onUnhandledFrame: "error" }));
  afterEach(() => {
    cleanup();
    api.resetHandlers();
  });

  afterAll(() => api.close());

  it("says nothing while the API and its database are healthy", async () => {
    api.use(
      http.get("/health", () => HttpResponse.json({ database: "connected" }))
    );

    const queryClient = renderHealthStatus();

    await expect
      .poll(() => queryClient.getQueryState(["health"])?.status)
      .toBe("success");
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("announces that the database is unreachable when the API reports it", async () => {
    api.use(
      http.get("/health", () =>
        HttpResponse.json({ _tag: "DatabaseUnreachable" }, { status: 503 })
      )
    );

    renderHealthStatus();

    await expect(
      screen.findByText("Mailquilt can't reach its database")
    ).resolves.toBeDefined();
  });

  it("announces that the API is unreachable when the request fails", async () => {
    api.use(http.get("/health", () => HttpResponse.error()));

    renderHealthStatus();

    await expect(
      screen.findByText("The dashboard can't reach the Mailquilt API")
    ).resolves.toBeDefined();
  });
});
