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

const reloadPage = () => {
  cleanup();
  delete document.documentElement.dataset.mode;
  // oxlint-disable-next-line no-new-func -- runs the shell's inline script as the browser would on load.
  new Function(themeScript)();
  render(<ThemePicker />);
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
    render(<ThemePicker />);

    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    reloadPage();

    expect(document.documentElement.dataset.mode).toBe("dark");
    expect(
      screen.getByRole("radio", { name: "Dark" }).getAttribute("aria-checked")
    ).toBe("true");
  });

  it("follows the device setting only while System is chosen", () => {
    setDeviceColorScheme("dark");
    render(<ThemePicker />);

    fireEvent.click(screen.getByRole("radio", { name: "Light" }));
    reloadPage();
    expect(document.documentElement.dataset.mode).toBe("light");

    fireEvent.click(screen.getByRole("radio", { name: "System" }));
    reloadPage();
    expect(document.documentElement.dataset.mode).toBe("dark");
  });
});
