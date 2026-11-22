import { createFileRoute } from "@tanstack/react-router";

import { SignInPage } from "../../auth/sign-in-page.tsx";

export const Route = createFileRoute("/_auth/sign-in")({
  component: SignInPage,
  head: () => ({ meta: [{ title: "Sign in – Mailquilt" }] }),
});
