import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { Schema } from "effect";

import { LinkExpired } from "../../auth/link-expired.tsx";

const IntoTheAppOrLinkExpired = () => {
  const { error } = Route.useSearch();
  const navigate = useNavigate();

  if (!error) {
    return <Navigate replace to="/" />;
  }

  return (
    <LinkExpired
      error={error}
      onSent={(email) =>
        navigate({
          state: { verificationEmail: email },
          to: "/check-your-inbox",
        })
      }
    />
  );
};

export const Route = createFileRoute("/_auth/email-verified")({
  component: IntoTheAppOrLinkExpired,
  head: () => ({ meta: [{ title: "Verify your email – Mailquilt" }] }),
  validateSearch: Schema.toStandardSchemaV1(
    Schema.Struct({ error: Schema.optional(Schema.String) })
  ),
});
