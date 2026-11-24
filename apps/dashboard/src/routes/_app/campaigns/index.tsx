import { createFileRoute, deepEqual, redirect } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { NeedsOrganization } from "../../../audience/needs-organization.tsx";
import {
  CAMPAIGNS_NEED_AN_ORGANIZATION,
  readCampaignSearch,
} from "../../../campaigns/campaign-search.ts";
import type { CampaignSearch } from "../../../campaigns/campaign-search.ts";
import { CampaignsPage } from "../../../campaigns/campaigns-page.tsx";
import { useOrganizations } from "../../../organizations/organizations.tsx";

const Campaigns = () => {
  const { active } = useOrganizations();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const shownFor = useRef(active?.id);

  // WARNING: cursors belong to one Organization; switching keeps the page but must drop them.
  useEffect(() => {
    if (shownFor.current !== active?.id) {
      shownFor.current = active?.id;
      navigate({ replace: true, search: {} });
    }
  }, [active?.id, navigate]);

  if (!active) {
    return (
      <NeedsOrganization
        description={CAMPAIGNS_NEED_AN_ORGANIZATION}
        title="Campaigns"
      />
    );
  }

  return (
    <CampaignsPage
      key={active.id}
      onSearch={(next: CampaignSearch) => navigate({ search: next })}
      organization={active}
      search={search}
    />
  );
};

export const Route = createFileRoute("/_app/campaigns/")({
  // WARNING: the router keeps every key validateSearch leaves out, so an address with a part it drops is replaced with the cleaned one (ADR 0012).
  beforeLoad: ({ search }) => {
    const cleaned = readCampaignSearch(search);

    if (!deepEqual(cleaned, search)) {
      throw redirect({ search: cleaned, to: "/campaigns" });
    }
  },
  component: Campaigns,
  head: () => ({ meta: [{ title: "Campaigns – Mailquilt" }] }),
  validateSearch: readCampaignSearch,
});
