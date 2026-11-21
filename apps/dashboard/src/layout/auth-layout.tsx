import { Link } from "@tanstack/react-router";

import { FlyingGeeseQuilt } from "../brand/flying-geese-quilt.tsx";
import { MailquiltLogo } from "../brand/logo.tsx";
import { HealthStatus } from "../health/health-status.tsx";

const REPOSITORY_URL = "https://github.com/mailquilt/mailquilt";

const CostLabelAtSesListPrice = () => (
  <figure className="relative max-w-[26rem] rounded-quilt-label bg-kumo-base px-8 pt-7 pb-7 shadow-quilt-label">
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-[7px] rounded-xs border-2 border-dashed border-(--mq-seam)"
    />
    <p className="mb-3.5 font-display text-display font-semibold text-kumo-strong">
      12,480 contacts.
      <br />
      One campaign.
      <br />
      <span className="text-(--mq-accent-text)">$1.25 to send it.</span>
    </p>
    <figcaption className="text-base text-(--mq-body)">
      Sent through your own Amazon SES at its list price of $0.10 per 1,000
      emails. Mailquilt never charges per contact.
    </figcaption>
  </figure>
);

/**
 * Every signed-out page: the form on the left, and the Flying Geese quilt on
 * the right with the cost label sewn on. Phones get a band of the quilt.
 */
export const AuthLayout = ({ children }: { children: React.ReactNode }) => (
  <div className="grid min-h-svh grid-rows-[auto_minmax(0,1fr)] bg-kumo-base lg:grid-cols-2 lg:grid-rows-1 xl:grid-cols-[minmax(0,37.5rem)_minmax(0,1fr)]">
    <FlyingGeeseQuilt className="h-20 w-full lg:hidden" />
    <div className="flex flex-col px-6 pt-10 pb-8 lg:px-18 lg:pt-12">
      <div className="mx-auto flex w-full max-w-auth-form flex-1 flex-col lg:mx-0">
        <header>
          <Link
            aria-label="Mailquilt home"
            className="inline-block rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-kumo-focus"
            to="/"
          >
            <MailquiltLogo className="h-7 w-auto" />
          </Link>
        </header>
        <main className="flex flex-1 items-start pt-14 pb-14 lg:items-center lg:py-12">
          <div className="w-full">
            <HealthStatus bannerClassName="mb-8" />
            {children}
          </div>
        </main>
        <footer className="text-base text-kumo-subtle">
          Mailquilt is open source.{" "}
          <a
            className="underline decoration-kumo-hairline underline-offset-4 hover:text-kumo-strong"
            href={REPOSITORY_URL}
            rel="noopener noreferrer"
            target="_blank"
          >
            Read the code on GitHub
          </a>
        </footer>
      </div>
    </div>
    <aside className="relative hidden overflow-hidden lg:block">
      <FlyingGeeseQuilt className="absolute inset-0 size-full" />
      <div className="absolute right-10 bottom-14 left-10">
        <CostLabelAtSesListPrice />
      </div>
    </aside>
  </div>
);

/** The heading on every auth screen, in the display face. */
export const AuthHeading = ({
  children,
  description,
}: {
  children: React.ReactNode;
  description?: React.ReactNode;
}) => (
  <div className="mb-9 flex flex-col gap-3">
    <h1 className="font-display text-display-lg font-semibold text-balance text-kumo-strong">
      {children}
    </h1>
    {description ? (
      <p className="text-base text-kumo-subtle">{description}</p>
    ) : null}
  </div>
);
