import { ProviderConnectionIdSchema } from "@repo/domain";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Schema } from "effect";

import { NeedsOrganization } from "../../../../audience/needs-organization.tsx";
import { useOrganizations } from "../../../../organizations/organizations.tsx";
import { EditPage } from "../../../../providers/connection-pages.tsx";
import { PROVIDERS_NEED_AN_ORGANIZATION } from "../../../../providers/provider-search.ts";

const isConnectionId = Schema.is(ProviderConnectionIdSchema);

const Edit = () => {
  const { active } = useOrganizations();
  const { providerConnectionId } = Route.useParams();

  if (!isConnectionId(providerConnectionId)) {
    return <Navigate replace to="/providers" />;
  }

  if (!active) {
    return (
      <NeedsOrganization
        description={PROVIDERS_NEED_AN_ORGANIZATION}
        title="Edit connection"
      />
    );
  }

  return (
    <EditPage
      key={active.id}
      organization={active}
      providerConnectionId={providerConnectionId}
    />
  );
};

export const Route = createFileRoute(
  "/_app/providers/$providerConnectionId/edit"
)({
  component: Edit,
  head: () => ({ meta: [{ title: "Edit connection – Mailquilt" }] }),
});
