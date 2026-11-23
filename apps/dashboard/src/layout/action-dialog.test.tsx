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
});
