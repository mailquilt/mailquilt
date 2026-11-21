import { DropdownMenu } from "@cloudflare/kumo";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { DetachedWindowAPI } from "happy-dom";
import { afterEach, describe, expect, it } from "vitest";

import { ThemePicker } from "./theme-picker.tsx";
import { themeScript } from "./theme.ts";

declare global {
  interface Window {
    readonly happyDOM?: DetachedWindowAPI;
  }
}

const renderOpenMenu = () =>
  render(
    <DropdownMenu defaultOpen>
      <DropdownMenu.Trigger>
        <button type="button">Account</button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        <ThemePicker />
      </DropdownMenu.Content>
    </DropdownMenu>
  );

const isChosen = (name: string) =>
  screen.getByRole("menuitemradio", { name }).getAttribute("aria-checked") ===
  "true";

const reloadPage = () => {
  cleanup();
  delete document.documentElement.dataset.mode;
  // oxlint-disable-next-line no-new-func -- runs the shell's inline script as the browser would on load.
  new Function(themeScript)();
  renderOpenMenu();
};

const setDeviceColorScheme = (scheme: "light" | "dark") => {
  const { happyDOM } = window;

  if (happyDOM) {
    happyDOM.settings.device.prefersColorScheme = scheme;
  }
};

describe("theme picker", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    setDeviceColorScheme("light");
  });

  it("keeps the chosen theme after a reload", () => {
    renderOpenMenu();

    fireEvent.click(screen.getByRole("menuitemradio", { name: "Dark" }));
    reloadPage();

    expect(document.documentElement.dataset.mode).toBe("dark");
    expect(isChosen("Dark")).toBeTruthy();
  });

  it("follows the device setting only while matching the device is chosen", () => {
    setDeviceColorScheme("dark");
    renderOpenMenu();

    fireEvent.click(screen.getByRole("menuitemradio", { name: "Light" }));
    reloadPage();
    expect(document.documentElement.dataset.mode).toBe("light");

    fireEvent.click(
      screen.getByRole("menuitemradio", { name: "Match my device" })
    );
    reloadPage();
    expect(document.documentElement.dataset.mode).toBe("dark");
  });
});
