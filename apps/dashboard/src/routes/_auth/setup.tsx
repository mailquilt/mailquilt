import { createFileRoute } from "@tanstack/react-router";

import { SetupPage } from "../../instance/setup-page.tsx";

export const Route = createFileRoute("/_auth/setup")({
  component: SetupPage,
  head: () => ({ meta: [{ title: "Setup – Mailquilt" }] }),
});
