import { Breadcrumbs } from "@cloudflare/kumo";
import { Fragment } from "react";

/**
 * A signed-in page's header: the way back when the page sits under another
 * (`crumbs`), a two-tone display title like the wordmark
 * (what it is in ink, `titleDetail` such as a count in quilt grey), one
 * sentence, and the page's actions on the right. On phones the actions go
 * full width under the sentence.
 */
export const PageHeader = ({
  actions,
  crumbs,
  description,
  title,
  titleDetail,
}: {
  actions?: React.ReactNode;
  /** The pages above this one, such as Providers above "Connect an SMTP server". */
  crumbs?: readonly { readonly href: string; readonly label: string }[];
  description: React.ReactNode;
  title: string;
  titleDetail?: React.ReactNode;
}) => (
  <header className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 max-sm:mb-5">
    {crumbs === undefined ? null : (
      <Breadcrumbs className="-mb-0.5 w-full" size="sm">
        {crumbs.map((crumb) => (
          <Fragment key={crumb.href}>
            <Breadcrumbs.Link href={crumb.href}>{crumb.label}</Breadcrumbs.Link>
            <Breadcrumbs.Separator />
          </Fragment>
        ))}
        <Breadcrumbs.Current>{title}</Breadcrumbs.Current>
      </Breadcrumbs>
    )}
    <div className="flex max-w-[60ch] min-w-0 flex-col gap-2">
      <h1 className="font-display text-display font-semibold text-balance text-kumo-strong max-sm:text-2xl max-sm:leading-7.5">
        {title}
        {titleDetail === undefined ? null : (
          <span className="mq-tone">
            <span className="sr-only">, </span> {titleDetail}
          </span>
        )}
      </h1>
      <p className="text-base text-pretty text-(--mq-body)">{description}</p>
    </div>
    {actions === undefined ? null : (
      <div className="flex gap-2 max-sm:w-full max-sm:*:flex-1 max-sm:*:justify-center">
        {actions}
      </div>
    )}
  </header>
);
