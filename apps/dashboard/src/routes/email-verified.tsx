import { Surface } from "@cloudflare/kumo";
import { createFileRoute } from "@tanstack/react-router";
import { Schema } from "effect";

import { EmailVerified } from "../auth/email-verified.tsx";

const EmailVerifiedPage = () => {
  const { error } = Route.useSearch();

  return (
    <Surface className="mx-auto max-w-sm rounded-lg p-6">
      <EmailVerified error={error} />
    </Surface>
  );
};

export const Route = createFileRoute("/email-verified")({
  component: EmailVerifiedPage,
  validateSearch: Schema.toStandardSchemaV1(
    Schema.Struct({ error: Schema.optional(Schema.String) })
  ),
});
