import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { HealthStatus } from "./health-status.tsx";

const api = setupServer();

const renderHealthStatus = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <HealthStatus />
    </QueryClientProvider>
  );

describe("health status", () => {
  beforeAll(() => api.listen({ onUnhandledFrame: "error" }));
  afterEach(() => {
    cleanup();
    api.resetHandlers();
  });

  afterAll(() => api.close());

  it("announces the database as connected when the API is healthy", async () => {
    api.use(
      http.get("/health", () => HttpResponse.json({ database: "connected" }))
    );

    renderHealthStatus();

    await expect(
      screen.findByText("Database connected")
    ).resolves.toBeDefined();
    expect(screen.getByRole("status").textContent).toBe("Database connected");
  });

  it("shows the database as unreachable when the API reports it", async () => {
    api.use(
      http.get("/health", () =>
        HttpResponse.json({ _tag: "DatabaseUnreachable" }, { status: 503 })
      )
    );

    renderHealthStatus();

    await expect(
      screen.findByText("Database unreachable")
    ).resolves.toBeDefined();
  });

  it("shows the API as unreachable when the request fails", async () => {
    api.use(http.get("/health", () => HttpResponse.error()));

    renderHealthStatus();

    await expect(screen.findByText("API unreachable")).resolves.toBeDefined();
  });
});
