import { CampaignIdSchema } from "@repo/domain";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Schema } from "effect";

import { NeedsOrganization } from "../../../../audience/needs-organization.tsx";
import { EditCampaignPage } from "../../../../campaigns/campaign-form-pages.tsx";
import { CAMPAIGNS_NEED_AN_ORGANIZATION } from "../../../../campaigns/campaign-search.ts";
import { useOrganizations } from "../../../../organizations/organizations.tsx";

const isCampaignId = Schema.is(CampaignIdSchema);

const EditCampaign = () => {
  const { active } = useOrganizations();
  const { campaignId } = Route.useParams();

  if (!isCampaignId(campaignId)) {
    return <Navigate replace to="/campaigns" />;
  }

  if (!active) {
    return (
      <NeedsOrganization
        description={CAMPAIGNS_NEED_AN_ORGANIZATION}
        title="Edit draft"
      />
    );
  }

  return (
    <EditCampaignPage
      campaignId={campaignId}
      key={active.id}
      organization={active}
    />
  );
};

export const Route = createFileRoute("/_app/campaigns/$campaignId/edit")({
  component: EditCampaign,
  head: () => ({ meta: [{ title: "Edit draft – Mailquilt" }] }),
});
