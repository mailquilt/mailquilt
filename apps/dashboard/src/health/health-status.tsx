import { DatabaseUnreachable } from "@repo/domain";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useEffect, useEffectEvent } from "react";

import { callApi } from "../api.ts";
import { useProblemToast } from "../layout/toast.tsx";

const RECHECK_WHILE_FAILING_MS = 10_000;

const healthQuery = queryOptions({
  queryFn: ({ signal }) => callApi((client) => client.health(), signal),
  queryKey: ["health"],
  refetchInterval: (query) =>
    query.state.status === "error" ? RECHECK_WHILE_FAILING_MS : false,
  retry: false,
});

const PROBLEMS = {
  api: {
    description:
      "Nothing loads or saves until it’s back. This clears by itself once it answers.",
    title: "Can’t reach the Mailquilt API",
  },
  database: {
    description:
      "Signing in and saving won’t work until Postgres answers at DATABASE_URL. This clears by itself once it does.",
    title: "Mailquilt can’t reach its database",
  },
} as const;

type Problem = keyof typeof PROBLEMS;

const problemOf = (error: Error | null) => {
  if (!error) {
    return null;
  }

  const problem: Problem =
    error instanceof DatabaseUnreachable ? "database" : "api";

  return problem;
};

/**
 * Whether the API is up and can reach its Postgres database. Says nothing
 * while it is. A problem shows as a toast that stays, announced to screen
 * readers, and clears by itself once a re-check succeeds. Mounted once, on
 * every page, inside the toast provider.
 */
export const HealthStatus = () => {
  const { error } = useQuery(healthQuery);
  const problem = problemOf(error);
  const toast = useProblemToast("health");

  const report = useEffectEvent((current: Problem | null) => {
    if (current) {
      toast.show(PROBLEMS[current]);
    } else {
      toast.clear();
    }
  });

  useEffect(() => report(problem), [problem]);

  return null;
};
