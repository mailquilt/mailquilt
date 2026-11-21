import { Radio } from "@cloudflare/kumo";
import { useSyncExternalStore } from "react";

import {
  DEFAULT_THEME_PREFERENCE,
  readThemePreference,
  saveThemePreference,
  subscribeToThemePreference,
} from "./theme.ts";

const prerenderedPreference = () => DEFAULT_THEME_PREFERENCE;

/** Light, dark or the device's setting, remembered in this browser. */
export const ThemePicker = () => {
  const preference = useSyncExternalStore(
    subscribeToThemePreference,
    readThemePreference,
    prerenderedPreference
  );

  return (
    <Radio.Group
      appearance="segmented"
      legend="Theme"
      onValueChange={saveThemePreference}
      orientation="horizontal"
      value={preference}
    >
      <Radio.Item label="Light" value="light" />
      <Radio.Item label="Dark" value="dark" />
      <Radio.Item label="System" value="system" />
    </Radio.Group>
  );
};
