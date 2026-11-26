import {
  CampaignNotDraft,
  CampaignNotFound,
  ContactAlreadyExists,
  ContactNotFound,
  CredentialsRequired,
  DatabaseUnreachable,
  InstanceAdminRequired,
  ListNotFound,
  NoSubscribedContacts,
  OrganizationNotFound,
  ProviderConnectionNotFound,
  RateLimited,
  SendFailed,
  SetupClosed,
  SignInRequired,
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

export const NoSubscribedContactsError = NoSubscribedContacts.pipe(
  HttpApiSchema.status(409)
);

export const DatabaseUnreachableError = DatabaseUnreachable.pipe(
  HttpApiSchema.status(503)
);
