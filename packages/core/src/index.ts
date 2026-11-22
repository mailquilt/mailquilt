export { Contacts, createContact, listContacts } from "./contacts.ts";

export type { ContactFilter } from "./contacts.ts";

export { checkHealth, DatabaseHealth } from "./health.ts";

export { addToList, createList, getList, Lists, listLists } from "./lists.ts";

export {
  asMemberOf,
  createOrganization,
  getOrganization,
  listOrganizations,
  Organizations,
} from "./organizations.ts";

export {
  CredentialCipher,
  credentialCipherLayer,
} from "./credential-cipher.ts";

export { CredentialsUnreadable } from "./credentials-unreadable.ts";

export type { SealedSecret } from "./credential-cipher.ts";

export { HostNotFound } from "./host-not-found.ts";

export { InvalidNotification } from "./invalid-notification.ts";

export { OutboundBlocked } from "./outbound-blocked.ts";

export {
  classifyAddress,
  OutboundGuard,
  outboundGuardLayer,
} from "./outbound-guard.ts";

export type { AddressClass } from "./outbound-guard.ts";

export { SmtpProvider } from "./provider.ts";

export type {
  DeliveryNotification,
  NotificationRequest,
  OutgoingEmail,
  Provider,
  SentEmail,
  SmtpSettings,
} from "./provider.ts";

export {
  createProviderConnection,
  listProviderConnections,
  ProviderConnections,
  sendTestEmail,
  TEST_EMAIL_SUBJECT,
} from "./provider-connections.ts";

export type {
  NewProviderConnection,
  ProviderConnectionWithCredentials,
} from "./provider-connections.ts";

export { RateLimiter } from "./rate-limiter.ts";

export type { RateLimitDecision, RateLimitRule } from "./rate-limiter.ts";

export { CurrentOrganization } from "./current-organization.ts";

export { CurrentUser } from "./current-user.ts";

export {
  sendEmailVerification,
  SystemMailer,
  SystemMailerNotConfigured,
} from "./system-mailer.ts";

export type { SystemEmail } from "./system-mailer.ts";
