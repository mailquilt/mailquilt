import { LoadFailed } from "../layout/empty-state.tsx";
import { useOrganizationsStatus } from "./organizations.tsx";

/**
 * The page area when the Organizations list couldn't be loaded, drawn as
 * every other "didn't load" state is, centred where the page's loader was so
 * nothing jumps. The sidebar and account menu stay usable, and the list also
 * retries by itself when the connection returns or the tab regains focus.
 */
export const OrganizationsUnavailable = () => {
  const { retry, retrying } = useOrganizationsStatus();

  return (
    <div className="mq-page-body absolute inset-0 flex items-center justify-center">
      <LoadFailed
        description="Nothing in your account has changed. Check your connection, then try again."
        onRetry={retry}
        retrying={retrying}
        title="Your organizations didn’t load"
      />
    </div>
  );
};
