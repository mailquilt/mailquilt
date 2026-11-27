# Mailquilt

Mailquilt is an open-source email platform for newsletters, automations and transactional email. It provides the interface and logic; every email is delivered through a sending service the customer connects themselves.

## Language

### Tenancy

**Organization**: The top-level tenant that owns all Contacts, content, Provider Connections and settings; users act inside it as members. _Avoid_: Workspace, account, team, brand, client

**Member**: A user's place in one Organization, with a role: owner, admin or member. Whoever creates an Organization is its owner. _Avoid_: Seat, user (for the membership), teammate

**Instance admin**: The person who runs a Mailquilt install and manages its settings, such as the System Mailer and who may sign up; first-run setup makes them. Being one gives no access to any Organization's data. _Avoid_: Site admin, root

### Audience

**Contact**: One person, identified by one email address, within an Organization. _Avoid_: Subscriber, recipient, member, lead

**List**: A named group that Contacts can join and leave, representing what they agreed to receive. _Avoid_: Audience, group, mailing list

**Subscription**: A Contact's membership in one List, carrying its own status (pending, subscribed, unsubscribed). _Avoid_: List membership, opt-in

**Opt-out**: A Contact's refusal of all marketing email from the Organization, which blocks every Campaign and Automation but not Transactional Messages, and which only the Contact can lift. _Avoid_: Global unsubscribe, unsubscribe all, do-not-email

**Tag**: A label on a Contact recording something known about them, with no consent meaning. _Avoid_: Label, category, group

**Segment**: A saved rule over Contacts (fields, Tags, Subscriptions, activity) whose members are worked out at the moment it is used. _Avoid_: Filter, view, smart list

**Suppression**: An Organization-wide block on an email address (from a hard bounce, a complaint or a manual action) that overrides every Subscription. _Avoid_: Blocklist, blacklist, unsubscribe

### Content and sending

**Campaign**: One email, holding its own copy of its content, sent once to a chosen set of Lists and Segments, immediately or at a scheduled time. _Avoid_: Newsletter, broadcast, blast, issue

**Transactional Message**: One email sent through the API to one Contact from a Template; it ignores Subscriptions but respects bounce and complaint Suppressions. _Avoid_: Transactional email, notification, triggered email

**Template**: A reusable email design that a Campaign or other message starts from. _Avoid_: Layout, theme

### Delivery

**Provider**: A kind of external email sending service Mailquilt can deliver through, such as SES, SMTP or Cloudflare Email. _Avoid_: ESP, integration, mailer, transport

**Provider Connection**: One Organization's configured credentials for a Provider. _Avoid_: Integration, account, sender

**Sending Domain**: A domain an Organization sends email from, whose DNS authentication (SPF, DKIM, DMARC) Mailquilt checks, with the DKIM selectors its Provider signs under and, optionally, the return path its Provider sends bounces to. A Campaign is sent only from an address at one that passes DKIM and DMARC. _Avoid_: Sender domain, verified domain, identity

**System Mailer**: The sending setup Mailquilt uses for its own account emails (sign-in links, invitations, receipts), separate from every Organization's Provider Connections. _Avoid_: System SMTP, platform sender, internal mailer

**Integration**: A connection to an outside system for anything other than sending email, such as Zapier, Stripe or Ghost. _Avoid_: Plugin, app, connector
