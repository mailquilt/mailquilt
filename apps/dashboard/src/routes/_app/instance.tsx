import { createFileRoute } from "@tanstack/react-router";

import { InstanceSettingsPage } from "../../instance/instance-settings-page.tsx";

export const Route = createFileRoute("/_app/instance")({
  component: InstanceSettingsPage,
  head: () => ({ meta: [{ title: "Instance settings – Mailquilt" }] }),
});
