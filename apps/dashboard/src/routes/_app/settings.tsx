import { createFileRoute } from "@tanstack/react-router";

import { NeedsOrganization } from "../../audience/needs-organization.tsx";
import { OrganizationSettingsPage } from "../../organizations/organization-settings-page.tsx";
import { useOrganizations } from "../../organizations/organizations.tsx";

const Settings = () => {
  const { active } = useOrganizations();

  if (!active) {
    return (
      <NeedsOrganization
        description="Settings belong to an organization. Name yours on Home first."
        title="Settings"
      />
    );
  }

  return <OrganizationSettingsPage key={active.id} organization={active} />;
};

export const Route = createFileRoute("/_app/settings")({
  component: Settings,
  head: () => ({ meta: [{ title: "Settings – Mailquilt" }] }),
});
