import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useDialog } from "./action-dialog.tsx";

describe(useDialog, () => {
  it("keeps its key while opening and moves it on only once the close has finished, so the dialog animates in and starts fresh", () => {
    const { result } = renderHook(() => useDialog());
    const firstKey = result.current.key;

    act(() => result.current.setOpen(true));

    expect(result.current.open).toBeTruthy();
    expect(result.current.key).toBe(firstKey);

    act(() => result.current.handleOpenChange(false));

    expect(result.current.key).toBe(firstKey);

    act(() => result.current.handleExited());

    expect(result.current.key).not.toBe(firstKey);
  });

  it("gives each dialog its own key, so two dialogs side by side never share one and a closed one is always removed", () => {
    const { result } = renderHook(() => ({
      deleting: useDialog(),
      testing: useDialog(),
    }));

    expect(result.current.testing.key).not.toBe(result.current.deleting.key);

    act(() => result.current.testing.handleExited());
    act(() => result.current.deleting.handleExited());

    expect(result.current.testing.key).not.toBe(result.current.deleting.key);
  });
});
