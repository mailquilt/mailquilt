import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LoadFailed } from "./empty-state.tsx";

const Page = ({ loaded }: { loaded: boolean }) => (
  <>
    <button type="button">Campaigns</button>
    <main id="main" tabIndex={-1}>
      {loaded ? (
        <p>Spring launch</p>
      ) : (
        <LoadFailed
          onRetry={() => null}
          retrying={false}
          title="Your campaigns didn’t load"
        />
      )}
    </main>
  </>
);

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

  it("hands focus to the page once what it stood in for loads", () => {
    const page = render(<Page loaded={false} />);
    screen.getByRole("button", { name: "Try again" }).focus();

    page.rerender(<Page loaded />);

    expect(document.activeElement).toBe(screen.getByRole("main"));
  });

  it("leaves focus where it is when it wasn't on Try again", () => {
    const page = render(<Page loaded={false} />);
    const elsewhere = screen.getByRole("button", { name: "Campaigns" });
    elsewhere.focus();

    page.rerender(<Page loaded />);

    expect(document.activeElement).toBe(elsewhere);
  });
});
