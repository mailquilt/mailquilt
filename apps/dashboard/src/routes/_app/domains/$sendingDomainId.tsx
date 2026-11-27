import { SendingDomainIdSchema } from "@repo/domain";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Schema } from "effect";

import { NeedsOrganization } from "../../../audience/needs-organization.tsx";
import { DomainPage } from "../../../domains/domain-page.tsx";
import { DOMAINS_NEED_AN_ORGANIZATION } from "../../../domains/domain-search.ts";
import { useOrganizations } from "../../../organizations/organizations.tsx";

const isSendingDomainId = Schema.is(SendingDomainIdSchema);

const Domain = () => {
  const { active } = useOrganizations();
  const { sendingDomainId } = Route.useParams();

  if (!isSendingDomainId(sendingDomainId)) {
    return <Navigate replace to="/domains" />;
  }

  if (!active) {
    return (
      <NeedsOrganization
        description={DOMAINS_NEED_AN_ORGANIZATION}
        title="Domain"
      />
    );
  }

  return (
    <DomainPage
      key={active.id}
      organization={active}
      sendingDomainId={sendingDomainId}
    />
  );
};

export const Route = createFileRoute("/_app/domains/$sendingDomainId")({
  component: Domain,
  head: () => ({ meta: [{ title: "Domain – Mailquilt" }] }),
});
