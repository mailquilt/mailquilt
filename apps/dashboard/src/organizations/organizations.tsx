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

interface Choice {
  readonly chosenId: string | null;
  readonly choose: (organizationId: string) => void;
}

const ChoiceContext = createContext<Choice | null>(null);

const useChoice = () => {
  const choice = useContext(ChoiceContext);

  if (!choice) {
    throw new Error(
      "Organizations are only known inside OrganizationsProvider"
    );
  }

  return choice;
};

/**
 * Holds which Organization this tab works in. Wraps the signed-in pages. The
 * choice is remembered per tab in session storage, so two tabs can work in
 * two Organizations (ADR 0007), and as the last choice in local storage, for
 * new tabs. A tab keeps whichever Organization it shows, chosen or not, so
 * another tab's later choice never moves it on reload. Where storage is
 * blocked, the choice lasts until the page reloads.
 */
export const OrganizationsProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [chosenId, setChosenId] = useState(readRemembered);

  const choose = useCallback((organizationId: string) => {
    remember(organizationId);
    setChosenId(organizationId);
  }, []);

  const choice = useMemo(() => ({ choose, chosenId }), [choose, chosenId]);

  return <ChoiceContext value={choice}>{children}</ChoiceContext>;
};

/**
 * The signed-in person's Organizations and the one this tab works in: the
 * last one chosen, or their first if that one is gone. `null` until they
 * have one.
 */
export const useOrganizations = () => {
  const { chosenId, choose } = useChoice();

  const query = useQuery({
    queryFn: ({ signal }) =>
      callApi((client) => client.organizations.list(), signal),
    queryKey: ORGANIZATIONS_QUERY_KEY,
  });

  const organizations = query.data ?? [];

  const active =
    organizations.find((organization) => organization.id === chosenId) ??
    organizations[0] ??
    null;

  const activeId = active?.id;

  useEffect(() => {
    if (activeId !== undefined) {
      keepForThisTab(activeId);
    }
  }, [activeId]);

  return { active, organizations, query, switchTo: choose };
};

/** Creates an Organization and switches this tab to it. */
export const useCreateOrganization = () => {
  const queryClient = useQueryClient();
  const { choose } = useChoice();

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
