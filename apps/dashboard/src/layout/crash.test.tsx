import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { getRouter } from "../router.tsx";
import { CrashPlaceContext } from "./crash-place.ts";
import type { CrashPlace } from "./crash-place.ts";
import { Crash } from "./crash.tsx";

const MESSAGE = "Cannot read properties of undefined (reading 'lists')";

const Throws = () => {
  throw new Error(MESSAGE);
};

const renderCrashIn = (place: CrashPlace) => {
  const root = createRootRoute({
    component: () => (
      <CrashPlaceContext value={place}>
        <Outlet />
      </CrashPlaceContext>
    ),
  });

  const router = createRouter({
    defaultErrorComponent: Crash,
    history: createMemoryHistory({ initialEntries: ["/"] }),
    routeTree: root.addChildren([
      createRoute({ component: Throws, getParentRoute: () => root, path: "/" }),
    ]),
  });

  render(<RouterProvider router={router} />);
};

describe("crash", () => {
  afterEach(() => {
    cleanup();
  });

  it("keeps a page's crash inside the page block, with Reload and the error's message", async () => {
    renderCrashIn("page");

    await expect(
      screen.findByRole("heading", { name: "This page hit an error" })
    ).resolves.toBeDefined();
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Error details" }));

    await expect(screen.findByText(MESSAGE)).resolves.toBeDefined();
    expect(screen.queryByRole("link", { name: "Go to Mailquilt" })).toBeNull();
  });

  it("draws the whole page, with a way home, when no layout is left to draw in", async () => {
    renderCrashIn("bare");

    await expect(
      screen.findByRole("heading", { name: "Something went wrong" })
    ).resolves.toBeDefined();
    expect(screen.getByRole("link", { name: "Go to Mailquilt" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Mailquilt home" })).toBeTruthy();
  });

  it("is the app router's error component", () => {
    expect(getRouter().options.defaultErrorComponent).toBe(Crash);
  });
});
