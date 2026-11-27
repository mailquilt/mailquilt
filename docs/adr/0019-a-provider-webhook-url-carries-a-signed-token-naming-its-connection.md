# A Provider webhook's URL carries a signed token naming its connection

SES reports bounces and complaints through an SNS topic the member owns, which posts each one to a URL on the install (#19). SNS signs every message, but its signature only proves that SNS sent it, not whose topic it came from: anyone with an AWS account can subscribe a URL to a topic of their own and publish messages SNS will sign. So the URL itself has to say which Provider Connection a message is for, in a way nobody else can make.

Each SES Provider Connection's notifications URL is `/api/webhooks/ses?token=…`. The token is a `SignedTokens` token (ADR 0016) for the purpose `ses-notifications`. Its payload is the Organization's ID and the connection's ID, and it has no expiry. A member reads the URL from the API (`sesNotificationsUrl`) and gives it to their topic's subscription. A message is acted on only when all of these hold:

- the token verifies, and names an SES connection that still exists in its Organization;
- SNS's signature verifies, with the certificate at `SigningCertURL`, which must be HTTPS on `sns.<region>.amazonaws.com`;
- SNS first sent it less than an hour ago, since SNS stops retrying an HTTP delivery within an hour;
- the Organization hasn't recorded its SNS `MessageId` in that hour.

A bounce or complaint then acts only on an email the Organization sent, found by the message ID SES gave it. An unknown message ID is answered 200 and ignored. The token is the only check of whose message it is, as an unsubscribe link's token is the only check of whose link it is: the route provides that Organization to the repository, as the unsubscribe page does.

The signing certificate and the subscription's `SubscribeURL` are fetched through the outbound guard (ADR 0010), with redirects not followed, a 10-second timeout and a 16 KB limit, and a certificate is kept once read. Both are on SNS's own host, which only AWS's DNS answers for, so the fetch connects by name after the check, as SMTP does on Workers.

## Considered Options

- **The connection's ID in the path, and the member enters their topic's ARN:** this is AWS's own advice. But it needs a field, a migration and a form, and an ARN typed wrong silently drops every bounce.
- **The connection's ID in the path, and the first topic confirmed is kept:** no member input. But whoever confirms a subscription first wins, and moving to a new topic needs a reset.
- **The connection's ID in the path and nothing else:** acting only on message IDs the Organization sent limits a stranger's topic to emails whose message IDs they know, which a recipient sees in their own copy's headers. That's still a way to fake feedback about any email anyone forwards them.
- **A random secret stored on the connection:** as strong, but a column and a migration for what a signed token gives without either.
- **Any `amazonaws.com` host for the certificate:** anyone can serve a file from an S3 bucket at `<bucket>.s3.amazonaws.com`, and so sign their own messages.

## Consequences

- The URL is a secret, as an unsubscribe link is: anyone who has it can post messages SNS signed to it, from any topic. A member who leaks it can only delete the connection and make a new one, since the token doesn't change. Even then, such messages act only on emails the Organization sent.
- Removing the key version a URL was signed with from `ENCRYPTION_KEYS` breaks the URL, and bounces stop arriving until the member gives the topic the new one.
- A route that changes data without a session takes its Organization from a signed token. Later Provider webhooks (P2), and bounce addresses (#21), follow this pattern with their own purposes.
- Feedback about emails sent outside Mailquilt through the same SES account, such as by another app, suppresses no one here.
- A Suppression from a bounce or complaint keeps any Suppression the address already has, and its reason, as adding one by hand does (#14).
