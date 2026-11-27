import { Breadcrumbs } from "@cloudflare/kumo";
import { Fragment } from "react";

/**
 * A signed-in page's header: the way back when the page sits under another
 * (`crumbs`), a two-tone display title like the wordmark
 * (what it is in ink, `titleDetail` such as a count in quilt grey), one
 * sentence, and the page's actions on the right. On phones the actions go
 * full width under the sentence, sharing the row equally; when their labels
 * don't fit side by side, as with three on a 320px phone, the last moves to
 * a row of its own rather than wrap its label. A long title, such as a Campaign's subject,
 * can run up to the actions (`titleRunsToActions`) rather than wrap at the
 * sentence's measure.
 */
export const PageHeader = ({
  actions,
  crumbs,
  description,
  title,
  titleDetail,
  titleRunsToActions = false,
}: {
  actions?: React.ReactNode;
  /** The pages above this one, such as Providers above "Connect an SMTP server". */
  crumbs?: readonly { readonly href: string; readonly label: string }[];
  description: React.ReactNode;
  title: string;
  titleDetail?: React.ReactNode;
  titleRunsToActions?: boolean;
}) => (
  <header className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 max-sm:mb-5">
    {crumbs === undefined ? null : (
      <Breadcrumbs className="mq-crumbs -mb-0.5 w-full" size="sm">
        {crumbs.map((crumb) => (
          <Fragment key={crumb.href}>
            <Breadcrumbs.Link href={crumb.href}>{crumb.label}</Breadcrumbs.Link>
            <Breadcrumbs.Separator />
          </Fragment>
        ))}
        <Breadcrumbs.Current>{title}</Breadcrumbs.Current>
      </Breadcrumbs>
    )}
    <div
      className={`flex min-w-0 flex-col gap-2 ${titleRunsToActions ? "flex-1 basis-[24rem]" : "max-w-[60ch]"}`}
    >
      <h1 className="font-display text-display font-semibold text-balance break-words text-kumo-strong max-sm:text-2xl max-sm:leading-7.5">
        {title}
        {titleDetail === undefined ? null : (
          <span className="mq-tone">
            <span className="sr-only">, </span> {titleDetail}
          </span>
        )}
      </h1>
      <p className="text-base text-pretty break-words text-(--mq-body)">
        {description}
      </p>
    </div>
    {actions === undefined ? null : (
      <div className="flex flex-wrap gap-2 max-sm:w-full max-sm:*:min-w-fit max-sm:*:flex-1 max-sm:*:justify-center max-sm:*:whitespace-nowrap">
        {actions}
      </div>
    )}
  </header>
);
