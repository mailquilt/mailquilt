import { Banner } from "@cloudflare/kumo";
import { DatabaseUnreachable } from "@repo/domain";
import { queryOptions, useQuery } from "@tanstack/react-query";

import { callApi } from "../api.ts";

const healthQuery = queryOptions({
  queryFn: ({ signal }) => callApi((client) => client.health(), signal),
  queryKey: ["health"],
  retry: false,
});

const HealthProblem = ({ className }: { className: string | undefined }) => {
  const { error } = useQuery(healthQuery);

  if (error instanceof DatabaseUnreachable) {
    return (
      <Banner
        className={className}
        description="Signing in, saving changes and sending won't work until it's back. Check that Postgres is running and DATABASE_URL points to it."
        title="Mailquilt can't reach its database"
        variant="error"
      />
    );
  }

  if (error) {
    return (
      <Banner
        className={className}
        description="Check your connection, then reload the page."
        title="The dashboard can't reach the Mailquilt API"
        variant="error"
      />
    );
  }

  return null;
};

/**
 * Whether the API is up and can reach its Postgres database. Says nothing
 * while it is; a problem appears in a live region, so screen readers
 * announce it.
 */
export const HealthStatus = ({
  bannerClassName,
}: {
  bannerClassName?: string;
}) => (
  <output aria-live="polite" className="block">
    <HealthProblem className={bannerClassName} />
  </output>
);
