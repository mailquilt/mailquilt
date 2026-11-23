import { useEffect, useState } from "react";

/**
 * A table's place on the page: edge to edge inside the page block, with no
 * card, its first and last columns on the page's gutter. `busy` dims the
 * rows under a moving line while the next ones load, so the table never
 * empties and refills. An empty, didn't-load or loading state in place of
 * the rows sits under the same line the header would.
 */
export const TableRegion = ({
  busy = false,
  children,
  label,
}: {
  busy?: boolean;
  children: React.ReactNode;
  label: string;
}) => (
  <section
    aria-busy={busy}
    aria-label={label}
    className="mq-bleed mq-region-state relative"
  >
    {busy ? <span aria-hidden="true" className="mq-busy-line" /> : null}
    <div
      className={`transition-opacity duration-150 motion-reduce:transition-none ${busy ? "opacity-50" : ""}`}
    >
      {children}
    </div>
  </section>
);

/** The row above a table: its filters. It stays put while rows are selected. */
export const Toolbar = ({ children }: { children: React.ReactNode }) => (
  <div className="mq-toolbar mb-3 flex min-h-9 flex-wrap items-center gap-2">
    {children}
  </div>
);

/**
 * What to do with the selected rows: an ink bar floating at the foot of the
 * page, so the filters and the rows never move. It rises in as the first
 * row is ticked and drops away when the selection is cleared, staying
 * mounted, inert, for its 160ms exit.
 */
export const SelectionBar = ({
  actions,
  count,
  label,
  onClear,
}: {
  actions: React.ReactNode;
  count: number;
  label: string;
  onClear: () => void;
}) => {
  const shown = count > 0;
  const [present, setPresent] = useState(shown);
  const [lastCount, setLastCount] = useState(count);

  if (shown && count !== lastCount) {
    setLastCount(count);
  }

  useEffect(() => {
    if (shown) {
      const frame = requestAnimationFrame(() => setPresent(true));

      return () => cancelAnimationFrame(frame);
    }

    const timer = setTimeout(() => setPresent(false), 200);

    return () => clearTimeout(timer);
  }, [shown]);

  if (!(shown || present)) {
    return null;
  }

  return (
    <section
      aria-label={label}
      className="mq-selbar"
      data-leaving={shown ? undefined : ""}
      inert={!shown}
    >
      <span aria-live="polite" className="mq-selbar-count">
        {shown ? count : lastCount} selected
      </span>
      {actions}
      <span aria-hidden="true" className="mq-selbar-sep" />
      <button className="mq-selbar-button" onClick={onClear} type="button">
        Clear<span className="sr-only"> selection</span>
      </button>
    </section>
  );
};
