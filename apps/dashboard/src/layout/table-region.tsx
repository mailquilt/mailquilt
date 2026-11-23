import { LayerCard } from "@cloudflare/kumo";
import { useEffect, useState } from "react";

/**
 * A table's place on the page. `bordered` sets it in Kumo's `LayerCard`,
 * lined up with the page header, its cells inset to the card and `footer`
 * (the pager) at its foot under a hairline; without it, the region sits
 * open on the page, as a one-column page's states do. `busy` dims the rows
 * under a moving line while the next ones load, so the table never empties
 * and refills. An empty or didn't-load state takes the rows' place, inside
 * the same card.
 */
export const TableRegion = ({
  bordered = false,
  busy = false,
  children,
  footer,
  label,
}: {
  bordered?: boolean;
  busy?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
  label: string;
}) => {
  const content = (
    <>
      {busy ? <span aria-hidden="true" className="mq-busy-line" /> : null}
      <div
        className={`transition-opacity duration-150 motion-reduce:transition-none ${busy ? "opacity-50" : ""}`}
      >
        {children}
      </div>
      {footer === undefined ? null : (
        <div className="mq-table-foot">{footer}</div>
      )}
    </>
  );

  return bordered ? (
    <LayerCard
      aria-busy={busy}
      aria-label={label}
      className="mq-table-card relative"
      render={<section />}
    >
      {content}
    </LayerCard>
  ) : (
    <section aria-busy={busy} aria-label={label} className="mq-bleed relative">
      {content}
    </section>
  );
};

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
