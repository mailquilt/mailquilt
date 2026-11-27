import { createFileRoute } from "@tanstack/react-router";

import { NeedsOrganization } from "../../../audience/needs-organization.tsx";
import { DOMAINS_NEED_AN_ORGANIZATION } from "../../../domains/domain-search.ts";
import { DomainsPage } from "../../../domains/domains-page.tsx";
import { useOrganizations } from "../../../organizations/organizations.tsx";

const Domains = () => {
  const { active } = useOrganizations();

  if (!active) {
    return (
      <NeedsOrganization
        description={DOMAINS_NEED_AN_ORGANIZATION}
        title="Domains"
      />
    );
  }

  return <DomainsPage key={active.id} organization={active} />;
};

export const Route = createFileRoute("/_app/domains/")({
  component: Domains,
  head: () => ({ meta: [{ title: "Domains – Mailquilt" }] }),
});
