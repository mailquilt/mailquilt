import { Button } from "@cloudflare/kumo";
import { WarningCircleIcon } from "@phosphor-icons/react";

/**
 * The frame every table sits in: an optional toolbar row above, the table or
 * a state in place of it, and an optional footer, such as paging. `busy` dims
 * the rows and runs a line under the toolbar while the next rows load, so
 * the table keeps its place instead of emptying. `toolbarTinted` fills the
 * toolbar row, edge to edge, such as while rows are selected.
 */
export const TableCard = ({
  busy = false,
  children,
  footer,
  toolbar,
  toolbarTinted = false,
}: {
  busy?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
  toolbar?: React.ReactNode;
  toolbarTinted?: boolean;
}) => (
  <section
    aria-busy={busy}
    className="relative overflow-hidden rounded-xl border border-kumo-fill bg-kumo-base"
  >
    {toolbar === undefined ? null : (
      <div
        className={`flex min-h-14 flex-wrap items-center gap-2 border-b border-kumo-fill px-3 py-2.5 ${toolbarTinted ? "bg-kumo-tint" : ""}`}
      >
        {toolbar}
      </div>
    )}
    {busy ? (
      <span
        aria-hidden="true"
        className="absolute inset-x-0 z-2 h-0.5 animate-pulse bg-kumo-brand motion-reduce:animate-none"
      />
    ) : null}
    <div
      className={
        busy
          ? "opacity-45 transition-opacity motion-reduce:transition-none"
          : ""
      }
    >
      {children}
    </div>
    {footer === undefined ? null : (
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-kumo-fill py-2.5 pr-3 pl-4 text-sm text-kumo-subtle">
        {footer}
      </div>
    )}
  </section>
);

const PatchMissingItsLastPiece = () => (
  <span aria-hidden="true" className="grid size-10 grid-cols-2 gap-1">
    <span className="rounded-quilt bg-(--mq-patch-pale)" />
    <span className="rounded-quilt bg-(--mq-patch-pale)" />
    <span className="rounded-quilt bg-(--mq-patch-pale)" />
    <span className="rounded-quilt-slot border-2 border-dashed border-(--mq-logo-slot)" />
  </span>
);

/** In place of a table with no rows: what's missing and what to do next. */
export const TableEmpty = ({
  actions,
  description,
  title,
}: {
  actions?: React.ReactNode;
  description: string;
  title: string;
}) => (
  <div className="flex flex-col items-center px-6 py-16 text-center">
    <PatchMissingItsLastPiece />
    <h2 className="mt-4 text-lg font-semibold text-kumo-strong">{title}</h2>
    <p className="mt-1.5 max-w-[28rem] text-base text-balance text-(--mq-body)">
      {description}
    </p>
    {actions === undefined ? null : (
      <div className="mt-5 flex flex-wrap justify-center gap-2">{actions}</div>
    )}
  </div>
);

/** In place of a table whose rows didn't load, with Try again. */
export const TableLoadFailed = ({
  onRetry,
  retrying,
  title,
}: {
  onRetry: () => void;
  retrying: boolean;
  title: string;
}) => (
  <div
    className="flex flex-col items-center px-6 py-16 text-center"
    role="alert"
  >
    <WarningCircleIcon aria-hidden="true" className="size-7 text-kumo-danger" />
    <h2 className="mt-3 text-lg font-semibold text-kumo-strong">{title}</h2>
    <p className="mt-1.5 max-w-[28rem] text-base text-balance text-(--mq-body)">
      Mailquilt couldn’t reach the server. Check your connection, then try
      again.
    </p>
    <Button
      className="mt-5"
      loading={retrying}
      onClick={onRetry}
      variant="primary"
    >
      {retrying ? "Trying again…" : "Try again"}
    </Button>
  </div>
);
