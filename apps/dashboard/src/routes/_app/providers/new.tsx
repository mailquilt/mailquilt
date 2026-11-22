import { createFileRoute } from "@tanstack/react-router";

import { NeedsOrganization } from "../../../audience/needs-organization.tsx";
import { useOrganizations } from "../../../organizations/organizations.tsx";
import { ConnectPage } from "../../../providers/connection-pages.tsx";
import { PROVIDERS_NEED_AN_ORGANIZATION } from "../../../providers/provider-search.ts";

const Connect = () => {
  const { active } = useOrganizations();

  if (!active) {
    return (
      <NeedsOrganization
        description={PROVIDERS_NEED_AN_ORGANIZATION}
        title="Connect an SMTP server"
      />
    );
  }

  return <ConnectPage key={active.id} organization={active} />;
};

export const Route = createFileRoute("/_app/providers/new")({
  component: Connect,
  head: () => ({ meta: [{ title: "Connect an SMTP server – Mailquilt" }] }),
});
