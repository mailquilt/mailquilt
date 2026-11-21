import { DropdownMenu } from "@cloudflare/kumo";
import { MonitorIcon, MoonIcon, SunIcon } from "@phosphor-icons/react";
import { useSyncExternalStore } from "react";

import {
  DEFAULT_THEME_PREFERENCE,
  readThemePreference,
  saveThemePreference,
  subscribeToThemePreference,
} from "./theme.ts";
import type { ThemePreference } from "./theme.ts";

const prerenderedPreference = () => DEFAULT_THEME_PREFERENCE;

const OPTIONS = [
  { icon: SunIcon, label: "Light", value: "light" },
  { icon: MoonIcon, label: "Dark", value: "dark" },
  { icon: MonitorIcon, label: "Match my device", value: "system" },
] as const satisfies readonly {
  icon: typeof SunIcon;
  label: string;
  value: ThemePreference;
}[];

/**
 * Light, dark or the device's setting, remembered in this browser. A group of
 * menu radio items, so it lives inside a `DropdownMenu`.
 */
export const ThemePicker = () => {
  const preference = useSyncExternalStore(
    subscribeToThemePreference,
    readThemePreference,
    prerenderedPreference
  );

  return (
    <DropdownMenu.Group>
      <DropdownMenu.Label className="font-medium text-kumo-subtle">
        Theme
      </DropdownMenu.Label>
      <DropdownMenu.RadioGroup value={preference}>
        {OPTIONS.map(({ icon, label, value }) => (
          <DropdownMenu.RadioItem
            icon={icon}
            key={value}
            onClick={() => saveThemePreference(value)}
            value={value}
          >
            {label}
            <DropdownMenu.RadioItemIndicator />
          </DropdownMenu.RadioItem>
        ))}
      </DropdownMenu.RadioGroup>
    </DropdownMenu.Group>
  );
};
