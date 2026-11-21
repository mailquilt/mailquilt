import { Badge, Loader, Text } from "@cloudflare/kumo";
import { DatabaseUnreachable } from "@repo/domain";
import { queryOptions, useQuery } from "@tanstack/react-query";

import { callApi } from "../api.ts";

const healthQuery = queryOptions({
  queryFn: ({ signal }) => callApi((client) => client.health(), signal),
  queryKey: ["health"],
  retry: false,
});

const HealthResult = () => {
  const { error, isPending } = useQuery(healthQuery);

  if (isPending) {
    return <Loader />;
  }

  if (error instanceof DatabaseUnreachable) {
    return (
      <>
        <Badge variant="error">Database unreachable</Badge>
        <Text variant="secondary">
          The API is running but cannot query Postgres.
        </Text>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Badge variant="error">API unreachable</Badge>
        <Text variant="secondary">The dashboard cannot reach the API.</Text>
      </>
    );
  }

  return <Badge variant="success">Database connected</Badge>;
};

/**
 * Whether the API is up and can reach its Postgres database. The result
 * replaces the loader inside one live region, so screen readers announce it.
 */
export const HealthStatus = () => (
  <output className="flex flex-col items-start gap-2">
    <HealthResult />
  </output>
);
