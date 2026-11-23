import { createFileRoute, deepEqual, redirect } from "@tanstack/react-router";
import { flow } from "effect";
import { useEffect, useRef } from "react";

import {
  consistentSearch,
  decodeContactSearch,
} from "../../audience/contact-search.ts";
import type { ContactSearch } from "../../audience/contact-search.ts";
import { ContactsPage } from "../../audience/contacts-page.tsx";
import { NeedsOrganization } from "../../audience/needs-organization.tsx";
import { useOrganizations } from "../../organizations/organizations.tsx";

const Contacts = () => {
  const { active } = useOrganizations();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const shownFor = useRef(active?.id);

  // WARNING: a List and cursors belong to one Organization; switching keeps the page but must drop them.
  useEffect(() => {
    if (shownFor.current !== active?.id) {
      shownFor.current = active?.id;
      navigate({ replace: true, search: {} });
    }
  }, [active?.id, navigate]);

  if (!active) {
    return <NeedsOrganization title="Contacts" />;
  }

  return (
    <ContactsPage
      key={active.id}
      onSearch={(next: ContactSearch) => navigate({ search: next })}
      organization={active}
      search={search}
    />
  );
};

const readSearch = flow(decodeContactSearch, consistentSearch);

export const Route = createFileRoute("/_app/contacts")({
  // WARNING: the router keeps every key validateSearch leaves out, so an address with a part it drops is replaced with the cleaned one (ADR 0012).
  beforeLoad: ({ search }) => {
    const cleaned = readSearch(search);

    if (!deepEqual(cleaned, search)) {
      throw redirect({ search: cleaned, to: "/contacts" });
    }
  },
  component: Contacts,
  head: () => ({ meta: [{ title: "Contacts – Mailquilt" }] }),
  validateSearch: readSearch,
});
