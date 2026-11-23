import { Button } from "@cloudflare/kumo";

import { PageFrame } from "../layout/page-frame.tsx";
import { useOrganizationsStatus } from "./organizations.tsx";

/**
 * The page area when the Organizations list couldn't be loaded. It sits where
 * the page's own heading would, so the sidebar and account menu stay usable,
 * and the page fills in from the same place once Try again works. The list
 * also retries by itself when the connection returns or the tab regains
 * focus.
 */
export const OrganizationsUnavailable = () => {
  const { retry, retrying } = useOrganizationsStatus();

  return (
    <PageFrame>
      <div className="mq-capped">
        <div className="flex max-w-[34rem] flex-col gap-3" role="alert">
          <h1 className="font-display text-display font-semibold text-balance text-kumo-strong">
            Your organizations didn’t load
          </h1>
          <p className="text-base text-(--mq-body)">
            Nothing in your account has changed. Check your connection, then try
            again.
          </p>
        </div>
        <Button
          aria-disabled={retrying || undefined}
          className="mt-6"
          onClick={() => {
            if (!retrying) {
              retry();
            }
          }}
          variant="primary"
        >
          {retrying ? "Trying again…" : "Try again"}
        </Button>
      </div>
    </PageFrame>
  );
};
