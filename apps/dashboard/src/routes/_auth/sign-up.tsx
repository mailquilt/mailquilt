import { createFileRoute } from "@tanstack/react-router";

import { SignUpPage } from "../../auth/sign-up-page.tsx";

export const Route = createFileRoute("/_auth/sign-up")({
  component: SignUpPage,
  head: () => ({ meta: [{ title: "Create your account – Mailquilt" }] }),
});
