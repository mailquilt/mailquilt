import { createFileRoute } from "@tanstack/react-router";

import { NeedsOrganization } from "../../../audience/needs-organization.tsx";
import { useAccount } from "../../../layout/session-gates.tsx";
import { useOrganizations } from "../../../organizations/organizations.tsx";
import {
  decodeProvidersSearch,
  PROVIDERS_NEED_AN_ORGANIZATION,
} from "../../../providers/provider-search.ts";
import { ProvidersPage } from "../../../providers/providers-page.tsx";

const Providers = () => {
  const { active } = useOrganizations();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const account = useAccount();

  const arrivedWithNews =
    search.connected !== undefined || search.saved !== undefined;

  if (!active) {
    return (
      <NeedsOrganization
        description={PROVIDERS_NEED_AN_ORGANIZATION}
        title="Providers"
      />
    );
  }

  return (
    <ProvidersPage
      justConnected={search.connected}
      justSaved={search.saved}
      key={active.id}
      onNewsShown={
        arrivedWithNews
          ? () => navigate({ replace: true, search: {} })
          : undefined
      }
      organization={active}
      testEmailTo={account.email}
    />
  );
};

export const Route = createFileRoute("/_app/providers/")({
  component: Providers,
  head: () => ({ meta: [{ title: "Providers – Mailquilt" }] }),
  validateSearch: (search) => decodeProvidersSearch(search),
});
