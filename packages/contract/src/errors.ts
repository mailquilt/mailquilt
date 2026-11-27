import {
  CampaignNotDraft,
  CampaignNotFound,
  CampaignNotSending,
  ContactAlreadyExists,
  ContactNotFound,
  CredentialsRequired,
  DatabaseUnreachable,
  InstanceAdminRequired,
  ListNotFound,
  NoSubscribedContacts,
  OrganizationNotFound,
  PostalAddressRequired,
  ProviderConnectionNotFound,
  RateLimited,
  ScheduleInPast,
  SendFailed,
  SetupClosed,
  SignInRequired,
  SuppressionNotFound,
  SuppressionNotRemovable,
  SystemMailerFromEnvironment,
} from "@repo/domain";
import { HttpApiSchema } from "effect/http-api";

/** No valid session, or a write from another site's page. */
export const SignInRequiredError = SignInRequired.pipe(
  HttpApiSchema.status(401)
);

/** The Organization doesn't exist, or the person asking isn't a member. */
export const OrganizationNotFoundError = OrganizationNotFound.pipe(
  HttpApiSchema.status(404)
);

export const InstanceAdminRequiredError = InstanceAdminRequired.pipe(
  HttpApiSchema.status(403)
);

export const SetupClosedError = SetupClosed.pipe(HttpApiSchema.status(409));

export const SystemMailerFromEnvironmentError =
  SystemMailerFromEnvironment.pipe(HttpApiSchema.status(409));

export const CredentialsRequiredError = CredentialsRequired.pipe(
  HttpApiSchema.status(422)
);

export const ContactNotFoundError = ContactNotFound.pipe(
  HttpApiSchema.status(404)
);

export const ContactAlreadyExistsError = ContactAlreadyExists.pipe(
  HttpApiSchema.status(409)
);

export const ListNotFoundError = ListNotFound.pipe(HttpApiSchema.status(404));

export const ProviderConnectionNotFoundError = ProviderConnectionNotFound.pipe(
  HttpApiSchema.status(404)
);

export const SendFailedError = SendFailed.pipe(HttpApiSchema.status(502));

export const RateLimitedError = RateLimited.pipe(HttpApiSchema.status(429));

export const CampaignNotFoundError = CampaignNotFound.pipe(
  HttpApiSchema.status(404)
);

export const CampaignNotDraftError = CampaignNotDraft.pipe(
  HttpApiSchema.status(409)
);

/** The Campaign isn't sending, so it can't be paused, resumed or cancelled. */
export const CampaignNotSendingError = CampaignNotSending.pipe(
  HttpApiSchema.status(409)
);

/** Every Campaign ends with the Organization's postal address, and it has none yet. */
export const PostalAddressRequiredError = PostalAddressRequired.pipe(
  HttpApiSchema.status(409)
);

export const NoSubscribedContactsError = NoSubscribedContacts.pipe(
  HttpApiSchema.status(409)
);

/** A Campaign can only be scheduled for a time still to come. */
export const ScheduleInPastError = ScheduleInPast.pipe(
  HttpApiSchema.status(422)
);

export const DatabaseUnreachableError = DatabaseUnreachable.pipe(
  HttpApiSchema.status(503)
);

export const SuppressionNotFoundError = SuppressionNotFound.pipe(
  HttpApiSchema.status(404)
);

/** Only a Suppression a member added can be removed, not one from a bounce or complaint. */
export const SuppressionNotRemovableError = SuppressionNotRemovable.pipe(
  HttpApiSchema.status(409)
);
