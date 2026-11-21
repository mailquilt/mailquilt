export type ThemePreference = "light" | "dark" | "system";

/** Used until the visitor picks a theme: follow the device's setting. */
export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";

const STORAGE_KEY = "mailquilt-theme";

const applyTheme = (storageKey: string) => {
  let saved: string | null = null;

  try {
    saved = localStorage.getItem(storageKey);
  } catch {
    saved = null;
  }

  const deviceIsDark = matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = saved === "dark" || (saved !== "light" && deviceIsDark);
  document.documentElement.dataset.mode = dark ? "dark" : "light";
};

/**
 * Inline script for the app shell. It sets the theme before the first paint,
 * then follows device changes and choices made in other tabs. `applyTheme`
 * is inlined by its source, so it must not use anything from this module.
 */
export const themeScript = `{
  const apply = () => (${applyTheme.toString()})(${JSON.stringify(STORAGE_KEY)});
  apply();
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", apply);
  addEventListener("storage", apply);
}`;

const listeners = new Set<() => void>();

/** The theme chosen in this browser; `system` when none is saved. */
export const readThemePreference = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    return saved === "light" || saved === "dark"
      ? saved
      : DEFAULT_THEME_PREFERENCE;
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
};

const storeThemePreference = (preference: ThemePreference) => {
  if (preference === "system") {
    localStorage.removeItem(STORAGE_KEY);

    return;
  }

  localStorage.setItem(STORAGE_KEY, preference);
};

/**
 * Saves the choice in this browser only and applies it at once. If the
 * browser blocks storage, nothing changes: the theme keeps following the
 * device, and the picker keeps showing System.
 */
export const saveThemePreference = (preference: ThemePreference) => {
  try {
    storeThemePreference(preference);
  } catch {
    return;
  }

  applyTheme(STORAGE_KEY);

  for (const listener of listeners) {
    listener();
  }
};

/** Calls `onChange` when the choice changes in this tab or another one. */
export const subscribeToThemePreference = (onChange: () => void) => {
  listeners.add(onChange);
  addEventListener("storage", onChange);

  return () => {
    listeners.delete(onChange);
    removeEventListener("storage", onChange);
  };
};
