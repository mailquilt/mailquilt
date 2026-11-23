import { Button, Empty } from "@cloudflare/kumo";

const EmptyArt = () => (
  <svg
    aria-hidden="true"
    focusable="false"
    height="64"
    viewBox="-4 -8 116 116"
    width="64"
  >
    {(
      [
        [1.5, 13.5],
        [1.5, 65.5],
        [53.5, 65.5],
        [53.5, 13.5],
      ] as const
    ).map(([x, y]) => (
      <rect
        className="stroke-(--mq-logo-slot)"
        fill="none"
        height="41"
        key={`${x}-${y}`}
        rx="5"
        strokeDasharray="6 4.36"
        strokeWidth="3"
        width="41"
        x={x}
        y={y}
      />
    ))}
    <rect
      className="fill-(--mq-accent)"
      height="44"
      rx="6"
      width="44"
      x="61"
      y="3"
    />
    <polyline
      className="stroke-white"
      fill="none"
      points="68,11 83,24 98,11"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="4.5"
    />
  </svg>
);

/** One dashed slot: a piece that isn't there. */
export const SlotArt = ({ size = 48 }: { size?: number }) => (
  <svg
    aria-hidden="true"
    focusable="false"
    height={size}
    viewBox="0 0 48 48"
    width={size}
  >
    <rect
      className="stroke-(--mq-logo-slot)"
      fill="none"
      height="41"
      rx="5"
      strokeDasharray="6 4.36"
      strokeWidth="3"
      width="41"
      x="3.5"
      y="3.5"
    />
  </svg>
);

/**
 * In place of rows or content that isn't there yet, on every page: Kumo's
 * Empty without its box, the quilt picture, what's missing and at most the
 * actions to fill it.
 */
export const EmptyState = ({
  actions,
  description,
  title,
}: {
  actions?: React.ReactNode;
  description: string;
  title: string;
}) => (
  <div className="mq-state">
    <Empty
      contents={
        actions === undefined ? undefined : (
          <div className="flex flex-wrap justify-center gap-2">{actions}</div>
        )
      }
      description={description}
      icon={<EmptyArt />}
      title={title}
    />
  </div>
);

/**
 * In place of what couldn't be loaded, with Try again. The button keeps
 * keyboard focus while it retries: Kumo's loading Button disables itself,
 * which drops focus to the page, so this one says it's busy and changes its
 * label instead.
 */
export const LoadFailed = ({
  description = "Mailquilt couldn’t reach its server. Check your connection, then try again.",
  onRetry,
  retrying,
  title,
}: {
  description?: string;
  onRetry: () => void;
  retrying: boolean;
  title: string;
}) => (
  <div className="mq-state" role="alert">
    <Empty
      contents={
        <Button
          aria-disabled={retrying || undefined}
          onClick={() => {
            if (!retrying) {
              onRetry();
            }
          }}
          variant="secondary"
        >
          {retrying ? "Trying again…" : "Try again"}
        </Button>
      }
      description={description}
      icon={<SlotArt />}
      title={title}
    />
  </div>
);

/**
 * The loader: a patch whose four blocks fill in turn. It shows only after
 * 300ms, so a quick answer never flashes it.
 */
export const PatchLoader = () => (
  <span aria-hidden="true" className="mq-loader mq-loader-patch">
    <i />
    <i />
    <i />
    <i />
  </span>
);
