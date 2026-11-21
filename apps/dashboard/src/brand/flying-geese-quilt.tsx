const WIDTH = 840;
const HEIGHT = 900;
const SASHING = 56;
const GOOSE_WIDTH = 152;
const GOOSE_HEIGHT = 76;
const COLUMNS = 4;
const THREAD_COLUMN = 2;
const GOOSE_ROWS = Math.ceil(HEIGHT / GOOSE_HEIGHT) + 1;
const LIFT_STEP_MS = 55;

const columnX = (column: number) =>
  SASHING * (column + 1) + GOOSE_WIDTH * column;

const Goose = ({ column, row }: { column: number; row: number }) => {
  const x = columnX(column);
  const y = row * GOOSE_HEIGHT - GOOSE_HEIGHT / 2;
  const points = `${x},${y + GOOSE_HEIGHT} ${x + GOOSE_WIDTH / 2},${y} ${x + GOOSE_WIDTH},${y + GOOSE_HEIGHT}`;

  if (column === THREAD_COLUMN) {
    const fromBottom = GOOSE_ROWS - 1 - row;

    // SAFETY: React passes custom properties through `style`; its type only lists standard ones.
    const delay = {
      "--mq-goose-delay": `${fromBottom * LIFT_STEP_MS}ms`,
    } as React.CSSProperties;

    return (
      <polygon className="mq-goose-thread" points={points} style={delay} />
    );
  }

  return (
    <polygon
      className={
        row % 2 === 0
          ? "fill-(--mq-quilt-goose-alt)"
          : "fill-(--mq-quilt-goose)"
      }
      points={points}
    />
  );
};

const Column = ({ column }: { column: number }) => {
  const x = columnX(column);

  return (
    <g>
      <rect
        className="fill-(--mq-quilt-sky)"
        height={HEIGHT}
        width={GOOSE_WIDTH}
        x={x}
        y={0}
      />
      {Array.from({ length: GOOSE_ROWS }, (_, row) => (
        <Goose column={column} key={row} row={row} />
      ))}
      <line
        className="stroke-white/7"
        strokeDasharray="4 4"
        x1={x - 0.5}
        x2={x - 0.5}
        y1={0}
        y2={HEIGHT}
      />
      <line
        className="stroke-white/7"
        strokeDasharray="4 4"
        x1={x + GOOSE_WIDTH + 0.5}
        x2={x + GOOSE_WIDTH + 0.5}
        y1={0}
        y2={HEIGHT}
      />
    </g>
  );
};

/**
 * An Amish-style Flying Geese quilt: columns of geese between plain sashing.
 * A goose is the logo's envelope flap; the orange column is a campaign going
 * out, and it lights up from the bottom once when the page opens.
 */
export const FlyingGeeseQuilt = ({ className }: { className?: string }) => (
  <svg
    aria-hidden="true"
    className={className}
    focusable="false"
    preserveAspectRatio="xMinYMid slice"
    viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
  >
    <rect className="fill-(--mq-quilt-sashing)" height={HEIGHT} width={WIDTH} />
    {Array.from({ length: COLUMNS }, (_, column) => (
      <Column column={column} key={column} />
    ))}
  </svg>
);
