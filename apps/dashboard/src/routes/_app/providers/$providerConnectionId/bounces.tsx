import { ProviderConnectionIdSchema } from "@repo/domain";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Schema } from "effect";

import { NeedsOrganization } from "../../../../audience/needs-organization.tsx";
import { useOrganizations } from "../../../../organizations/organizations.tsx";
import { BouncesPage } from "../../../../providers/bounces-page.tsx";
import { PROVIDERS_NEED_AN_ORGANIZATION } from "../../../../providers/provider-search.ts";

const isConnectionId = Schema.is(ProviderConnectionIdSchema);

const Bounces = () => {
  const { active } = useOrganizations();
  const { providerConnectionId } = Route.useParams();

  if (!isConnectionId(providerConnectionId)) {
    return <Navigate replace to="/providers" />;
  }

  if (!active) {
    return (
      <NeedsOrganization
        description={PROVIDERS_NEED_AN_ORGANIZATION}
        title="Bounces and complaints"
      />
    );
  }

  return (
    <BouncesPage
      key={active.id}
      organization={active}
      providerConnectionId={providerConnectionId}
    />
  );
};

export const Route = createFileRoute(
  "/_app/providers/$providerConnectionId/bounces"
)({
  component: Bounces,
  head: () => ({ meta: [{ title: "Bounces and complaints – Mailquilt" }] }),
});
