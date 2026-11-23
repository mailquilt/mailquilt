import {
  createFileRoute,
  deepEqual,
  Navigate,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { Effect, Schema } from "effect";

import { LinkExpired } from "../../auth/link-expired.tsx";

const decodeVerifiedSearch = Schema.decodeUnknownSync(
  Schema.Struct({
    error: Schema.optionalKey(
      Schema.String.pipe(Schema.catchDecoding(() => Effect.succeedNone))
    ),
  })
);

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
  // WARNING: the router keeps every key validateSearch leaves out, so an address with a part it drops is replaced with the cleaned one (ADR 0012).
  beforeLoad: ({ search }) => {
    const cleaned = decodeVerifiedSearch(search);

    if (!deepEqual(cleaned, search)) {
      throw redirect({ search: cleaned, to: "/email-verified" });
    }
  },
  component: IntoTheAppOrLinkExpired,
  head: () => ({ meta: [{ title: "Verify your email – Mailquilt" }] }),
  validateSearch: decodeVerifiedSearch,
});
