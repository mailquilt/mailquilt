import { createFileRoute, deepEqual, redirect } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { NeedsOrganization } from "../../audience/needs-organization.tsx";
import { readSuppressionSearch } from "../../audience/suppression-search.ts";
import type { SuppressionSearch } from "../../audience/suppression-search.ts";
import { SuppressionsPage } from "../../audience/suppressions-page.tsx";
import { useOrganizations } from "../../organizations/organizations.tsx";

const Suppressions = () => {
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
        description="Suppressions belong to an organization. Name yours on Home first."
        title="Suppressions"
      />
    );
  }

  return (
    <SuppressionsPage
      key={active.id}
      onSearch={(next: SuppressionSearch) => navigate({ search: next })}
      organization={active}
      search={search}
    />
  );
};

export const Route = createFileRoute("/_app/suppressions")({
  // WARNING: the router keeps every key validateSearch leaves out, so an address with a part it drops is replaced with the cleaned one (ADR 0012).
  beforeLoad: ({ search }) => {
    const cleaned = readSuppressionSearch(search);

    if (!deepEqual(cleaned, search)) {
      throw redirect({ search: cleaned, to: "/suppressions" });
    }
  },
  component: Suppressions,
  head: () => ({ meta: [{ title: "Suppressions – Mailquilt" }] }),
  validateSearch: readSuppressionSearch,
});
