import { createContext } from "react";

/**
 * Where a crash is drawn: inside the signed-in page block (the sidebar
 * stays), inside the signed-out layout, or on its own when the layout itself
 * failed. Each layout says which it is, so one error component fits all three.
 */
export type CrashPlace = "page" | "auth" | "bare";

export const CrashPlaceContext = createContext<CrashPlace>("bare");
