import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LoadFailed } from "./empty-state.tsx";

describe(LoadFailed, () => {
  afterEach(cleanup);

  it("keeps Try again focusable while it retries, and doesn't retry twice", () => {
    const retry = vi.fn<() => void>();
    render(
      <LoadFailed onRetry={retry} retrying title="Your contacts didn’t load" />
    );

    const button = screen.getByRole("button", { name: "Trying again…" });
    button.focus();
    fireEvent.click(button);

    expect(button).toHaveProperty("disabled", false);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(button);
    expect(retry).not.toHaveBeenCalled();
  });
});
