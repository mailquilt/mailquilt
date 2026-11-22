import { LinkButton } from "@cloudflare/kumo";

import { PageColumn } from "../layout/page-column.tsx";

/** In place of an audience page before the person has an Organization. */
export const NeedsOrganization = ({ title }: { title: string }) => (
  <PageColumn>
    <div className="flex max-w-[34rem] flex-col gap-3">
      <h1 className="font-display text-display font-semibold text-kumo-strong">
        {title}
      </h1>
      <p className="text-base text-(--mq-body)">
        Contacts and lists belong to an organization. Name yours on Home first.
      </p>
    </div>
    <LinkButton className="mt-6" href="/" variant="primary">
      Go to Home
    </LinkButton>
  </PageColumn>
);
