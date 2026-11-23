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
