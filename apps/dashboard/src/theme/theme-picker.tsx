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
  { icon: SunIcon, label: "Light", short: "Light", value: "light" },
  { icon: MoonIcon, label: "Dark", short: "Dark", value: "dark" },
  {
    icon: MonitorIcon,
    label: "Match my device",
    short: "Device",
    value: "system",
  },
] as const satisfies readonly {
  icon: typeof SunIcon;
  label: string;
  short: string;
  value: ThemePreference;
}[];

const MENU_PADDING = 6;

const GAP_BETWEEN_MENUS = 8;

/**
 * One "Appearance" row showing the current choice, which opens a submenu:
 * light, dark or the device's setting, remembered in this browser. Lives
 * inside a `DropdownMenu`. With `opensAbove`, for a narrow screen with no
 * room beside the menu, the submenu sits directly above it, edge to edge.
 */
export const ThemePicker = ({
  opensAbove = false,
}: {
  opensAbove?: boolean;
}) => {
  const preference = useSyncExternalStore(
    subscribeToThemePreference,
    readThemePreference,
    prerenderedPreference
  );

  const current =
    OPTIONS.find((option) => option.value === preference) ?? OPTIONS[2];

  return (
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger icon={current.icon}>
        <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
          Appearance <span className="text-kumo-subtle">{current.short}</span>
        </span>
      </DropdownMenu.SubTrigger>
      <DropdownMenu.SubContent
        {...(opensAbove
          ? {
              align: "start",
              alignOffset: -MENU_PADDING,
              className: "w-menu-from-row rounded-xl",
              side: "top",
              sideOffset: MENU_PADDING + GAP_BETWEEN_MENUS,
            }
          : { className: "w-52 rounded-xl" })}
      >
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
      </DropdownMenu.SubContent>
    </DropdownMenu.Sub>
  );
};
