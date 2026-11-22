import type { Organization } from "@repo/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { callApi } from "../api.ts";
import { PageLoadFailed, PageLoading } from "../layout/page-states.tsx";

const ORGANIZATIONS_QUERY_KEY = ["organizations"] as const;

const STORAGE_KEY = "mailquilt.organization";

const readRemembered = () => {
  try {
    return (
      sessionStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(STORAGE_KEY)
    );
  } catch {
    return null;
  }
};

const remember = (organizationId: string) => {
  try {
    sessionStorage.setItem(STORAGE_KEY, organizationId);
    localStorage.setItem(STORAGE_KEY, organizationId);

    return true;
  } catch {
    return false;
  }
};

const keepForThisTab = (organizationId: string) => {
  try {
    sessionStorage.setItem(STORAGE_KEY, organizationId);

    return true;
  } catch {
    return false;
  }
};

interface OrganizationsState {
  readonly organizations: readonly Organization[];
  readonly active: Organization | null;
  readonly choose: (organizationId: string) => void;
}

const OrganizationsContext = createContext<OrganizationsState | null>(null);

const useOrganizationsState = () => {
  const state = useContext(OrganizationsContext);

  if (!state) {
    throw new Error(
      "Organizations are only known inside OrganizationsProvider"
    );
  }

  return state;
};

/**
 * Loads the signed-in person's Organizations and holds which one this tab
 * works in. Wraps the signed-in pages, and shows them only once the list has
 * loaded, so no page draws "no Organization yet" and then changes its mind.
 *
 * The choice is remembered per tab in session storage, so two tabs can work
 * in two Organizations (ADR 0007), and as the last choice in local storage,
 * for new tabs. A tab keeps whichever Organization it shows, chosen or not,
 * so another tab's later choice never moves it on reload. Where storage is
 * blocked, the choice lasts until the page reloads.
 */
export const OrganizationsProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [chosenId, setChosenId] = useState(readRemembered);

  const query = useQuery({
    queryFn: ({ signal }) =>
      callApi((client) => client.organizations.list(), signal),
    queryKey: ORGANIZATIONS_QUERY_KEY,
  });

  const choose = useCallback((organizationId: string) => {
    remember(organizationId);
    setChosenId(organizationId);
  }, []);

  const organizations = query.data;

  const active =
    organizations?.find((organization) => organization.id === chosenId) ??
    organizations?.[0] ??
    null;

  const activeId = active?.id;

  useEffect(() => {
    if (activeId !== undefined) {
      keepForThisTab(activeId);
    }
  }, [activeId]);

  const state = useMemo(
    () =>
      organizations === undefined ? null : { active, choose, organizations },
    [active, choose, organizations]
  );

  if (state === null) {
    return query.isError ? (
      <PageLoadFailed
        description="Check your connection, then try again."
        onRetry={() => query.refetch()}
        title="Mailquilt couldn’t load your organizations"
      />
    ) : (
      <PageLoading />
    );
  }

  return <OrganizationsContext value={state}>{children}</OrganizationsContext>;
};

/**
 * The signed-in person's Organizations and the one this tab works in: the
 * last one chosen, or their first if that one is gone. `null` until they
 * have one.
 */
export const useOrganizations = () => {
  const { active, choose, organizations } = useOrganizationsState();

  return { active, organizations, switchTo: choose };
};

/** Creates an Organization and switches this tab to it. */
export const useCreateOrganization = () => {
  const queryClient = useQueryClient();
  const { choose } = useOrganizationsState();

  return useMutation({
    mutationFn: (name: string) =>
      callApi((client) => client.organizations.create({ payload: { name } })),
    onSuccess: async (created) => {
      queryClient.setQueryData<readonly Organization[]>(
        ORGANIZATIONS_QUERY_KEY,
        (organizations = []) => [...organizations, created]
      );
      choose(created.id);
      await queryClient.invalidateQueries({
        queryKey: ORGANIZATIONS_QUERY_KEY,
      });
    },
  });
};
