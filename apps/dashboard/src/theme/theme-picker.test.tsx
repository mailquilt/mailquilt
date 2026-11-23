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

const openAppearance = (current: string) =>
  fireEvent.click(
    screen.getByRole("menuitem", { name: `Appearance: ${current}` })
  );

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

  it("keeps the chosen theme after a reload, and shows it on the Appearance row", async () => {
    renderOpenMenu();
    openAppearance("Match my device");

    fireEvent.click(await screen.findByRole("menuitemradio", { name: "Dark" }));
    reloadPage();

    expect(document.documentElement.dataset.mode).toBe("dark");
    openAppearance("Dark");
    expect(isChosen("Dark")).toBeTruthy();
  });

  it("follows the device setting only while matching the device is chosen", async () => {
    setDeviceColorScheme("dark");
    renderOpenMenu();
    openAppearance("Match my device");

    fireEvent.click(
      await screen.findByRole("menuitemradio", { name: "Light" })
    );
    reloadPage();
    expect(document.documentElement.dataset.mode).toBe("light");

    openAppearance("Light");
    fireEvent.click(
      await screen.findByRole("menuitemradio", { name: "Match my device" })
    );
    reloadPage();
    expect(document.documentElement.dataset.mode).toBe("dark");
  });
});
