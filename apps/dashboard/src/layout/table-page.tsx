/**
 * A signed-in page built around a table: its heading, what it holds and its
 * main actions above, and the table below at full width, beside the sidebar.
 * On phones the actions go full width under the heading.
 */
export const TablePage = ({
  actions,
  children,
  description,
  title,
}: {
  actions?: React.ReactNode;
  children: React.ReactNode;
  description: string;
  title: string;
}) => (
  <div className="mx-auto w-full max-w-[80rem] px-4 pt-6 pb-12 sm:px-6 md:px-10 md:pt-10">
    <header className="mb-5 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="font-display text-display font-semibold text-kumo-strong">
          {title}
        </h1>
        <p className="max-w-[40rem] text-base text-(--mq-body)">
          {description}
        </p>
      </div>
      {actions === undefined ? null : (
        <div className="flex shrink-0 gap-2 max-sm:*:flex-1 max-sm:*:justify-center">
          {actions}
        </div>
      )}
    </header>
    {children}
  </div>
);
