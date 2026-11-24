import { LinkButton } from "@cloudflare/kumo";
import type { CampaignId, Organization } from "@repo/domain";
import { useNavigate } from "@tanstack/react-router";
import { Predicate } from "effect";

import { useLists } from "../audience/audience-api.ts";
import { EmptyState, LoadFailed } from "../layout/empty-state.tsx";
import { PageFrame } from "../layout/page-frame.tsx";
import { PageHeader } from "../layout/page-header.tsx";
import { PageAreaLoading } from "../layout/page-states.tsx";
import { TableRegion } from "../layout/table-region.tsx";
import { useConfirmationToast } from "../layout/toast.tsx";
import { useProviderConnections } from "../providers/providers-api.ts";
import { CampaignForm } from "./campaign-form.tsx";
import { CampaignSetupNeeded, isReadyToWrite } from "./campaign-setup.tsx";
import {
  useCampaign,
  useCreateCampaign,
  useUpdateCampaign,
} from "./campaigns-api.ts";

interface Crumb {
  readonly href: string;
  readonly label: string;
}

const CAMPAIGNS: Crumb = { href: "/campaigns", label: "Campaigns" };

const UNDER_CAMPAIGNS = [CAMPAIGNS] as const;

const FormPage = ({
  children,
  crumbs = UNDER_CAMPAIGNS,
  description,
  title,
}: {
  children: React.ReactNode;
  crumbs?: readonly Crumb[];
  description: string;
  title: string;
}) => (
  <PageFrame>
    <div className="mq-capped">
      <PageHeader crumbs={crumbs} description={description} title={title} />
    </div>
    {children}
  </PageFrame>
);

const InPlaceOfForm = ({ children }: { children: React.ReactNode }) => (
  <div className="mq-capped">
    <TableRegion label="Campaign">{children}</TableRegion>
  </div>
);

const saveFailureMessage = (failure: Error | null, saving: string) => {
  if (failure === null) {
    return;
  }

  if (Predicate.isTagged(failure, "ListNotFound")) {
    return "The list you chose was deleted. Choose another.";
  }

  if (Predicate.isTagged(failure, "ProviderConnectionNotFound")) {
    return "The provider connection you chose was deleted. Choose another.";
  }

  if (Predicate.isTagged(failure, "CampaignNotDraft")) {
    return "This campaign has started sending, so it can’t be changed any more.";
  }

  if (Predicate.isTagged(failure, "CampaignNotFound")) {
    return "This campaign was deleted, so it can’t be saved.";
  }

  return `Mailquilt couldn’t save ${saving}. Check your connection, then try again.`;
};

const useChoices = (organization: Organization) => {
  const lists = useLists(organization.id);
  const connections = useProviderConnections(organization.id);

  const loading = [lists, connections].some(
    (query) => query.isPending && query.errorUpdatedAt === 0
  );

  const refetchDeleted = (failure: Error) => {
    if (Predicate.isTagged(failure, "ListNotFound")) {
      lists.refetch();
    }

    if (Predicate.isTagged(failure, "ProviderConnectionNotFound")) {
      connections.refetch();
    }
  };

  const unavailable = () => {
    if (lists.data === undefined || connections.data === undefined) {
      return (
        <InPlaceOfForm>
          <LoadFailed
            onRetry={() => {
              for (const query of [lists, connections]) {
                if (query.isError) {
                  query.refetch();
                }
              }
            }}
            retrying={lists.isFetching || connections.isFetching}
            title="Your lists and connections didn’t load"
          />
        </InPlaceOfForm>
      );
    }

    if (!isReadyToWrite(connections.data, lists.data)) {
      return (
        <InPlaceOfForm>
          <CampaignSetupNeeded
            connections={connections.data}
            lists={lists.data}
          />
        </InPlaceOfForm>
      );
    }

    return null;
  };

  return {
    connections: connections.data ?? [],
    lists: lists.data ?? [],
    loading,
    refetchDeleted,
    unavailable,
  };
};

/** Writes a new Campaign and saves it as a draft, then opens its page to check and send it. */
export const NewCampaignPage = ({
  organization,
}: {
  organization: Organization;
}) => {
  const choices = useChoices(organization);
  const create = useCreateCampaign(organization.id);
  const navigate = useNavigate();
  const toasts = useConfirmationToast();

  if (choices.loading) {
    return <PageAreaLoading label="Loading the form" />;
  }

  const unavailable = choices.unavailable();

  if (unavailable !== null) {
    return (
      <FormPage
        description="Write the email, choose who gets it, and save it as a draft."
        title="New campaign"
      >
        {unavailable}
      </FormPage>
    );
  }

  return (
    <FormPage
      description="Save it as a draft. You’ll check it and send it from the next page."
      title="New campaign"
    >
      <CampaignForm
        busy={create.isPending}
        busyLabel="Saving draft…"
        cancelHref="/campaigns"
        connections={choices.connections}
        failureMessage={saveFailureMessage(create.error, "the draft")}
        lists={choices.lists}
        onSubmit={(draft) =>
          create.mutate(draft, {
            onError: choices.refetchDeleted,
            onSuccess: (campaign) => {
              toasts.add({ title: "Draft saved" });
              navigate({
                params: { campaignId: campaign.id },
                to: "/campaigns/$campaignId",
              });
            },
          })
        }
        submitLabel="Save draft"
      />
    </FormPage>
  );
};

/** Changes a draft, then goes back to its page. */
export const EditCampaignPage = ({
  campaignId,
  organization,
}: {
  campaignId: CampaignId;
  organization: Organization;
}) => {
  const campaign = useCampaign(organization.id, campaignId);
  const choices = useChoices(organization);
  const update = useUpdateCampaign(organization.id, campaignId);
  const navigate = useNavigate();
  const toasts = useConfirmationToast();

  if (
    choices.loading ||
    (campaign.isPending && campaign.errorUpdatedAt === 0)
  ) {
    return <PageAreaLoading label="Loading the draft" />;
  }

  const draft = campaign.data;
  const ownPage = `/campaigns/${campaignId}`;

  const crumbs =
    draft === undefined || draft === null
      ? UNDER_CAMPAIGNS
      : [CAMPAIGNS, { href: ownPage, label: draft.subject }];

  const body = () => {
    if (draft === undefined) {
      return (
        <InPlaceOfForm>
          <LoadFailed
            onRetry={() => campaign.refetch()}
            retrying={campaign.isFetching}
            title="This draft didn’t load"
          />
        </InPlaceOfForm>
      );
    }

    if (draft === null) {
      return (
        <InPlaceOfForm>
          <EmptyState
            actions={
              <LinkButton href="/campaigns" variant="primary">
                Go to Campaigns
              </LinkButton>
            }
            description={`${organization.name} has no such campaign. It may belong to another organization, or the link is out of date.`}
            title="This campaign isn’t here"
          />
        </InPlaceOfForm>
      );
    }

    if (draft.status !== "draft") {
      return (
        <InPlaceOfForm>
          <EmptyState
            actions={
              <LinkButton href={ownPage} variant="primary">
                Go to the campaign
              </LinkButton>
            }
            description="A campaign can be changed only while it’s a draft. Once it starts sending, it stays as it went out."
            title="This campaign can’t be changed"
          />
        </InPlaceOfForm>
      );
    }

    const unavailable = choices.unavailable();

    if (unavailable !== null) {
      return unavailable;
    }

    return (
      <CampaignForm
        busy={update.isPending}
        busyLabel="Saving changes…"
        campaign={draft}
        cancelHref={ownPage}
        connections={choices.connections}
        failureMessage={saveFailureMessage(update.error, "your changes")}
        lists={choices.lists}
        onSubmit={(changed) =>
          update.mutate(changed, {
            onError: (failure) => {
              choices.refetchDeleted(failure);

              if (Predicate.isTagged(failure, "CampaignNotDraft")) {
                campaign.refetch();
              }
            },
            onSuccess: () => {
              toasts.add({ title: "Changes saved" });
              navigate({
                params: { campaignId },
                to: "/campaigns/$campaignId",
              });
            },
          })
        }
        submitLabel="Save changes"
      />
    );
  };

  return (
    <FormPage
      crumbs={crumbs}
      description="Change what goes out, then check it and send it from its page."
      title="Edit draft"
    >
      {body()}
    </FormPage>
  );
};
