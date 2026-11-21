import { CheckIcon } from "@phosphor-icons/react";

/** A dashed, stitched slot in the logo's proportions: a piece that isn't there. */
export const QuiltSlot = ({ className }: { className?: string }) => (
  <svg
    aria-hidden="true"
    className={className}
    focusable="false"
    viewBox="0 0 48 48"
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

export type StepState = "done" | "next" | "later";

const BLOCK =
  "flex size-10 items-center justify-center rounded-quilt font-display text-base font-semibold";

/**
 * A setup step as a block of the logo. Done is a solid ink block with a
 * check; next is the orange envelope block lifted off its dashed slot, as in
 * the logo; later is a quiet grey block. Decorative: the step's text says
 * the same in words.
 */
export const StepBlock = ({
  number,
  state,
}: {
  number: number;
  state: StepState;
}) => {
  if (state === "done") {
    return (
      <span
        aria-hidden="true"
        className={`${BLOCK} bg-(--mq-block-ink) text-kumo-inverse`}
      >
        <CheckIcon className="size-5" weight="bold" />
      </span>
    );
  }

  if (state === "next") {
    return (
      <span aria-hidden="true" className="relative block size-10">
        <span className="absolute inset-0 rounded-quilt-slot border-2 border-dashed border-(--mq-logo-slot)" />
        <span
          className={`${BLOCK} absolute inset-0 translate-x-1.5 -translate-y-1.5 bg-(--mq-accent) text-white`}
        >
          {number}
        </span>
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${BLOCK} bg-kumo-tint text-kumo-subtle`}
    >
      {number}
    </span>
  );
};
