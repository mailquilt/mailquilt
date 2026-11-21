import { Badge, Loader, Text } from "@cloudflare/kumo";
import { DatabaseUnreachable } from "@repo/domain";
import { queryOptions, useQuery } from "@tanstack/react-query";

import { callApi } from "../api.ts";

const healthQuery = queryOptions({
  queryFn: ({ signal }) => callApi((client) => client.health(), signal),
  queryKey: ["health"],
  retry: false,
});

/** Whether the API is up and can reach its Postgres database. */
export const HealthStatus = () => {
  const { error, isPending } = useQuery(healthQuery);

  if (isPending) {
    return <Loader />;
  }

  if (error instanceof DatabaseUnreachable) {
    return (
      <div className="flex flex-col gap-2">
        <Badge variant="error">Database unreachable</Badge>
        <Text variant="secondary">
          The API is running but cannot query Postgres.
        </Text>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-2">
        <Badge variant="error">API unreachable</Badge>
        <Text variant="secondary">The dashboard cannot reach the API.</Text>
      </div>
    );
  }

  return <Badge variant="success">Database connected</Badge>;
};
