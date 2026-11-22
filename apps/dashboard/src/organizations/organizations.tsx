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
import { PageLoading } from "../layout/page-states.tsx";

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
  readonly status: "ready" | "failed";
  readonly organizations: readonly Organization[];
  readonly active: Organization | null;
  readonly choose: (organizationId: string) => void;
  readonly retry: () => void;
  readonly retrying: boolean;
}

const NO_ORGANIZATIONS_KNOWN: readonly Organization[] = [];

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
 * If it can't be loaded, the app shell stays and its page area says so
 * (`OrganizationsUnavailable`), with Try again.
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

  const { refetch } = query;

  const retry = useCallback(() => {
    refetch();
  }, [refetch]);

  const retrying = query.isFetching;

  const state = useMemo(
    () =>
      ({
        active,
        choose,
        organizations: organizations ?? NO_ORGANIZATIONS_KNOWN,
        retry,
        retrying,
        status: organizations === undefined ? "failed" : "ready",
      }) satisfies OrganizationsState,
    [active, choose, organizations, retry, retrying]
  );

  const neverAnswered = query.isPending && query.errorUpdatedAt === 0;

  if (neverAnswered) {
    return <PageLoading />;
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

/** Whether the list loaded, for the app shell; and Try again when it didn't. */
export const useOrganizationsStatus = () => {
  const { retry, retrying, status } = useOrganizationsState();

  return { retry, retrying, status };
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
