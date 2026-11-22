import { createFileRoute } from "@tanstack/react-router";

import { ListsPage } from "../../audience/lists-page.tsx";
import { NeedsOrganization } from "../../audience/needs-organization.tsx";
import { useOrganizations } from "../../organizations/organizations.tsx";

const Lists = () => {
  const { active } = useOrganizations();

  if (!active) {
    return <NeedsOrganization title="Lists" />;
  }

  return <ListsPage key={active.id} organization={active} />;
};

export const Route = createFileRoute("/_app/lists")({
  component: Lists,
  head: () => ({ meta: [{ title: "Lists – Mailquilt" }] }),
});
