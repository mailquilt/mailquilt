import { createFileRoute, deepEqual, redirect } from "@tanstack/react-router";

import { NeedsOrganization } from "../../../audience/needs-organization.tsx";
import { AddDomainPage } from "../../../domains/add-domain-page.tsx";
import {
  decodeAddDomainSearch,
  DOMAINS_NEED_AN_ORGANIZATION,
} from "../../../domains/domain-search.ts";
import { useOrganizations } from "../../../organizations/organizations.tsx";

const AddDomain = () => {
  const { active } = useOrganizations();
  const { domain } = Route.useSearch();

  if (!active) {
    return (
      <NeedsOrganization
        description={DOMAINS_NEED_AN_ORGANIZATION}
        title="Add a domain"
      />
    );
  }

  return (
    <AddDomainPage domain={domain} key={active.id} organization={active} />
  );
};

export const Route = createFileRoute("/_app/domains/new")({
  // WARNING: the router keeps every key validateSearch leaves out, so an address with a part it drops is replaced with the cleaned one (ADR 0012).
  beforeLoad: ({ search }) => {
    const cleaned = decodeAddDomainSearch(search);

    if (!deepEqual(cleaned, search)) {
      throw redirect({ search: cleaned, to: "/domains/new" });
    }
  },
  component: AddDomain,
  head: () => ({ meta: [{ title: "Add a domain – Mailquilt" }] }),
  validateSearch: decodeAddDomainSearch,
});
